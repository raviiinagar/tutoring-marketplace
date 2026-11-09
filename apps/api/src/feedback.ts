import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import sharp from "sharp";
import { z } from "zod";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import type { Config } from "./config.js";
import type { EvidenceScanner } from "./evidence-scanner.js";
import { ApiProblem } from "./errors.js";
import { encrypt, decrypt } from "./security.js";

// Beta feedback and the suggestion board (ADR0016). Bugs and UI/UX reports stay
// private to their author and Support staff; suggestions and feature requests
// are listed on the signed-in board straight away, without the author.
export const feedbackCategories = ["BUG", "SUGGESTION", "FEATURE_REQUEST", "UI_UX"] as const;
export const feedbackStatuses = ["NEW", "REVIEWING", "IN_PROGRESS", "RESOLVED"] as const;
export const feedbackPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const publicCategories = new Set(["SUGGESTION", "FEATURE_REQUEST"]);
const maxScreenshotBytes = 1048576;
const contactPattern =
  /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d|(?:whatsapp|telegram|instagram)\s*[:@]|@[a-z][\w.]{2,})/i;
const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine((v) => !controlCharacters.test(v), "Remove control characters.");
export const feedbackReason = z.string().trim().min(10).max(240);
export const feedbackInput = z
  .strictObject({
    request_key: z.uuid(),
    category: z.enum(feedbackCategories),
    title: text(5, 120),
    description: text(10, 2000),
    screenshot: z
      .strictObject({
        media_type: z.enum(["image/jpeg", "image/png"]),
        data: z.string().min(4).max(1398104),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (publicCategories.has(value.category) && (contactPattern.test(value.title) || contactPattern.test(value.description)))
      context.addIssue({
        code: "custom",
        path: ["description"],
        message: "Suggestions are shown to other members. Keep emails, phone numbers, social handles and links out of them.",
      });
  });
export const feedbackQueueQuery = z.strictObject({
  reason: feedbackReason,
  status: z.enum(feedbackStatuses).optional(),
  category: z.enum(feedbackCategories).optional(),
  priority: z.enum(feedbackPriorities).optional(),
});
export const feedbackAction = z
  .strictObject({
    revision: z.number().int().positive(),
    operation: z.enum(["SET_STATUS", "SET_PRIORITY", "REPLY", "NOTE", "HIDE", "UNHIDE"]),
    reason: feedbackReason,
    status: z.enum(feedbackStatuses).optional(),
    priority: z.enum(feedbackPriorities).optional(),
    message: text(2, 2000).optional(),
  })
  .superRefine((value, context) => {
    const need = (field: "status" | "priority" | "message") =>
      value[field] === undefined && context.addIssue({ code: "custom", path: [field], message: `Choose a ${field}.` });
    if (value.operation === "SET_STATUS") need("status");
    if (value.operation === "SET_PRIORITY") need("priority");
    if (value.operation === "REPLY" || value.operation === "NOTE") need("message");
  });
export const boardQuery = z.strictObject({
  sort: z.enum(["top", "new"]).optional(),
  category: z.enum(["SUGGESTION", "FEATURE_REQUEST"]).optional(),
});

type Row = Record<string, any>;
type Body = { title: string; description: string };
const missing = () => new ApiProblem(404, "NOT_FOUND", "Feedback not found.");
const invalidScreenshot = () =>
  new ApiProblem(400, "INVALID_SCREENSHOT", "Use a single JPEG or PNG screenshot of at most 1 MiB and 16 million pixels.");

export class FeedbackService {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly scanner: EvidenceScanner | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (config.mode === "production" && scanner?.testOnly) throw new Error("Test screenshot scanner is forbidden in production");
  }
  private get enabled() {
    return this.config.betaFeedback ?? this.config.mode !== "production";
  }
  private requireEnabled() {
    if (!this.enabled) throw new ApiProblem(404, "FEATURE_DISABLED", "Feedback is not available.");
  }
  private get hideFixtures() {
    return this.config.mode === "production";
  }
  policy() {
    return {
      enabled: this.enabled,
      screenshots_enabled: this.enabled && !!this.scanner,
      categories: feedbackCategories,
      public_categories: [...publicCategories],
      statuses: feedbackStatuses,
      max_screenshot_bytes: maxScreenshotBytes,
      notice:
        "Bugs and UI/UX reports are private to you and our team. Suggestions and feature requests appear on the members' board without your name. Keep passwords, payment details, identity documents and other people's personal details out of feedback and screenshots.",
    };
  }
  private body(row: Row) {
    return decrypt<Body>(row.encrypted_body, this.config.authSecret);
  }
  private summary(row: Row) {
    const body = this.body(row);
    return {
      id: row.id,
      category: row.category,
      title: body.title,
      status: row.status,
      public: row.public,
      hidden: row.hidden,
      vote_count: row.vote_count,
      has_screenshot: row.screenshot_status === "CLEAN",
      revision: row.revision,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  private async view(client: PoolClient, row: Row, privileged: boolean) {
    const events = (
      await client.query(
        "SELECT * FROM feedback_events WHERE item_id=$1 AND ($2::boolean OR visibility='USER') ORDER BY sequence",
        [row.id, privileged],
      )
    ).rows;
    return {
      ...this.summary(row),
      description: this.body(row).description,
      ...(privileged ? { priority: row.priority, owner_id: row.owner_id, screenshot_status: row.screenshot_status } : {}),
      events: events.map((event) => {
        const payload = decrypt<Row>(event.encrypted_payload, this.config.authSecret);
        return {
          id: event.id,
          outcome: event.outcome,
          visibility: event.visibility,
          created_at: event.created_at,
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.message ? { message: payload.message } : {}),
          ...(privileged ? { actor_id: event.actor_id, reason: payload.reason, priority: payload.priority } : {}),
        };
      }),
    };
  }
  private async audit(client: PoolClient, actor: string, event: string, target: string, metadata: Row = {}) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), actor, event, randomUUID(), this.now(), { target, ...metadata }],
    );
  }
  private async event(client: PoolClient, row: Row, actor: string, outcome: string, visibility: "USER" | "INTERNAL", payload: Row) {
    await client.query(
      "INSERT INTO feedback_events(id,item_id,actor_id,visibility,outcome,encrypted_payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), row.id, actor, visibility, outcome, encrypt(payload, this.config.authSecret), this.now()],
    );
  }
  private same(row: Row, input: z.infer<typeof feedbackInput>) {
    const body = this.body(row);
    return (
      row.category === input.category &&
      body.title === input.title &&
      body.description === input.description &&
      (row.screenshot_status !== "NONE") === !!input.screenshot
    );
  }
  private async replay(client: PoolClient, userId: string, input: z.infer<typeof feedbackInput>) {
    const old = (
      await client.query("SELECT * FROM feedback_items WHERE owner_id=$1 AND request_key=$2", [userId, input.request_key])
    ).rows[0];
    if (!old) return undefined;
    if (!this.same(old, input)) throw new ApiProblem(409, "FEEDBACK_CONFLICT", "This request key belongs to other feedback.");
    return { feedback: await this.view(client, old, false), replayed: true };
  }
  // Re-encoding drops EXIF/GPS and appended bytes; the original upload is never stored.
  private async screenshot(input: NonNullable<z.infer<typeof feedbackInput>["screenshot"]>) {
    if (!this.scanner)
      throw new ApiProblem(409, "SCREENSHOTS_UNAVAILABLE", "Screenshots are unavailable right now. Send your feedback without one.");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data)) throw invalidScreenshot();
    const raw = Buffer.from(input.data, "base64");
    if (raw.length < 8 || raw.length > maxScreenshotBytes || raw.toString("base64") !== input.data) throw invalidScreenshot();
    const png = raw.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = raw[0] === 255 && raw[1] === 216 && raw[2] === 255;
    if (input.media_type === "image/png" ? !png : !jpeg) throw invalidScreenshot();
    let bytes: Buffer;
    try {
      const image = sharp(raw, { limitInputPixels: 16000000, failOn: "warning" });
      const meta = await image.metadata();
      if (meta.format !== (input.media_type === "image/png" ? "png" : "jpeg") || (meta.pages || 1) !== 1 || !meta.width || !meta.height)
        throw invalidScreenshot();
      bytes = await image
        .autoOrient()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .timeout({ seconds: 5 })
        .toBuffer();
      if (bytes.length > maxScreenshotBytes) throw invalidScreenshot();
    } catch {
      throw invalidScreenshot();
    }
    let scan: "CLEAN" | "REJECTED" | "ERROR" = "ERROR";
    try {
      scan = await this.scanner.scan(raw);
    } catch {
      /* treated as ERROR */
    }
    if (scan === "REJECTED") throw new ApiProblem(400, "SCREENSHOT_REJECTED", "That screenshot failed the safety scan. Try another image.");
    if (scan !== "CLEAN")
      throw new ApiProblem(503, "SCAN_UNAVAILABLE", "We couldn't scan the screenshot. Try again, or send your feedback without it.");
    return bytes;
  }
  async create(token: string | undefined, input: z.infer<typeof feedbackInput>) {
    this.requireEnabled();
    const first = await this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      return { user, replayed: await this.replay(client, user.id, input) };
    });
    if (first.replayed) return first.replayed;
    // Scanning and image processing run outside the database transaction.
    const bytes = input.screenshot ? await this.screenshot(input.screenshot) : undefined;
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      const replayed = await this.replay(client, user.id, input);
      if (replayed) return replayed;
      await this.auth.limits.consume("feedback-create", user.id, 10, 86400000, client);
      const row = (
        await client.query(
          `INSERT INTO feedback_items(id,owner_id,request_key,category,public,encrypted_body,screenshot_status,encrypted_screenshot,screenshot_bytes,test_only,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,
          [
            randomUUID(),
            user.id,
            input.request_key,
            input.category,
            publicCategories.has(input.category),
            encrypt({ title: input.title, description: input.description }, this.config.authSecret),
            bytes ? "CLEAN" : "NONE",
            bytes ? encrypt({ data: bytes.toString("base64") }, this.config.authSecret) : null,
            bytes?.length ?? 0,
            this.config.mode !== "production",
            this.now(),
          ],
        )
      ).rows[0];
      await this.event(client, row, user.id, "CREATED", "USER", {});
      await this.audit(client, user.id, "FEEDBACK_CREATED", row.id, { category: row.category, screenshot: !!bytes });
      return { feedback: await this.view(client, row, false), replayed: false };
    });
  }
  async list(token: string | undefined) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const rows = (
        await client.query(
          "SELECT * FROM feedback_items WHERE owner_id=$1 AND (NOT $2::boolean OR NOT test_only) ORDER BY created_at DESC,id LIMIT 100",
          [user.id, this.hideFixtures],
        )
      ).rows;
      return { feedback: rows.map((row) => this.summary(row)), policy: this.policy() };
    });
  }
  private async own(client: PoolClient, token: string | undefined, id: string) {
    const { user } = await this.auth.safetyIdentity(client, token);
    const row = (await client.query("SELECT * FROM feedback_items WHERE id=$1 AND owner_id=$2", [id, user.id])).rows[0];
    if (!row || (this.hideFixtures && row.test_only)) throw missing();
    return row;
  }
  async read(token: string | undefined, id: string) {
    this.requireEnabled();
    return this.database.transaction(async (client) => ({ feedback: await this.view(client, await this.own(client, token, id), false) }));
  }
  private image(row: Row) {
    if (row.screenshot_status !== "CLEAN" || !row.encrypted_screenshot) throw new ApiProblem(404, "NOT_FOUND", "Screenshot not found.");
    return Buffer.from(decrypt<{ data: string }>(row.encrypted_screenshot, this.config.authSecret).data, "base64");
  }
  async ownScreenshot(token: string | undefined, id: string) {
    this.requireEnabled();
    return this.database.transaction(async (client) => this.image(await this.own(client, token, id)));
  }
  async board(token: string | undefined, query: z.infer<typeof boardQuery>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const rows = (
        await client.query(
          `SELECT f.*,EXISTS(SELECT 1 FROM feedback_votes v WHERE v.item_id=f.id AND v.user_id=$1) AS voted
           FROM feedback_items f
           WHERE f.public AND NOT f.hidden AND (NOT $2::boolean OR NOT f.test_only) AND ($3::text IS NULL OR f.category=$3)
           ORDER BY ${query.sort === "new" ? "f.created_at DESC" : "f.vote_count DESC,f.created_at DESC"},f.id LIMIT 100`,
          [user.id, this.hideFixtures, query.category ?? null],
        )
      ).rows;
      return {
        suggestions: rows.map((row) => {
          const body = this.body(row);
          return {
            id: row.id,
            category: row.category,
            title: body.title,
            description: body.description,
            status: row.status,
            vote_count: row.vote_count,
            voted: row.voted,
            own: row.owner_id === user.id,
            created_at: row.created_at,
          };
        }),
      };
    });
  }
  async vote(token: string | undefined, id: string, voted: boolean) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      await this.auth.limits.consume("feedback-vote", user.id, 120, 3600000, client);
      const row = (
        await client.query("SELECT * FROM feedback_items WHERE id=$1 AND public AND NOT hidden FOR UPDATE", [id])
      ).rows[0];
      if (!row || (this.hideFixtures && row.test_only)) throw missing();
      const changed = voted
        ? (
            await client.query(
              "INSERT INTO feedback_votes(item_id,user_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
              [id, user.id, this.now()],
            )
          ).rowCount
        : (await client.query("DELETE FROM feedback_votes WHERE item_id=$1 AND user_id=$2", [id, user.id])).rowCount;
      const count = changed
        ? (
            await client.query("UPDATE feedback_items SET vote_count=vote_count+$2 WHERE id=$1 RETURNING vote_count", [
              id,
              voted ? 1 : -1,
            ])
          ).rows[0].vote_count
        : row.vote_count;
      return { vote_count: count, voted };
    });
  }
  async queue(account: string | undefined, staffToken: string | undefined, query: z.infer<typeof feedbackQueueQuery>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(client, account, staffToken, "SUPPORT");
      const rows = (
        await client.query(
          `SELECT * FROM feedback_items
           WHERE (NOT $1::boolean OR NOT test_only) AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR category=$3) AND ($4::text IS NULL OR priority=$4)
           ORDER BY (status='RESOLVED'),
             CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END,
             vote_count DESC,created_at,id LIMIT 100`,
          [this.hideFixtures, query.status ?? null, query.category ?? null, query.priority ?? null],
        )
      ).rows;
      await this.audit(client, actor.id, "FEEDBACK_QUEUE_VIEWED", actor.id, { reason: query.reason });
      return { feedback: rows.map((row) => ({ ...this.summary(row), priority: row.priority })) };
    });
  }
  private async target(client: PoolClient, account: string | undefined, staffToken: string | undefined, id: string) {
    const actor = await this.staff.authorize(client, account, staffToken, "SUPPORT");
    const row = (await client.query("SELECT * FROM feedback_items WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!row || (this.hideFixtures && row.test_only)) throw missing();
    return { actor, row };
  }
  async inspect(account: string | undefined, staffToken: string | undefined, id: string, reason: string) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { actor, row } = await this.target(client, account, staffToken, id);
      await this.audit(client, actor.id, "FEEDBACK_INSPECTED", id, { reason });
      return { feedback: await this.view(client, row, true) };
    });
  }
  async staffScreenshot(account: string | undefined, staffToken: string | undefined, id: string, reason: string) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { actor, row } = await this.target(client, account, staffToken, id);
      const bytes = this.image(row);
      await this.audit(client, actor.id, "FEEDBACK_SCREENSHOT_INSPECTED", id, { reason });
      return bytes;
    });
  }
  async action(account: string | undefined, staffToken: string | undefined, id: string, input: z.infer<typeof feedbackAction>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { actor, row } = await this.target(client, account, staffToken, id);
      if (row.revision !== input.revision)
        throw new ApiProblem(409, "FEEDBACK_CONFLICT", "This feedback changed. Refresh it before acting.");
      if ((input.operation === "HIDE" || input.operation === "UNHIDE") && !row.public)
        throw new ApiProblem(409, "NOT_PUBLIC", "Only board suggestions can be hidden.");
      if (input.operation === "HIDE" && row.hidden) throw new ApiProblem(409, "FEEDBACK_CONFLICT", "This suggestion is already hidden.");
      if (input.operation === "UNHIDE" && !row.hidden) throw new ApiProblem(409, "FEEDBACK_CONFLICT", "This suggestion is not hidden.");
      if (input.operation === "SET_STATUS" && input.status === row.status)
        throw new ApiProblem(409, "FEEDBACK_CONFLICT", "The feedback already has that status.");
      const status = input.operation === "SET_STATUS" ? input.status! : row.status;
      const priority = input.operation === "SET_PRIORITY" ? input.priority! : row.priority;
      const hidden = input.operation === "HIDE" ? true : input.operation === "UNHIDE" ? false : row.hidden;
      // Resolving deletes the screenshot: it is only kept while the report is being worked on.
      const clearScreenshot = status === "RESOLVED" && row.screenshot_status === "CLEAN";
      const updated = (
        await client.query(
          `UPDATE feedback_items SET status=$2,priority=$3,hidden=$4,revision=revision+1,updated_at=$5,
             screenshot_status=CASE WHEN $6::boolean THEN 'REMOVED' ELSE screenshot_status END,
             encrypted_screenshot=CASE WHEN $6::boolean THEN NULL ELSE encrypted_screenshot END,
             screenshot_bytes=CASE WHEN $6::boolean THEN 0 ELSE screenshot_bytes END
           WHERE id=$1 RETURNING *`,
          [id, status, priority, hidden, this.now(), clearScreenshot],
        )
      ).rows[0];
      const visibility = input.operation === "NOTE" || input.operation === "SET_PRIORITY" ? "INTERNAL" : "USER";
      const outcome = {
        SET_STATUS: "STATUS_CHANGED",
        SET_PRIORITY: "PRIORITY_CHANGED",
        REPLY: "REPLIED",
        NOTE: "NOTE_ADDED",
        HIDE: "HIDDEN",
        UNHIDE: "UNHIDDEN",
      }[input.operation];
      await this.event(client, updated, actor.id, outcome, visibility, {
        reason: input.reason,
        ...(input.operation === "SET_STATUS" ? { status } : {}),
        ...(input.operation === "SET_PRIORITY" ? { priority } : {}),
        ...(input.message ? { message: input.message } : {}),
      });
      await this.audit(client, actor.id, "FEEDBACK_" + outcome, id, { reason: input.reason });
      return { feedback: await this.view(client, updated, true) };
    });
  }
}
