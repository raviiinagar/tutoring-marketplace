import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import type { Config } from "./config.js";
import { ApiProblem } from "./errors.js";
import { checkPassword, randomToken, tokenHash, decrypt } from "./security.js";
import { StaffService, type StaffScope } from "./staff.js";
import { availabilityEmailHash } from "./privacy-inventory.js";
import {
  stopPrivacyActivity,
  retainedSummary,
  retentionHeld,
  archiveWithdrawal,
} from "./privacy-erasure.js";
import { ensurePrivacyPolicy } from "./privacy-policy.js";
export const privacyVerification = z.strictObject({
  password: z.string().min(1).max(128),
  purpose: z.enum(["EXPORT", "DELETE", "WITHDRAW", "DOWNLOAD"]),
});
export const privacyRequest = z.strictObject({
  request_key: z.uuid(),
  kind: z.enum(["EXPORT", "DELETE", "WITHDRAW"]),
  verification: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  profile_id: z.uuid().optional(),
  confirmation: z.literal("DELETE MY ACCOUNT").optional(),
});
export const receiptName = (config: Config) =>
  config.mode === "production"
    ? "__Host-tm_privacy_receipt"
    : "tm_privacy_receipt";
const fail = (status: number, code: string, message: string) =>
  new ApiProblem(status, code, message);
