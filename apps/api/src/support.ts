import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService, type StaffScope } from "./staff.js";
import type { Config } from "./config.js";
import { ApiProblem } from "./errors.js";
import { encrypt, decrypt } from "./security.js";
import { ReviewsService } from "./reviews.js";
import { SafetyService } from "./safety.js";
import { FinanceService } from "./finance.js";

const privateText = z
  .string()
  .trim()
  .min(10)
  .max(2000)
  .refine(
    (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
    "Remove control characters.",
  );
export const supportReason = z.string().trim().min(10).max(240);
export const supportInput = z.strictObject({
  request_key: z.uuid(),
  category: z.enum(["ACCOUNT", "BILLING", "OTHER"]),
  subject: z.string().trim().min(5).max(120),
  description: privateText,
});
export const refundAppealInput = z.strictObject({
  request_key: z.uuid(),
  description: privateText,
});
export const supportMessageInput = z.strictObject({
  revision: z.number().int().positive(),
  message: privateText,
});
export const supportAction = z.strictObject({
  revision: z.number().int().positive(),
  operation: z.enum([
    "CLAIM",
    "RELEASE",
    "NOTE",
    "REPLY",
    "RESOLVE",
    "UPHOLD",
    "SUPERSEDED",
    "REOPEN_REVIEW",
    "LIFT_ACCOUNT",
    "LIFT_LISTING",
    "LIFT_CONNECTION",
    "RECONSIDER_REFUND",
  ]),
  reason: supportReason,
  message: privateText.optional(),
});
const missing = () =>
  new ApiProblem(404, "NOT_FOUND", "Support case not found.");
const conflict = (message: string) =>
  new ApiProblem(409, "CASE_CONFLICT", message);
type Row = Record<string, any>;
export class SupportService {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly reviews: ReviewsService,
    private readonly safety: SafetyService,
    private readonly finance: FinanceService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  policy() {
    const instant = this.now(),
      local = new Date(instant.getTime() + 330 * 60000);
    const day = local.getUTCDay(),
      minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const open = day !== 0 && minutes >= 600 && minutes < 1080;
    const next = new Date(local);
    next.setUTCHours(10, 0, 0, 0);
    if (minutes >= 600) next.setUTCDate(next.getUTCDate() + 1);
    if (next.getUTCDay() === 0) next.setUTCDate(next.getUTCDate() + 1);
    return {
      hours: "Monday-Saturday, 10:00-18:00 IST",
      timezone: "Asia/Kolkata",
      open_now: open,
      next_opening_at: open
        ? null
        : new Date(next.getTime() - 330 * 60000).toISOString(),
      notice:
        "You can submit a case at any time. Human support operates during published hours; replies are not immediate. Tuition Fees are paid directly to Tutors. Keep passwords, payment credentials, child details and identity documents out of support messages.",
    };
  }
  private async audit(
    client: PoolClient,
    actor: string,
    event: string,
    id: string,
    reason?: string,
  ) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        actor,
        event,
        randomUUID(),
        this.now(),
        { target: id, ...(reason ? { reason } : {}) },
      ],
    );
  }
  private async event(
    client: PoolClient,
    row: Row,
    actor: string,
    outcome: string,
    visibility: "USER" | "INTERNAL",
    payload: Row,
  ) {
    await client.query(
      "INSERT INTO support_events(id,case_id,actor_id,visibility,outcome,encrypted_payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        row.id,
        actor,
        visibility,
        outcome,
        encrypt(payload, this.config.authSecret),
        this.now(),
      ],
    );
    await this.audit(
      client,
      actor,
      "SUPPORT_" + outcome,
      row.id,
      payload.reason,
    );
  }
  private async view(client: PoolClient, row: Row, privileged = false) {
    const text = decrypt<{ subject?: string; description: string }>(
      row.encrypted_description,
      this.config.authSecret,
    );
    const events = (
      await client.query(
        "SELECT * FROM support_events WHERE case_id=$1 AND ($2::boolean OR visibility='USER') ORDER BY sequence",
        [row.id, privileged],
      )
    ).rows;
    return {
      ...this.summary(row),
      subject: text.subject || row.category.replaceAll("_", " "),
      description: text.description,
      ...(privileged ? { assigned_to: row.assigned_to } : {}),
      events: events.map((e) => {
        const p = decrypt<Row>(e.encrypted_payload, this.config.authSecret);
        return {
          id: e.id,
          outcome: e.outcome,
          visibility: e.visibility,
          created_at: e.created_at,
          ...p,
          ...(privileged ? { actor_id: e.actor_id } : { reason: undefined }),
        };
      }),
    };
  }
  private summary(row: Row) {
    return {
      id: row.id,
      category: row.category,
      required_scope: row.required_scope,
      status: row.status,
      revision: row.revision,
      assigned: !!row.assigned_to,
      source_id: row.source_id,
      related_id: row.related_id,
      source_revision: row.source_revision,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  private async own(client: PoolClient, token: string | undefined, id: string) {
    const { user } = await this.auth.safetyIdentity(client, token);
    const row = (
      await client.query(
        "SELECT * FROM support_cases WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [id, user.id],
      )
    ).rows[0];
    if (!row || (this.config.mode === "production" && row.test_only))
      throw missing();
    return { user, row };
  }
  async create(token: string | undefined, input: z.infer<typeof supportInput>) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const old = (
        await client.query(
          "SELECT * FROM support_cases WHERE owner_id=$1 AND request_key=$2",
          [user.id, input.request_key],
        )
      ).rows[0];
      if (old) {
        const text = decrypt<Row>(
          old.encrypted_description,
          this.config.authSecret,
        );
        if (
          old.category !== input.category ||
          text.subject !== input.subject ||
          text.description !== input.description
        )
          throw conflict("This request key belongs to another case.");
        return { case: await this.view(client, old), replayed: true };
      }
      await this.auth.limits.consume(
        "support-create",
        user.id,
        10,
        86400000,
        client,
      );
      const row = (
        await client.query(
          "INSERT INTO support_cases(id,owner_id,request_key,category,required_scope,encrypted_description,test_only,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *",
          [
            randomUUID(),
            user.id,
            input.request_key,
            input.category,
            input.category === "BILLING" ? "FINANCE" : "SUPPORT",
            encrypt(
              { subject: input.subject, description: input.description },
              this.config.authSecret,
            ),
            this.config.mode !== "production",
            this.now(),
          ],
        )
      ).rows[0];
      await this.event(client, row, user.id, "CREATED", "USER", {});
      return { case: await this.view(client, row), replayed: false };
    });
  }
  async refundAppeal(
    token: string | undefined,
    id: string,
    input: z.infer<typeof refundAppealInput>,
  ) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const source = (
        await client.query(
          "SELECT c.*,p.test_only FROM refund_cases c JOIN purchase_cycles p ON p.id=c.cycle_id WHERE c.id=$1 AND c.payer_id=$2",
          [id, user.id],
        )
      ).rows[0];
      if (!source || (this.config.mode === "production" && source.test_only))
        throw missing();
      if (source.status === "OPEN")
        throw conflict(
          "Wait for the original refund review decision before appealing.",
        );
      const old = (
        await client.query(
          "SELECT * FROM support_cases WHERE owner_id=$1 AND (request_key=$2 OR (category='REFUND_APPEAL' AND source_id=$3))",
          [user.id, input.request_key, id],
        )
      ).rows[0];
      if (old) {
        if (
          old.source_id !== id ||
          old.request_key !== input.request_key ||
          decrypt<Row>(old.encrypted_description, this.config.authSecret)
            .description !== input.description
        )
          throw conflict(
            "An appeal already exists. Track its status in Support.",
          );
        return { case: await this.view(client, old), replayed: true };
      }
      await this.auth.limits.consume(
        "support-create",
        user.id,
        10,
        86400000,
        client,
      );
      const row = (
        await client.query(
          "INSERT INTO support_cases(id,owner_id,request_key,category,required_scope,encrypted_description,source_id,related_id,test_only,created_at,updated_at) VALUES($1,$2,$3,'REFUND_APPEAL','FINANCE',$4,$5,$6,$7,$8,$8) RETURNING *",
          [
            randomUUID(),
            user.id,
            input.request_key,
            encrypt({ description: input.description }, this.config.authSecret),
            id,
            source.cycle_id,
            source.test_only,
            this.now(),
          ],
        )
      ).rows[0];
      await this.event(client, row, user.id, "CREATED", "USER", {});
      return { case: await this.view(client, row), replayed: false };
    });
  }
  async list(token: string | undefined) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      return {
        cases: (
          await client.query(
            "SELECT * FROM support_cases WHERE owner_id=$1 AND (NOT $2::boolean OR NOT test_only) ORDER BY created_at DESC,id LIMIT 100",
            [user.id, this.config.mode === "production"],
          )
        ).rows.map((r) => this.summary(r)),
        policy: this.policy(),
      };
    });
  }
  async read(token: string | undefined, id: string) {
    return this.database.transaction(async (client) => {
      const { row } = await this.own(client, token, id);
      return { case: await this.view(client, row) };
    });
  }
  async message(
    token: string | undefined,
    id: string,
    input: z.infer<typeof supportMessageInput>,
  ) {
    return this.database.transaction(async (client) => {
      const { row, user } = await this.own(client, token, id);
      if (row.revision !== input.revision)
        throw conflict("Refresh the case before sending another message.");
      if (row.status === "RESOLVED")
        throw conflict(
          "This case is resolved. Open a new case for a new issue.",
        );
      await this.auth.limits.consume(
        "support-message",
        user.id,
        50,
        86400000,
        client,
      );
      const changed = (
        await client.query(
          "UPDATE support_cases SET status=CASE WHEN assigned_to IS NULL THEN 'OPEN' ELSE 'IN_PROGRESS' END,revision=revision+1,updated_at=$2 WHERE id=$1 RETURNING *",
          [id, this.now()],
        )
      ).rows[0];
      await this.event(client, changed, user.id, "CUSTOMER_REPLY", "USER", {
        message: input.message,
      });
      return { case: await this.view(client, changed) };
    });
  }
  private async authorized(
    client: PoolClient,
    account: string | undefined,
    elevated: string | undefined,
    id: string,
  ) {
    const planned = (
      await client.query("SELECT * FROM support_cases WHERE id=$1", [id])
    ).rows[0];
    const participants = planned ? [planned.owner_id] : [];
    if (planned?.category === "REVIEW_APPEAL") {
      const r = (
        await client.query(
          "SELECT author_id,tutor_id FROM connection_reviews WHERE id=$1",
          [planned.related_id],
        )
      ).rows[0];
      if (r) participants.push(r.author_id, r.tutor_id);
    }
    if (planned?.category === "SAFETY_APPEAL") {
      const r = (
        await client.query(
          "SELECT reporter_id,subject_id FROM safety_cases WHERE id=$1",
          [planned.related_id],
        )
      ).rows[0];
      if (r) participants.push(r.reporter_id, r.subject_id);
    }
    const actor = await this.staff.authorize(
      client,
      account,
      elevated,
      (planned?.required_scope || "SUPPORT") as StaffScope,
      participants,
    );
    const row = (
      await client.query("SELECT * FROM support_cases WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!row || (this.config.mode === "production" && row.test_only))
      throw missing();
    if (participants.includes(actor.id))
      throw new ApiProblem(
        403,
        "SELF_REVIEW",
        "Another staff member must handle your case.",
      );
    return { actor, row };
  }
  async queue(
    account: string | undefined,
    elevated: string | undefined,
    scope: StaffScope,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(
        client,
        account,
        elevated,
        scope,
      );
      await this.audit(
        client,
        actor.id,
        "SUPPORT_QUEUE_READ",
        "support:" + scope,
        reason,
      );
      return {
        cases: (
          await client.query(
            "SELECT c.* FROM support_cases c WHERE c.required_scope=$1 AND c.owner_id<>$2 AND (NOT $3::boolean OR NOT c.test_only) AND NOT EXISTS (SELECT 1 FROM connection_reviews r WHERE c.category='REVIEW_APPEAL' AND r.id=c.related_id AND $2 IN (r.author_id,r.tutor_id)) AND NOT EXISTS (SELECT 1 FROM safety_cases s WHERE c.category='SAFETY_APPEAL' AND s.id=c.related_id AND $2 IN (s.reporter_id,s.subject_id)) ORDER BY (c.status='RESOLVED'),c.created_at,c.id LIMIT 100",
            [scope, actor.id, this.config.mode === "production"],
          )
        ).rows.map((r) => this.summary(r)),
      };
    });
  }
  async inspect(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const { row, actor } = await this.authorized(
        client,
        account,
        elevated,
        id,
      );
      await this.audit(client, actor.id, "SUPPORT_CASE_INSPECTED", id, reason);
      return { case: await this.view(client, row, true) };
    });
  }
  async action(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    input: z.infer<typeof supportAction>,
  ) {
    return this.database.transaction(async (client) => {
      const { row, actor } = await this.authorized(
        client,
        account,
        elevated,
        id,
      );
      if (row.revision !== input.revision)
        throw conflict("Refresh the case before acting.");
      if (row.status === "RESOLVED")
        throw conflict("This case already has a recorded resolution.");
      if (row.assigned_to && row.assigned_to !== actor.id)
        throw conflict(
          "The assigned staff member must release this case first.",
        );
      if (input.operation !== "CLAIM" && row.assigned_to !== actor.id)
        throw conflict("Claim this case before responding.");
      const resolves = !["CLAIM", "RELEASE", "NOTE", "REPLY"].includes(
        input.operation,
      );
      if (
        (resolves || ["NOTE", "REPLY"].includes(input.operation)) &&
        !input.message
      )
        throw new ApiProblem(400, "MESSAGE_REQUIRED", "Enter a case message.");
      let source_result: unknown;
      if (resolves && row.source_id) {
        if (
          row.category === "REVIEW_APPEAL" &&
          ["UPHOLD", "REOPEN_REVIEW", "SUPERSEDED"].includes(input.operation)
        )
          source_result = await this.reviews.resolveAppealWithin(
            client,
            account,
            elevated,
            row.source_id,
            input.operation as "UPHOLD" | "REOPEN_REVIEW" | "SUPERSEDED",
            input.reason,
          );
        else if (
          row.category === "SAFETY_APPEAL" &&
          [
            "UPHOLD",
            "SUPERSEDED",
            "LIFT_ACCOUNT",
            "LIFT_LISTING",
            "LIFT_CONNECTION",
          ].includes(input.operation)
        )
          source_result = await this.safety.resolveAppealWithin(
            client,
            account,
            elevated,
            row.source_id,
            row.source_revision,
            input.operation as
              | "UPHOLD"
              | "SUPERSEDED"
              | "LIFT_ACCOUNT"
              | "LIFT_LISTING"
              | "LIFT_CONNECTION",
            input.reason,
          );
        else if (
          row.category === "REFUND_APPEAL" &&
          ["UPHOLD", "RECONSIDER_REFUND"].includes(input.operation)
        )
          source_result = await this.finance.reconsiderWithin(
            client,
            account,
            elevated,
            row.source_id,
            row.id,
            input.operation as "UPHOLD" | "RECONSIDER_REFUND",
            input.reason,
          );
        else
          throw conflict(
            "Choose an explicit decision supported by this appeal type.",
          );
      } else if (resolves && input.operation !== "RESOLVE")
        throw conflict("This case has no appealed domain decision.");
      const status = resolves
        ? "RESOLVED"
        : input.operation === "REPLY"
          ? "WAITING_CUSTOMER"
          : input.operation === "RELEASE"
            ? "OPEN"
            : "IN_PROGRESS";
      const updated = (
        await client.query(
          "UPDATE support_cases SET assigned_to=$2,status=$3,revision=revision+1,updated_at=$4 WHERE id=$1 RETURNING *",
          [
            id,
            input.operation === "RELEASE" ? null : actor.id,
            status,
            this.now(),
          ],
        )
      ).rows[0];
      await this.event(
        client,
        updated,
        actor.id,
        input.operation,
        ["NOTE", "CLAIM", "RELEASE"].includes(input.operation)
          ? "INTERNAL"
          : "USER",
        {
          reason: input.reason,
          ...(input.message ? { message: input.message } : {}),
          ...(source_result ? { source_result } : {}),
        },
      );
      return { case: await this.view(client, updated, true) };
    });
  }
}
