import { testCoverage, coverageAllowed } from "./paid-access.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import type { Config } from "./config.js";
import { ApiProblem } from "./errors.js";
import { StaffService } from "./staff.js";
import { encrypt, decrypt } from "./security.js";
import { z } from "zod";

type Row = Record<string, any>;
type RestrictionNotice = {
  id: string;
  case_id: string;
  target_type: "ACCOUNT" | "LISTING" | "CONNECTION";
  reason: string;
  created_at: string;
  lifted_at: string | null;
  lift_reason: string | null;
};
export type SafetyContextKind = "connection" | "request";
const missing = () =>
  new ApiProblem(404, "NOT_FOUND", "Safety context not found.");
const text = z
  .string()
  .trim()
  .min(10)
  .max(2000)
  .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const reportInput = z.strictObject({
  request_key: z.uuid(),
  category: z.enum(["HARASSMENT", "FRAUD", "CHILD_SAFETY", "OTHER"]),
  description: text,
  message_sequences: z
    .array(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER))
    .max(10)
    .refine((v) => new Set(v).size === v.length),
});
export const safetyPurpose = z.strictObject({
  reason: text.pipe(z.string().max(240)),
});
export const appealInput = z.strictObject({
  request_key: z.uuid(),
  description: text,
});
export const safetyAction = z.strictObject({
  revision: z.number().int().min(1),
  operation: z.enum([
    "RESTRICT_ACCOUNT",
    "LIFT_ACCOUNT",
    "RESTRICT_LISTING",
    "LIFT_LISTING",
    "RESTRICT_CONNECTION",
    "LIFT_CONNECTION",
    "RESOLVE",
    "DISMISS",
  ]),
  reason: safetyPurpose.shape.reason,
});
export class SafetyService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly config: Config,
    private readonly staff: StaffService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async member(
    client: PoolClient,
    token: string | undefined,
    id: string,
    kind: SafetyContextKind,
  ) {
    const row = (
      await client.query(
        `SELECT r.*,c.id AS connection_id FROM contact_requests r LEFT JOIN connections c ON c.request_id=r.id WHERE ${kind === "connection" ? "c.id" : "r.id"}=$1`,
        [id],
      )
    ).rows[0];
    const { user } = await this.auth.safetyIdentity(
      client,
      token,
      row ? [row.payer_id, row.tutor_id] : [],
    );
    if (
      !row ||
      ![row.payer_id, row.tutor_id].includes(user.id) ||
      !coverageAllowed(this.config, row.coverage_snapshot)
    )
      throw missing();
    if (
      kind === "connection" &&
      !(
        await client.query(
          "SELECT 1 FROM connection_participants WHERE connection_id=$1 AND user_id=$2",
          [id, user.id],
        )
      ).rowCount
    )
      throw missing();
    return {
      row,
      actor: user,
      peer: user.id === row.payer_id ? row.tutor_id : row.payer_id,
    };
  }
  private async blockState(
    client: PoolClient,
    row: Row,
    actor: string,
    peer: string,
  ) {
    const rows = (
      await client.query(
        "SELECT owner_id FROM account_blocks WHERE (owner_id=$1 AND blocked_id=$2) OR (owner_id=$2 AND blocked_id=$1)",
        [actor, peer],
      )
    ).rows;
    return {
      actor_id: actor,
      offer_title: row.offer_snapshot.title,
      blocked_by_you: rows.some((r) => r.owner_id === actor),
      communication_blocked: rows.length > 0,
      peer_role: peer === row.tutor_id ? "TUTOR" : "PAYER",
    };
  }
  private async audit(
    client: PoolClient,
    actor: string,
    event: string,
    target: string,
    correlation: string,
    extra: Row = {},
  ) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        actor,
        event,
        correlation,
        this.now(),
        { target, ...extra },
      ],
    );
  }
  async context(
    token: string | undefined,
    id: string,
    kind: SafetyContextKind,
  ) {
    return this.database.transaction(async (client) => {
      const { row, actor, peer } = await this.member(client, token, id, kind);
      return this.blockState(client, row, actor.id, peer);
    });
  }
  async block(
    token: string | undefined,
    id: string,
    kind: SafetyContextKind,
    blocked: boolean,
    correlation: string,
  ) {
    return this.database.transaction(async (client) => {
      const { row, actor, peer } = await this.member(client, token, id, kind);
      const result = blocked
        ? await client.query(
            "INSERT INTO account_blocks(owner_id,blocked_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [actor.id, peer, this.now()],
          )
        : await client.query(
            "DELETE FROM account_blocks WHERE owner_id=$1 AND blocked_id=$2",
            [actor.id, peer],
          );
      if (result.rowCount)
        await this.audit(
          client,
          actor.id,
          blocked ? "ACCOUNT_BLOCKED" : "ACCOUNT_UNBLOCKED",
          peer,
          correlation,
        );
      return this.blockState(client, row, actor.id, peer);
    });
  }
  private summary(row: Row) {
    return {
      id: row.id,
      status: row.status,
      category: row.category,
      revision: row.revision,
      created_at: new Date(row.created_at).toISOString(),
      public_notice: row.public_notice,
    };
  }
  async report(
    token: string | undefined,
    id: string,
    kind: SafetyContextKind,
    input: z.infer<typeof reportInput>,
    correlation: string,
  ) {
    return this.database.transaction(async (client) => {
      const { row, actor, peer } = await this.member(client, token, id, kind);
      const canonical = {
        kind,
        target_id: id,
        ...input,
        message_sequences: [...input.message_sequences].sort((a, b) => a - b),
      };
      const prior = (
        await client.query(
          "SELECT * FROM safety_cases WHERE reporter_id=$1 AND request_key=$2",
          [actor.id, input.request_key],
        )
      ).rows[0];
      if (prior) {
        if (
          JSON.stringify(
            decrypt<Row>(prior.encrypted_report, this.config.authSecret).input,
          ) !== JSON.stringify(canonical)
        )
          throw new ApiProblem(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This report identifier was already used for different details.",
          );
        return { case: this.summary(prior), replayed: true };
      }
      const messages = canonical.message_sequences.length
        ? (
            await client.query(
              "SELECT m.* FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.connection_id=$1 AND m.sequence=ANY($2::bigint[]) ORDER BY m.sequence",
              [row.connection_id, canonical.message_sequences],
            )
          ).rows
        : [];
      if (messages.length !== canonical.message_sequences.length)
        throw new ApiProblem(
          400,
          "INVALID_EVIDENCE",
          "Choose messages from this conversation.",
        );
      await this.auth.limits.consume(
        "safety-report",
        actor.id,
        10,
        3600000,
        client,
      );
      const evidence = {
        offer_title: row.offer_snapshot.title,
        messages: messages.map((m) => ({
          sequence: Number(m.sequence),
          text: decrypt<{ text: string }>(
            m.encrypted_text,
            this.config.authSecret,
          ).text,
          sender_role: m.sender_id === row.tutor_id ? "TUTOR" : "PAYER",
          created_at: new Date(m.created_at).toISOString(),
        })),
        ...(kind === "request"
          ? {
              initial_request: decrypt<Row>(
                row.encrypted_message,
                this.config.authSecret,
              ),
            }
          : {}),
      };
      const caseId = randomUUID();
      const created = (
        await client.query(
          "INSERT INTO safety_cases(id,reporter_id,subject_id,request_id,connection_id,listing_id,request_key,category,encrypted_report,test_only,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *",
          [
            caseId,
            actor.id,
            peer,
            row.id,
            row.connection_id,
            row.listing_id,
            input.request_key,
            input.category,
            encrypt({ input: canonical, evidence }, this.config.authSecret),
            testCoverage(row.coverage_snapshot),
            this.now(),
          ],
        )
      ).rows[0];
      await this.audit(
        client,
        actor.id,
        "SAFETY_REPORT_SUBMITTED",
        caseId,
        correlation,
        { category: input.category, evidence_count: messages.length },
      );
      return { case: this.summary(created), replayed: false };
    });
  }
  private async staffCase(
    client: PoolClient,
    account: string | undefined,
    token: string | undefined,
    id: string,
  ) {
    const planned = (
      await client.query(
        "SELECT reporter_id,subject_id FROM safety_cases WHERE id=$1",
        [id],
      )
    ).rows[0];
    const actor = await this.staff.authorize(
      client,
      account,
      token,
      "TRUST",
      planned ? [planned.reporter_id, planned.subject_id] : [],
    );
    const row = (
      await client.query("SELECT * FROM safety_cases WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!row || (this.config.mode === "production" && row.test_only))
      throw missing();
    if ([row.reporter_id, row.subject_id].includes(actor.id))
      throw new ApiProblem(
        403,
        "SELF_REVIEW",
        "Use another Trust reviewer for a case involving your account.",
      );
    return { row, actor };
  }
  async inspect(
    account: string | undefined,
    token: string | undefined,
    id: string,
    reason: string,
    correlation: string,
  ) {
    return this.database.transaction(async (client) => {
      const { row, actor } = await this.staffCase(client, account, token, id);
      await this.audit(
        client,
        actor.id,
        "SAFETY_CASE_INSPECTED",
        id,
        correlation,
        { reason },
      );
      const report = decrypt<Row>(row.encrypted_report, this.config.authSecret);
      const appeals = (
        await client.query(
          "SELECT * FROM safety_appeals WHERE case_id=$1 ORDER BY created_at,id",
          [id],
        )
      ).rows.map((a) => ({
        id: a.id,
        status: a.status,
        created_at: a.created_at,
        description: decrypt<{ description: string }>(
          a.encrypted_description,
          this.config.authSecret,
        ).description,
      }));
      return {
        case: {
          ...this.summary(row),
          description: report.input.description,
          evidence: report.evidence,
          connection_id: row.connection_id,
          request_id: row.request_id,
          restrictions: await this.restrictions(client, id),
          appeals,
        },
      };
    });
  }
  async queue(account: string | undefined, token: string | undefined) {
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(client, account, token, "TRUST");
      const rows = (
        await client.query(
          "SELECT * FROM safety_cases WHERE reporter_id<>$1 AND subject_id<>$1 AND (NOT $2::boolean OR NOT test_only) ORDER BY created_at DESC,id LIMIT 50",
          [actor.id, this.config.mode === "production"],
        )
      ).rows;
      return { cases: rows.map((row) => this.summary(row)) };
    });
  }
  private async restrictions(client: PoolClient, caseId: string) {
    return (
      await client.query(
        "SELECT id,target_type,target_id,reason,created_at,lifted_at,lift_reason FROM safety_restrictions WHERE case_id=$1 ORDER BY created_at,id",
        [caseId],
      )
    ).rows;
  }
  async action(
    account: string | undefined,
    token: string | undefined,
    id: string,
    input: z.infer<typeof safetyAction>,
    correlation: string,
  ) {
    return this.database.transaction((client) =>
      this.actionWithin(client, account, token, id, input, correlation),
    );
  }
  // Shared transaction command for appeal adjudication; all Trust checks remain here.
  async actionWithin(
    client: PoolClient,
    account: string | undefined,
    token: string | undefined,
    id: string,
    input: z.infer<typeof safetyAction>,
    correlation: string,
  ) {
    const { row, actor } = await this.staffCase(client, account, token, id);
    if (row.revision !== input.revision)
      throw new ApiProblem(
        409,
        "REVISION_CONFLICT",
        "Refresh the case before recording another decision.",
      );
    if (input.operation === "RESOLVE" || input.operation === "DISMISS") {
      if (row.status !== "OPEN")
        throw new ApiProblem(
          409,
          "CASE_CLOSED",
          "This case is already closed.",
        );
      if (
        input.operation === "DISMISS" &&
        (
          await client.query(
            "SELECT 1 FROM safety_restrictions WHERE case_id=$1 AND lifted_at IS NULL",
            [id],
          )
        ).rowCount
      )
        throw new ApiProblem(
          409,
          "ACTIVE_RESTRICTIONS",
          "Lift this case's restrictions explicitly before dismissing it.",
        );
    } else {
      const [operation, kind] = input.operation.split("_");
      const target =
        kind === "ACCOUNT"
          ? row.subject_id
          : kind === "LISTING"
            ? row.listing_id
            : row.connection_id;
      if (!target)
        throw new ApiProblem(
          409,
          "TARGET_UNAVAILABLE",
          "This report has no Connection to restrict.",
        );
      if (operation === "RESTRICT") {
        if (row.status !== "OPEN")
          throw new ApiProblem(
            409,
            "CASE_CLOSED",
            "Open cases can create new restrictions.",
          );
        if (
          (
            await client.query(
              "SELECT 1 FROM safety_restrictions WHERE case_id=$1 AND target_type=$2 AND target_id=$3 AND lifted_at IS NULL",
              [id, kind, target],
            )
          ).rowCount
        )
          throw new ApiProblem(
            409,
            "ALREADY_RESTRICTED",
            "This case already restricts that target.",
          );
        if (kind === "ACCOUNT" || kind === "LISTING") {
          // Pause published supply; lifting a case never silently republishes it.
          await client.query(
            "UPDATE teaching_listings SET status='PAUSED',revision=revision+1,updated_at=$3 WHERE status='PUBLISHED' AND (CASE WHEN $1='ACCOUNT' THEN user_id=$2::uuid ELSE id=$2::uuid END)",
            [kind, target, this.now()],
          );
        }
        await client.query(
          "INSERT INTO safety_restrictions(id,case_id,target_type,target_id,actor_id,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [randomUUID(), id, kind, target, actor.id, input.reason, this.now()],
        );
      } else {
        const changed = await client.query(
          "UPDATE safety_restrictions SET lifted_at=$4,lifted_by=$5,lift_reason=$6 WHERE case_id=$1 AND target_type=$2 AND target_id=$3 AND lifted_at IS NULL",
          [id, kind, target, this.now(), actor.id, input.reason],
        );
        if (!changed.rowCount)
          throw new ApiProblem(
            409,
            "NO_ACTIVE_RESTRICTION",
            "This case has no active restriction on that target.",
          );
      }
    }
    const status =
      input.operation === "RESOLVE"
        ? "RESOLVED"
        : input.operation === "DISMISS"
          ? "DISMISSED"
          : row.status;
    const changed = (
      await client.query(
        "UPDATE safety_cases SET revision=revision+1,status=$2,public_notice=$3,decided_by=$4,updated_at=$5 WHERE id=$1 RETURNING *",
        [id, status, input.reason, actor.id, this.now()],
      )
    ).rows[0];
    await this.audit(
      client,
      actor.id,
      "SAFETY_" + input.operation,
      id,
      correlation,
      { reason: input.reason, revision: changed.revision },
    );
    return {
      case: this.summary(changed),
      restrictions: await this.restrictions(client, id),
    };
  }

  async resolveAppealWithin(
    client: PoolClient,
    account: string | undefined,
    token: string | undefined,
    appealId: string,
    revision: number,
    operation:
      | "UPHOLD"
      | "SUPERSEDED"
      | "LIFT_ACCOUNT"
      | "LIFT_LISTING"
      | "LIFT_CONNECTION",
    reason: string,
  ) {
    const appeal = (
      await client.query("SELECT * FROM safety_appeals WHERE id=$1", [appealId])
    ).rows[0];
    if (!appeal) throw missing();
    const { row } = await this.staffCase(
      client,
      account,
      token,
      appeal.case_id,
    );
    if (appeal.status !== "PENDING_REVIEW")
      throw new ApiProblem(
        409,
        "APPEAL_CLOSED",
        "This appeal already has a decision.",
      );
    if (operation === "SUPERSEDED") {
      if (row.revision === revision)
        throw new ApiProblem(
          409,
          "APPEAL_CURRENT",
          "The appealed outcome is still current.",
        );
    } else {
      if (row.revision !== revision)
        throw new ApiProblem(
          409,
          "STALE_SAFETY_CASE",
          "The safety case changed. Inspect it and record this appeal as superseded.",
        );
      if (operation !== "UPHOLD")
        await this.actionWithin(
          client,
          account,
          token,
          row.id,
          { revision, operation, reason },
          randomUUID(),
        );
    }
    await client.query(
      "UPDATE safety_appeals SET status='RESOLVED' WHERE id=$1",
      [appealId],
    );
    return {
      safety_case_id: row.id,
      appealed_revision: revision,
      outcome: operation,
    };
  }
  async own(token: string | undefined) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const rows = (
        await client.query(
          "SELECT c.* FROM safety_cases c WHERE (reporter_id=$1 OR (subject_id=$1 AND EXISTS (SELECT 1 FROM safety_restrictions r WHERE r.case_id=c.id))) AND (NOT $2::boolean OR NOT test_only) ORDER BY created_at DESC,id LIMIT 50",
          [user.id, this.config.mode === "production"],
        )
      ).rows;
      const restrictions: RestrictionNotice[] = [];
      for (const row of rows)
        for (const restriction of await this.restrictions(client, row.id))
          restrictions.push({
            id: restriction.id,
            case_id: row.id,
            target_type: restriction.target_type,
            reason: restriction.reason,
            created_at: new Date(restriction.created_at).toISOString(),
            lifted_at: restriction.lifted_at
              ? new Date(restriction.lifted_at).toISOString()
              : null,
            lift_reason: restriction.lift_reason,
          });
      const blocks = (
        await client.query(
          "SELECT DISTINCT ON (b.blocked_id) CASE WHEN c.id IS NOT NULL THEN 'connection' ELSE 'request' END AS kind,COALESCE(c.id,r.id) AS target_id,r.offer_snapshot->>'title' AS offer_title FROM account_blocks b JOIN contact_requests r ON (r.payer_id=b.owner_id AND r.tutor_id=b.blocked_id) OR (r.tutor_id=b.owner_id AND r.payer_id=b.blocked_id) LEFT JOIN connections c ON c.request_id=r.id WHERE b.owner_id=$1 AND (NOT $2::boolean OR (r.coverage_snapshot->>'source'='PAYMENT' AND r.coverage_snapshot->>'test_only'='false')) ORDER BY b.blocked_id,r.created_at DESC,r.id",
          [user.id, this.config.mode === "production"],
        )
      ).rows;
      const appeals = (
        await client.query(
          "SELECT id,case_id,case_revision,status,created_at FROM safety_appeals WHERE actor_id=$1 ORDER BY created_at DESC,id LIMIT 50",
          [user.id],
        )
      ).rows;
      return {
        actor_id: user.id,
        cases: rows.map((row) => ({
          ...this.summary(row),
          relationship: row.reporter_id === user.id ? "REPORTER" : "SUBJECT",
          can_appeal:
            row.status !== "OPEN" ||
            restrictions.some((r) => r.case_id === row.id),
        })),
        restrictions,
        blocks,
        appeals,
      };
    });
  }
  async appeal(
    token: string | undefined,
    id: string,
    input: z.infer<typeof appealInput>,
    correlation: string,
  ) {
    return this.database.transaction(async (client) => {
      const planned = (
        await client.query(
          "SELECT reporter_id,subject_id FROM safety_cases WHERE id=$1",
          [id],
        )
      ).rows[0];
      const { user } = await this.auth.safetyIdentity(
        client,
        token,
        planned ? [planned.reporter_id, planned.subject_id] : [],
      );
      const row = (
        await client.query(
          "SELECT * FROM safety_cases WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !row ||
        ![row.reporter_id, row.subject_id].includes(user.id) ||
        (this.config.mode === "production" && row.test_only)
      )
        throw missing();
      const restrictions = await this.restrictions(client, id);
      if (row.status === "OPEN" && !restrictions.length)
        throw new ApiProblem(
          409,
          "NO_DECISION_TO_APPEAL",
          "This case has no recorded decision or restriction to appeal.",
        );
      const prior = (
        await client.query(
          "SELECT * FROM safety_appeals WHERE actor_id=$1 AND ((case_id=$2 AND case_revision=$3) OR request_key=$4)",
          [user.id, id, row.revision, input.request_key],
        )
      ).rows[0];
      const view = (a: Row) => ({
        id: a.id,
        case_id: a.case_id,
        status: a.status,
        created_at: a.created_at,
      });
      if (prior) {
        if (
          prior.case_id !== id ||
          prior.request_key !== input.request_key ||
          decrypt<{ description: string }>(
            prior.encrypted_description,
            this.config.authSecret,
          ).description !== input.description
        )
          throw new ApiProblem(
            409,
            "APPEAL_ALREADY_RECORDED",
            "An appeal was already recorded. Refresh its status.",
          );
        return { appeal: view(prior), replayed: true };
      }
      await this.auth.limits.consume(
        "safety-appeal",
        user.id,
        10,
        86400000,
        client,
      );
      const created = (
        await client.query(
          "INSERT INTO safety_appeals(id,case_id,actor_id,request_key,encrypted_description,created_at,case_revision) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            randomUUID(),
            id,
            user.id,
            input.request_key,
            encrypt({ description: input.description }, this.config.authSecret),
            this.now(),
            row.revision,
          ],
        )
      ).rows[0];
      await this.audit(
        client,
        user.id,
        "SAFETY_APPEAL_SUBMITTED",
        id,
        correlation,
        { appeal_id: created.id },
      );
      return { appeal: view(created), replayed: false };
    });
  }
}
