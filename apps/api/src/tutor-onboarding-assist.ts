import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import type { Config } from "./config.js";
import { ApiProblem } from "./errors.js";
import { encrypt, decrypt } from "./security.js";
import type { TutorDelegation } from "./tutor-delegation.js";

// ADR0018: a Tutor can ask the team to create and publish their profile.
export const assistConsentVersion = "assisted-onboarding-v1";
const consents = [
  "I am 18 or older.",
  "I allow the Tutor Marketplace team to create, edit and publish my Tutor profile and ads using the details and documents I send them.",
  "I allow my profile photo to be shown publicly on my profile and ads.",
];
const whatsapp = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+?\d{10,15}$/, "Enter the WhatsApp number you will message us from."));
export const assistRequestInput = z.strictObject({
  request_key: z.uuid(),
  whatsapp_number: whatsapp,
  note: z.string().trim().max(500).optional(),
  adult_confirmed: z.literal(true),
  team_publication_consent: z.literal(true),
  photo_public_consent: z.literal(true),
});
export const assistAction = z.strictObject({
  operation: z.enum(["CLAIM", "RELEASE", "COMPLETE", "CANCEL"]),
  revision: z.number().int().positive(),
  reason: z.string().trim().max(240).optional(),
});
export const assistQueueQuery = z.strictObject({
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).default("ACTIVE"),
});