export class PrivacyService {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  policy() {
    return {
      exports_enabled: true,
      deletion_enabled: !!this.config.privacy,
      withdrawal_enabled: !!this.config.privacy,
      retention_policy: this.config.privacy
        ? {
            id: this.config.privacy.policy.id,
            test_only: this.config.privacy.policy.test_only,
            classes: this.config.privacy.policy.classes,
          }
        : null,
      export_expires_hours: 24,
      verification_minutes: 5,
      notice:
        "Exports contain your contributed data, including current clean Tutor photo assets. Downloads require a current account and recent password verification. Deletion stops new activity and signs out sessions. Approved retained records remain private for their stated purpose; financial obligations are not cancelled. This browser can track the request for 30 days after verification.",
    };
  }
  private async audit(
    client: PoolClient,
    id: string,
    event: string,
    target: string,
  ) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), id, event, randomUUID(), this.now(), { target }],
    );
  }
  async verify(
    token: string | undefined,
    input: z.infer<typeof privacyVerification>,
  ) {
    await this.auth.limits.consume(
      "privacy-verify",
      token || "anonymous",
      6,
      900000,
    );
    return this.database.transaction(async (client) => {
      const { user, session } = await this.auth.safetyIdentity(client, token);
      if (!(await checkPassword(input.password, user.password_hash)))
        throw fail(401, "INVALID_CREDENTIALS", "Password is incorrect.");
      const proof = randomToken(),
        receipt = randomToken(),
        expires = new Date(this.now().getTime() + 300000);
      await client.query(
        "INSERT INTO privacy_verifications(token_hash,user_id,session_id,purpose,expires_at) VALUES($1,$2,$3,$4,$5)",
        [tokenHash(proof), user.id, session.id, input.purpose, expires],
      );
      await client.query(
        "INSERT INTO privacy_receipts(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
        [
          tokenHash(receipt),
          user.id,
          new Date(this.now().getTime() + 30 * 86400000),
        ],
      );
      await this.audit(
        client,
        user.id,
        "PRIVACY_IDENTITY_VERIFIED",
        input.purpose,
      );
      return { proof, expires_at: expires, receipt };
    });
  }
  private async proof(
    client: PoolClient,
    user: string,
    session: string,
    value: string,
    purpose: string,
  ) {
    const row = (
      await client.query(
        "SELECT * FROM privacy_verifications WHERE token_hash=$1 FOR UPDATE",
        [tokenHash(value)],
      )
    ).rows[0];
    if (
      !row ||
      row.user_id !== user ||
      row.session_id !== session ||
      row.purpose !== purpose
    )
      throw fail(
        403,
        "VERIFICATION_REQUIRED",
        "Verify this action with your current account password.",
      );
    if (row.used_at || new Date(row.expires_at) <= this.now())
      throw fail(403, "VERIFICATION_EXPIRED", "Verify your password again.");
    await client.query(
      "UPDATE privacy_verifications SET used_at=$2 WHERE token_hash=$1",
      [tokenHash(value), this.now()],
    );
  }
  project(row: Record<string, any>) {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      created_at: row.created_at,
      completed_at: row.completed_at,
      result: row.result,
      last_error: row.last_error,
    };
  }
  async request(
    token: string | undefined,
    input: z.infer<typeof privacyRequest>,
  ) {
    return this.database.transaction(async (client) => {
      const { user, session } = await this.auth.safetyIdentity(client, token);
      const old = (
        await client.query(
          "SELECT * FROM privacy_requests WHERE user_id=$1 AND request_key=$2",
          [user.id, input.request_key],
        )
      ).rows[0];
      if (old) {
        if (
          old.kind !== input.kind ||
          old.profile_id !== (input.profile_id || null)
        )
          throw fail(
            409,
            "REQUEST_KEY_CONFLICT",
            "That key belongs to another privacy request.",
          );
        return { request: this.project(old), replayed: true };
      }
      await this.proof(
        client,
        user.id,
        session.id,
        input.verification,
        input.kind,
      );
      if (input.kind !== "EXPORT" && !this.config.privacy)
        throw fail(
          409,
          "RETENTION_POLICY_REQUIRED",
          "An approved retention and recovery policy is required for erasure.",
        );
      if (input.kind !== "EXPORT")
        await ensurePrivacyPolicy(
          client,
          this.config.privacy!.policy,
          this.now(),
        );
      if (input.kind === "DELETE" && input.confirmation !== "DELETE MY ACCOUNT")
        throw fail(
          400,
          "CONFIRM_DELETION",
          "Confirm DELETE MY ACCOUNT to continue.",
        );
      if (input.kind === "WITHDRAW") {
        if (!input.profile_id)
          throw fail(
            400,
            "PROFILE_REQUIRED",
            "Choose an owned child Learner profile.",
          );
        const profile = (
          await client.query(
            "SELECT id FROM learner_profiles WHERE id=$1 AND owner_id=$2 AND kind='CHILD' FOR UPDATE",
            [input.profile_id, user.id],
          )
        ).rows[0];
        if (!profile)
          throw fail(404, "NOT_FOUND", "Child Learner profile not found.");
      } else if (input.profile_id)
        throw fail(
          400,
          "UNEXPECTED_PROFILE",
          "This action applies to the account.",
        );
      await this.auth.limits.consume(
        "privacy-export",
        user.id,
        3,
        86400000,
        client,
      );
      const row = (
        await client.query(
          "INSERT INTO privacy_requests(id,user_id,request_key,kind,profile_id,policy_snapshot,email_hash,test_only,verified_at,created_at,available_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$9) RETURNING *",
          [
            randomUUID(),
            user.id,
            input.request_key,
            input.kind,
            input.profile_id || null,
            input.kind === "EXPORT" ? null : this.config.privacy!.policy,
            availabilityEmailHash(user.email, this.config),
            this.config.mode !== "production",
            this.now(),
          ],
        )
      ).rows[0];
      if (input.kind === "WITHDRAW") {
        const scope = {
          consent_ids: (
            await client.query(
              "SELECT id FROM learner_consents WHERE profile_id=$1 AND owner_id=$2",
              [input.profile_id, user.id],
            )
          ).rows.map((r) => r.id),
          request_ids: (
            await client.query(
              "SELECT id FROM contact_requests WHERE learner_id=$1 AND payer_id=$2",
              [input.profile_id, user.id],
            )
          ).rows.map((r) => r.id),
        };
        row.withdraw_scope = scope;
        await client.query(
          "UPDATE privacy_requests SET withdraw_scope=$2 WHERE id=$1",
          [row.id, scope],
        );
        await archiveWithdrawal(client, row, user, this.config, this.now());
      }
      if (input.kind !== "EXPORT") {
        await client.query(
          "INSERT INTO privacy_tombstones(request_id,user_id,kind,profile_id,recorded_at) VALUES($1,$2,$3,$4,$5)",
          [row.id, user.id, row.kind, row.profile_id, this.now()],
        );
        await stopPrivacyActivity(
          client,
          user,
          row.kind,
          row.profile_id,
          row.email_hash,
          this.now(),
          row.withdraw_scope,
        );
      }
      await this.audit(client, user.id, "PRIVACY_REQUESTED", row.id);
      return { request: this.project(row), replayed: false };
    });
  }
  async state(token: string | undefined, receipt?: string) {
    return this.database.transaction(async (client) => {
      let userId: string | undefined,
        authenticated = false;
      try {
        const c = await this.auth.safetyIdentity(client, token);
        userId = c.user.id;
        authenticated = true;
      } catch (e) {
        if (!(e instanceof ApiProblem) || e.getStatus() !== 401) throw e;
      }
      if (!userId && receipt && /^[A-Za-z0-9_-]{43}$/.test(receipt))
        userId = (
          await client.query(
            "SELECT user_id FROM privacy_receipts WHERE token_hash=$1 AND expires_at>$2",
            [tokenHash(receipt), this.now()],
          )
        ).rows[0]?.user_id;
      if (!userId)
        throw fail(
          401,
          "UNAUTHENTICATED",
          "Sign in or use the browser that verified your privacy request.",
        );
      const requests = [];
      for (const r of (
        await client.query(
          "SELECT * FROM privacy_requests WHERE user_id=$1 AND (NOT $2::boolean OR NOT test_only) ORDER BY created_at DESC,id LIMIT 100",
          [userId, this.config.mode === "production"],
        )
      ).rows) {
        requests.push({
          ...this.project(r),
          result: {
            ...r.result,
            retained: await retainedSummary(client, r.id, this.now()),
          },
        });
      }
      const child_profiles = authenticated
        ? (
            await client.query(
              "SELECT id,alias FROM learner_profiles WHERE owner_id=$1 AND kind='CHILD' AND status='ACTIVE' ORDER BY created_at,id",
              [userId],
            )
          ).rows
        : [];
      return { authenticated, policy: this.policy(), requests, child_profiles };
    });
  }
  async download(token: string | undefined, id: string, verification: string) {
    return this.database.transaction(async (client) => {
      const { user, session } = await this.auth.safetyIdentity(client, token);
      const job = (
        await client.query(
          "SELECT * FROM privacy_requests WHERE id=$1 AND user_id=$2 AND (NOT $3::boolean OR NOT test_only)",
          [id, user.id, this.config.mode === "production"],
        )
      ).rows[0];
      if (!job) throw fail(404, "NOT_FOUND", "Export not found.");
      await this.proof(client, user.id, session.id, verification, "DOWNLOAD");
      const artifact = (
        await client.query(
          "SELECT * FROM privacy_exports WHERE request_id=$1",
          [id],
        )
      ).rows[0];
      if (!artifact || new Date(artifact.expires_at) <= this.now())
        throw fail(
          410,
          "EXPORT_EXPIRED",
          "The export is unavailable or expired. Request a new export.",
        );
      await this.audit(client, user.id, "PRIVACY_EXPORT_DOWNLOADED", id);
      return decrypt(artifact.encrypted_payload, this.config.authSecret);
    });
  }
  async inspectRetained(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const planned = (
        await client.query("SELECT * FROM privacy_retained WHERE id=$1", [id])
      ).rows[0];
      const actor = await this.staff.authorize(
        client,
        account,
        elevated,
        (planned?.scope || "TRUST") as StaffScope,
        planned ? [planned.user_id] : [],
      );
      const row = (
        await client.query(
          "SELECT r.*,p.test_only FROM privacy_retained r JOIN privacy_requests p ON p.id=r.request_id WHERE r.id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row || (this.config.mode === "production" && row.test_only))
        throw fail(404, "NOT_FOUND", "Retained record not found.");
      if (
        !row.encrypted_payload ||
        (new Date(row.expires_at) <= this.now() &&
          !(await retentionHeld(client, row)))
      )
        throw fail(
          410,
          "RETENTION_EXPIRED",
          "This retained payload has expired or was purged.",
        );
      await client.query(
        "INSERT INTO privacy_events(id,request_id,event,actor_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          row.request_id,
          "RETAINED_INSPECTED",
          actor.id,
          { record: id, class: row.class, reason },
          this.now(),
        ],
      );
      const decode = (v: any): any =>
        Array.isArray(v)
          ? v.map(decode)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([key, value]) =>
                  key.startsWith("encrypted_") &&
                  value &&
                  typeof value === "object" &&
                  "iv" in value
                    ? [
                        key.slice(10),
                        decode(decrypt(value as any, this.config.authSecret)),
                      ]
                    : [key, decode(value)],
                ),
              )
            : v;
      return {
        record: decode(decrypt(row.encrypted_payload, this.config.authSecret)),
        purpose: row.purpose,
        expires_at: row.expires_at,
      };
    });
  }
  async hold(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    input: {
      operation: "HOLD" | "RELEASE";
      reason: string;
      reference?: string;
      hold_id?: string;
    },
  ) {
    return this.database.transaction(async (client) => {
      const found = (
        await client.query("SELECT * FROM privacy_retained WHERE id=$1", [id])
      ).rows[0];
      const actor = await this.staff.authorize(
        client,
        account,
        elevated,
        (found?.scope || "TRUST") as StaffScope,
        found ? [found.user_id] : [],
      );
      const row = (
        await client.query(
          "SELECT r.*,p.test_only FROM privacy_retained r JOIN privacy_requests p ON p.id=r.request_id WHERE r.id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row || (this.config.mode === "production" && row.test_only))
        throw fail(404, "NOT_FOUND", "Retained record not found.");
      let hold;
      if (input.operation === "HOLD") {
        if (!input.reference)
          throw fail(
            400,
            "REFERENCE_REQUIRED",
            "Record the legal or case reference for this hold.",
          );
        if (
          !row.encrypted_payload ||
          (new Date(row.expires_at) <= this.now() &&
            !(await retentionHeld(client, row)))
        )
          throw fail(
            410,
            "RETENTION_EXPIRED",
            "Expired or purged data cannot be restored by a new hold.",
          );
        hold = (
          await client.query(
            "INSERT INTO privacy_holds(id,user_id,class,scope,reference,reason,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,reference,reason,created_at",
            [
              randomUUID(),
              row.user_id,
              row.class,
              row.scope,
              input.reference,
              input.reason,
              actor.id,
              this.now(),
            ],
          )
        ).rows[0];
      } else {
        if (!input.hold_id)
          throw fail(400, "HOLD_REQUIRED", "Choose an active matching hold.");
        hold = (
          await client.query(
            "UPDATE privacy_holds SET released_at=$5,released_by=$6,release_reason=$7 WHERE id=$1 AND user_id=$2 AND class=$3 AND scope=$4 AND released_at IS NULL RETURNING id,reference,reason,released_at,release_reason",
            [
              input.hold_id,
              row.user_id,
              row.class,
              row.scope,
              this.now(),
              actor.id,
              input.reason,
            ],
          )
        ).rows[0];
        if (!hold)
          throw fail(
            409,
            "HOLD_NOT_ACTIVE",
            "That hold is not active for this retained class.",
          );
      }
      await client.query(
        "INSERT INTO privacy_events(id,request_id,event,actor_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          row.request_id,
          "RETENTION_" + input.operation,
          actor.id,
          {
            record: id,
            hold_id: hold.id,
            reason: input.reason,
            reference: input.reference,
          },
          this.now(),
        ],
      );
      return { hold };
    });
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
      await this.audit(client, actor.id, "PRIVACY_QUEUE_INSPECTED", scope);
      await client.query(
        "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          actor.id,
          "PRIVACY_QUEUE_PURPOSE",
          randomUUID(),
          this.now(),
          { scope, reason },
        ],
      );
      const requests = (
        await client.query(
          "SELECT p.* FROM privacy_requests p WHERE (NOT $2::boolean OR NOT p.test_only) AND ($1='SUPPORT' OR EXISTS(SELECT 1 FROM privacy_retained r WHERE r.request_id=p.id AND r.scope=$1)) ORDER BY (p.status='COMPLETED'),p.created_at,p.id LIMIT 100",
          [scope, this.config.mode === "production"],
        )
      ).rows;
      const retained = [];
      for (const p of requests) {
        for (const r of (
          await client.query(
            "SELECT id,user_id,class,scope,purpose,expires_at,purged_at FROM privacy_retained WHERE request_id=$1 AND scope=$2",
            [p.id, scope],
          )
        ).rows) {
          retained.push({
            id: r.id,
            request_id: p.id,
            class: r.class,
            purpose: r.purpose,
            expires_at: r.expires_at,
            purged: !!r.purged_at,
            held: await retentionHeld(client, r),
            holds: (
              await client.query(
                "SELECT id,reference,reason,created_at,released_at,release_reason FROM privacy_holds WHERE user_id=$1 AND class=$2 AND scope=$3 ORDER BY created_at,id",
                [r.user_id, r.class, scope],
              )
            ).rows,
          });
        }
      }
      return {
        requests: requests.map((r) => this.project(r)),
        retained,
        retention_runs: (
          await client.query(
            "SELECT id,status,purged_count,started_at,completed_at FROM privacy_retention_runs ORDER BY started_at DESC,id LIMIT 20",
          )
        ).rows,
      };
    });
  }
  async completeExternal(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
    reference: string,
  ) {
    return this.database.transaction(async (client) => {
      const planned = (
        await client.query("SELECT user_id FROM privacy_requests WHERE id=$1", [
          id,
        ])
      ).rows[0];
      const actor = await this.staff.authorize(
        client,
        account,
        elevated,
        "SUPPORT",
        planned ? [planned.user_id] : [],
      );
      const row = (
        await client.query(
          "SELECT * FROM privacy_requests WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row || (this.config.mode === "production" && row.test_only))
        throw fail(404, "NOT_FOUND", "Privacy request not found.");
      if (row.status !== "EXTERNAL_REVIEW")
        throw fail(
          409,
          "EXTERNAL_REVIEW_REQUIRED",
          "Only an outstanding provider propagation review can be confirmed.",
        );
      await client.query(
        "INSERT INTO privacy_events(id,request_id,event,actor_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          id,
          "EXTERNAL_PROPAGATION_CONFIRMED",
          actor.id,
          { reason, reference },
          this.now(),
        ],
      );
      await client.query(
        "UPDATE privacy_requests SET status='COMPLETED',completed_at=$2,result=result||$3::jsonb WHERE id=$1",
        [
          id,
          this.now(),
          JSON.stringify({ external_propagation: "CONFIRMED_BY_OPERATOR" }),
        ],
      );
      return { confirmed: true };
    });
  }
  async retry(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(
        client,
        account,
        elevated,
        "SUPPORT",
      );
      const row = (
        await client.query(
          "UPDATE privacy_requests SET status='QUEUED',attempts=0,available_at=$2,last_error=NULL WHERE id=$1 AND status IN ('FAILED','RETRYING') AND (NOT $3::boolean OR NOT test_only) RETURNING id",
          [id, this.now(), this.config.mode === "production"],
        )
      ).rows[0];
      if (!row)
        throw fail(
          409,
          "PRIVACY_RETRY_UNAVAILABLE",
          "Only failed or retrying jobs can be replayed.",
        );
      await client.query(
        "INSERT INTO privacy_events(id,request_id,event,actor_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), id, "JOB_RETRY", actor.id, { reason }, this.now()],
      );
      return { scheduled: true };
    });
  }
  async forgetReceipt(receipt: string | undefined) {
    if (receipt)
      await this.database.pool.query(
        "DELETE FROM privacy_receipts WHERE token_hash=$1",
        [tokenHash(receipt)],
      );
  }
}