const missing = () => new ApiProblem(404, "NOT_FOUND", "Onboarding request not found.");
const conflict = (code: string, message: string) => new ApiProblem(409, code, message);
export function onboardingReference(id: string) {
  return "TM-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

export class AssistedOnboardingService {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get hideFixtures() {
    return this.config.mode === "production";
  }
  private contact(row: Record<string, any>) {
    return row.encrypted_contact
      ? decrypt<{ whatsapp_number: string; note: string | null }>(row.encrypted_contact, this.config.authSecret)
      : { whatsapp_number: null, note: null };
  }
  private tutorView(row: Record<string, any>) {
    const contact = this.contact(row);
    return {
      id: row.id,
      reference: onboardingReference(row.id),
      status: row.status,
      whatsapp_number: contact.whatsapp_number,
      note: contact.note,
      revision: row.revision,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      cancelled_at: row.cancelled_at,
      cancelled_by: row.cancelled_by,
    };
  }
  private audit(client: PoolClient, actor: string, event: string, correlation: string, metadata: Record<string, unknown>) {
    return client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), actor, event, correlation, this.now(), metadata],
    );
  }

  policy() {
    return { consent_version: assistConsentVersion, consents };
  }

  async own(token?: string) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      const row = (
        await client.query(
          "SELECT * FROM tutor_onboarding_requests WHERE user_id=$1 AND (NOT $2::boolean OR NOT test_only) ORDER BY created_at DESC,id DESC LIMIT 1",
          [user.id, this.hideFixtures],
        )
      ).rows[0];
      return { policy: this.policy(), request: row ? this.tutorView(row) : null };
    });
  }

  async create(token: string | undefined, input: z.infer<typeof assistRequestInput>, correlation: string) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      const contact = { whatsapp_number: input.whatsapp_number, note: input.note || null };
      const replay = (
        await client.query("SELECT * FROM tutor_onboarding_requests WHERE user_id=$1 AND request_key=$2", [user.id, input.request_key])
      ).rows[0];
      if (replay) {
        const same = JSON.stringify(this.contact(replay)) === JSON.stringify(contact);
        if (!same) throw conflict("REQUEST_KEY_REUSED", "This request was already sent with different details.");
        return { request: this.tutorView(replay) };
      }
      const active = (
        await client.query("SELECT id FROM tutor_onboarding_requests WHERE user_id=$1 AND status IN ('OPEN','IN_PROGRESS') FOR UPDATE", [user.id])
      ).rows[0];
      if (active) throw conflict("ACTIVE_REQUEST", "Your request is already with the team.");
      await this.auth.limits.consume("tutor-onboarding-request", user.id, 5, 86400000, client);
      const now = this.now();
      const row = (
        await client.query(
          `INSERT INTO tutor_onboarding_requests(id,user_id,request_key,consent_version,consent_accepted_at,encrypted_contact,test_only,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$5,$5) RETURNING *`,
          [randomUUID(), user.id, input.request_key, assistConsentVersion, now, encrypt(contact, this.config.authSecret), !this.hideFixtures],
        )
      ).rows[0];
      await this.audit(client, user.id, "TUTOR_ONBOARDING_REQUESTED", correlation, {
        request: row.id,
        consent_version: assistConsentVersion,
        consents: ["ADULT", "TEAM_PUBLICATION", "PHOTO_PUBLIC"],
      });
      return { request: this.tutorView(row) };
    });
  }

  /** The Tutor withdraws the request; staff lose access immediately. */
  async cancel(token: string | undefined, correlation: string) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      const row = (
        await client.query("SELECT * FROM tutor_onboarding_requests WHERE user_id=$1 AND status IN ('OPEN','IN_PROGRESS') FOR UPDATE", [user.id])
      ).rows[0];
      if (!row) throw missing();
      const updated = (
        await client.query(
          "UPDATE tutor_onboarding_requests SET status='CANCELLED',cancelled_at=$2,cancelled_by='TUTOR',assigned_to=NULL,revision=revision+1,updated_at=$2 WHERE id=$1 RETURNING *",
          [row.id, this.now()],
        )
      ).rows[0];
      await this.audit(client, user.id, "TUTOR_ONBOARDING_CANCELLED", correlation, { request: row.id, by: "TUTOR" });
      return { request: this.tutorView(updated) };
    });
  }

  async queue(account: string | undefined, staffToken: string | undefined, input: z.infer<typeof assistQueueQuery>, correlation: string) {
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(client, account, staffToken, "SUPPORT");
      const statuses = input.status === "ACTIVE" ? ["OPEN", "IN_PROGRESS"] : [input.status];
      const rows = (
        await client.query(
          `SELECT r.*,u.display_name,u.email,a.display_name AS assignee_name
             FROM tutor_onboarding_requests r JOIN users u ON u.id=r.user_id LEFT JOIN users a ON a.id=r.assigned_to
            WHERE r.status=ANY($1::text[]) AND (NOT $2::boolean OR NOT r.test_only)
            ORDER BY r.created_at ${input.status === "ACTIVE" ? "ASC" : "DESC"},r.id LIMIT 100`,
          [statuses, this.hideFixtures],
        )
      ).rows;
      await this.audit(client, actor.id, "TUTOR_ONBOARDING_QUEUE_VIEWED", correlation, { status: input.status, count: rows.length });
      return { requests: rows.map((row) => this.staffView(row, actor.id)) };
    });
  }

  private staffView(row: Record<string, any>, actorId: string) {
    return {
      ...this.tutorView(row),
      user_id: row.user_id,
      display_name: row.display_name,
      email: row.email,
      assigned_to: row.assigned_to,
      assignee_name: row.assignee_name ?? null,
      assigned_to_me: row.assigned_to === actorId,
      staff_note: row.staff_note,
      consent_version: row.consent_version,
      consent_accepted_at: row.consent_accepted_at,
    };
  }

  /** Locks the request after authorizing staff with the Tutor locked in account order. */
  private async target(client: PoolClient, account: string | undefined, staffToken: string | undefined, id: string) {
    const found = (await client.query("SELECT user_id FROM tutor_onboarding_requests WHERE id=$1", [id])).rows[0];
    const actor = await this.staff.authorize(client, account, staffToken, "SUPPORT", found ? [found.user_id] : []);
    const row = (await client.query("SELECT * FROM tutor_onboarding_requests WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!row || (this.hideFixtures && row.test_only)) throw missing();
    if (row.user_id === actor.id) throw new ApiProblem(403, "SELF_ASSIST", "Another team member must set up your own profile.");
    return { actor, row };
  }

  async action(
    account: string | undefined,
    staffToken: string | undefined,
    id: string,
    input: z.infer<typeof assistAction>,
    correlation: string,
  ) {
    return this.database.transaction(async (client) => {
      const { actor, row } = await this.target(client, account, staffToken, id);
      if (row.revision !== input.revision) throw conflict("REQUEST_CHANGED", "This request changed. Refresh before continuing.");
      const open = ["OPEN", "IN_PROGRESS"].includes(row.status);
      // Every transition advances the revision; $1 id, $2 staff, $3 time, $4 reason.
      const set: Record<typeof input.operation, string> = {
        CLAIM: "status='IN_PROGRESS',assigned_to=$2",
        RELEASE: "status='OPEN',assigned_to=NULL",
        COMPLETE: "status='COMPLETED',completed_at=$3,staff_note=COALESCE($4,staff_note)",
        CANCEL: "status='CANCELLED',cancelled_at=$3,cancelled_by='STAFF',assigned_to=NULL,staff_note=$4",
      };
      if (input.operation === "CLAIM" && (!open || row.assigned_to === actor.id))
        throw conflict("INVALID_REQUEST_STATE", "This request cannot be claimed.");
      if (input.operation === "RELEASE" && row.status !== "IN_PROGRESS")
        throw conflict("INVALID_REQUEST_STATE", "Only a claimed request can be released.");
      if (input.operation === "COMPLETE" && row.status !== "IN_PROGRESS")
        throw conflict("INVALID_REQUEST_STATE", "Claim the request before completing it.");
      if (input.operation === "CANCEL") {
        if (!open) throw conflict("INVALID_REQUEST_STATE", "This request is already closed.");
        if (!input.reason || input.reason.length < 10)
          throw new ApiProblem(400, "VALIDATION_ERROR", "Give a reason of at least 10 characters for cancelling.");
      }
      // The trailing casts give PostgreSQL a type for $2 and $4 when an operation does not use them.
      await client.query(
        `UPDATE tutor_onboarding_requests SET ${set[input.operation]},revision=revision+1,updated_at=$3
          WHERE id=$1 AND $2::uuid IS NOT NULL AND ($4::text IS NULL OR $4::text IS NOT NULL)`,
        [id, actor.id, this.now(), input.reason ?? null],
      );
      await this.audit(client, actor.id, "TUTOR_ONBOARDING_" + input.operation, correlation, {
        request: id,
        tutor: row.user_id,
        reason: input.reason ?? null,
      });
      const updated = (
        await client.query(
          "SELECT r.*,u.display_name,u.email,a.display_name AS assignee_name FROM tutor_onboarding_requests r JOIN users u ON u.id=r.user_id LEFT JOIN users a ON a.id=r.assigned_to WHERE r.id=$1",
          [id],
        )
      ).rows[0];
      return { request: this.staffView(updated, actor.id) };
    });
  }

  /**
   * A delegation for one staff HTTP request. It works only while the request is claimed
   * (IN_PROGRESS) and records one audit event naming the staff member and the action.
   */
  delegate(
    account: string | undefined,
    staffToken: string | undefined,
    id: string,
    action: string,
    correlation: string,
  ): TutorDelegation {
    let audited = false;
    return {
      kind: "TUTOR_DELEGATION",
      resolve: async (client) => {
        const { actor, row } = await this.target(client, account, staffToken, id);
        if (row.status !== "IN_PROGRESS")
          throw conflict("REQUEST_NOT_IN_PROGRESS", "Claim this request before working on the Tutor's profile.");
        const user = (await client.query("SELECT * FROM users WHERE id=$1", [row.user_id])).rows[0];
        if (!user || user.status !== "ACTIVE" || !user.email_verified_at)
          throw conflict("TUTOR_ACCOUNT_UNAVAILABLE", "This Tutor account can no longer be set up.");
        if (!audited) {
          await this.audit(client, actor.id, "TUTOR_ONBOARDING_ASSISTED_ACTION", correlation, {
            request: id,
            tutor: user.id,
            action,
          });
          audited = true;
        }
        return { user, staffId: actor.id };
      },
    };
  }
}
