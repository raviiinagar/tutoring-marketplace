import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import { RefundsService, financeReason } from "./refunds.js";
import { ApiProblem } from "./errors.js";
import { encrypt, decrypt } from "./security.js";
type Row = Record<string, any>;
export const refundCaseInput = z.strictObject({
  request_key: z.uuid(),
  reason: z.string().trim().min(20).max(1000),
});
export const refundReviewInput = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("APPROVE"),
    amount_paise: z.number().int().positive().max(59900),
    access_treatment: z.enum(["KEEP", "REVOKE_FUTURE"]),
    reason: financeReason,
  }),
  z.strictObject({ outcome: z.literal("DECLINE"), reason: financeReason }),
]);
const missing = () =>
  new ApiProblem(404, "NOT_FOUND", "Financial record not found.");
export async function financeException(
  client: PoolClient,
  cycle: string | null,
  kind: string,
  reference: string,
  details: unknown,
  at: Date,
  scope?: { providerKey?: string; testOnly: boolean },
) {
  const owner = cycle
    ? (
        await client.query(
          "SELECT provider_key_id,test_only FROM purchase_cycles WHERE id=$1",
          [cycle],
        )
      ).rows[0]
    : undefined;
  await client.query(
    "INSERT INTO finance_exceptions(id,cycle_id,kind,reference,details,created_at,provider_key_id,test_only) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(kind,reference) DO NOTHING",
    [
      randomUUID(),
      cycle,
      kind,
      reference,
      details,
      at,
      owner?.provider_key_id || scope?.providerKey || null,
      owner?.test_only ?? scope?.testOnly ?? true,
    ],
  );
}

export class FinanceService {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly refunds: RefundsService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async audit(
    client: PoolClient,
    actor: string,
    event: string,
    target: string,
    reason: string,
  ) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        actor,
        event,
        randomUUID(),
        this.now(),
        { target, reason },
      ],
    );
  }
  private async owner(
    client: PoolClient,
    token: string | undefined,
    id: string,
  ) {
    const { user } = await this.auth.safetyIdentity(client, token);
    const cycle = (
      await client.query(
        "SELECT * FROM purchase_cycles WHERE id=$1 AND payer_id=$2 FOR UPDATE",
        [id, user.id],
      )
    ).rows[0];
    if (!cycle || (this.config.mode === "production" && cycle.test_only))
      throw missing();
    return cycle;
  }
  private project(row: Row) {
    return {
      id: row.id,
      cycle_id: row.cycle_id,
      status: row.status,
      reason: decrypt<{ reason: string }>(
        row.encrypted_reason,
        this.config.authSecret,
      ).reason,
      review_reason: row.review_reason,
      reviewed_by: row.reviewed_by,
      amount_paise: row.amount_paise ? Number(row.amount_paise) : null,
      access_treatment: row.access_treatment,
      operation_id: row.operation_id,
      created_at: new Date(row.created_at).toISOString(),
      reviewed_at: row.reviewed_at
        ? new Date(row.reviewed_at).toISOString()
        : null,
    };
  }
  async createCase(
    token: string | undefined,
    id: string,
    input: z.infer<typeof refundCaseInput>,
  ) {
    return this.database.transaction(async (client) => {
      const cycle = await this.owner(client, token, id);
      const prior = (
        await client.query(
          "SELECT * FROM refund_cases WHERE payer_id=$1 AND request_key=$2",
          [cycle.payer_id, input.request_key],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.cycle_id !== id ||
          this.project(prior).reason !== input.reason
        )
          throw new ApiProblem(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This case key was used for different details.",
          );
        return { case: this.project(prior), replayed: true };
      }
      if (
        !(
          await client.query(
            "SELECT 1 FROM access_entitlements WHERE cycle_id=$1 AND starts_at IS NOT NULL",
            [id],
          )
        ).rowCount
      )
        throw new ApiProblem(
          409,
          "NOT_ACTIVATED",
          "Use pre-activation cancellation for this purchase.",
        );
      if (
        Number(
          (
            await client.query(
              "SELECT count(*) FROM refund_cases WHERE cycle_id=$1 AND status='OPEN'",
              [id],
            )
          ).rows[0].count,
        ) >= 5
      )
        throw new ApiProblem(
          409,
          "CASE_LIMIT",
          "Up to five refund cases may be awaiting review.",
        );
      const row = (
        await client.query(
          "INSERT INTO refund_cases(id,cycle_id,payer_id,request_key,encrypted_reason,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            randomUUID(),
            id,
            cycle.payer_id,
            input.request_key,
            encrypt({ reason: input.reason }, this.config.authSecret),
            this.now(),
          ],
        )
      ).rows[0];
      await this.audit(
        client,
        cycle.payer_id,
        "REFUND_CASE_OPENED",
        row.id,
        "Post-connection platform fee review requested",
      );
      return { case: this.project(row), replayed: false };
    });
  }
  async cases(token: string | undefined, id: string) {
    return this.database.transaction(async (client) => {
      await this.owner(client, token, id);
      return {
        cases: (
          await client.query(
            "SELECT * FROM refund_cases WHERE cycle_id=$1 ORDER BY created_at,id",
            [id],
          )
        ).rows.map((row) => this.project(row)),
        reversals: (
          await client.query(
            "SELECT kind,amount_paise,currency,provider_reference,recorded_at FROM reversal_journal WHERE cycle_id=$1 ORDER BY recorded_at,id",
            [id],
          )
        ).rows,
        disputes: (
          await client.query(
            "SELECT id,amount_paise,currency,status,phase,amount_deducted FROM payment_disputes WHERE cycle_id=$1",
            [id],
          )
        ).rows,
      };
    });
  }
  async queue(
    account: string | undefined,
    elevated: string | undefined,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      await this.audit(
        client,
        user.id,
        "FINANCE_CASES_READ",
        "refund-cases",
        reason,
      );
      return {
        cases: (
          await client.query(
            "SELECT c.* FROM refund_cases c JOIN purchase_cycles p ON p.id=c.cycle_id WHERE NOT $1::boolean OR NOT p.test_only ORDER BY c.created_at DESC,c.id LIMIT 100",
            [this.config.mode === "production"],
          )
        ).rows.map((row) => this.project(row)),
        exceptions: (
          await client.query(
            "SELECT e.* FROM finance_exceptions e LEFT JOIN purchase_cycles p ON p.id=e.cycle_id WHERE e.test_only<>$1::boolean ORDER BY e.created_at DESC,e.id LIMIT 100",
            [this.config.mode === "production"],
          )
        ).rows,
      };
    });
  }
  async review(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    input: z.infer<typeof refundReviewInput>,
  ) {
    return this.database.transaction(async (client) => {
      const found = (
        await client.query("SELECT * FROM refund_cases WHERE id=$1", [id])
      ).rows[0];
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
        found ? [found.payer_id] : [],
      );
      if (!found) throw missing();
      const cycle = (
        await client.query(
          "SELECT * FROM purchase_cycles WHERE id=$1 FOR UPDATE",
          [found.cycle_id],
        )
      ).rows[0];
      if (this.config.mode === "production" && cycle.test_only) throw missing();
      const row = (
        await client.query(
          "SELECT * FROM refund_cases WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (row.status !== "OPEN") {
        const same =
          row.status ===
            (input.outcome === "APPROVE" ? "APPROVED" : "DECLINED") &&
          row.review_reason === input.reason &&
          (input.outcome === "DECLINE" ||
            (Number(row.amount_paise) === input.amount_paise &&
              row.access_treatment === input.access_treatment));
        if (!same)
          throw new ApiProblem(
            409,
            "DECISION_RECORDED",
            "This case already has a recorded decision.",
          );
        return { case: this.project(row), replayed: true };
      }
      let operation;
      let amount = 0;
      let treatment = "KEEP";
      if (input.outcome === "APPROVE") {
        const capture = (
          await client.query(
            "SELECT * FROM payment_journal WHERE cycle_id=$1 AND kind='CAPTURE'",
            [cycle.id],
          )
        ).rows[0];
        if (!capture)
          throw new ApiProblem(
            409,
            "NO_CAPTURE",
            "No confirmed platform fee capture is available.",
          );
        const used = Number(
          (
            await client.query(
              "SELECT (SELECT COALESCE(sum(amount_paise),0) FROM refund_operations WHERE capture_id=$1)+(SELECT COALESCE(sum(amount_paise),0) FROM external_refunds WHERE capture_id=$1 AND status IN ('pending','processed'))+(SELECT COALESCE(sum(amount_paise),0) FROM reversal_journal WHERE capture_id=$1 AND kind='CHARGEBACK') AS total",
              [capture.id],
            )
          ).rows[0].total,
        );
        if (
          used + input.amount_paise === Number(capture.amount_paise) &&
          input.access_treatment !== "REVOKE_FUTURE"
        )
          throw new ApiProblem(
            409,
            "FULL_REFUND_REVOKES_ACQUISITION",
            "A full refund must revoke future acquisition rights.",
          );
        operation = await this.refunds.createOperation(
          client,
          cycle,
          capture,
          input.amount_paise,
          "case:" + row.id,
          "REVIEWED_ADJUSTMENT",
        );
        amount = input.amount_paise;
        treatment = input.access_treatment;
        if (treatment === "REVOKE_FUTURE")
          await this.refunds.revokeAcquisition(client, cycle);
      }
      const updated = (
        await client.query(
          "UPDATE refund_cases SET status=$2,reviewed_by=$3,review_reason=$4,amount_paise=$5,access_treatment=$6,operation_id=$7,reviewed_at=$8 WHERE id=$1 RETURNING *",
          [
            row.id,
            input.outcome === "APPROVE" ? "APPROVED" : "DECLINED",
            user.id,
            input.reason,
            amount,
            treatment,
            operation?.id || null,
            this.now(),
          ],
        )
      ).rows[0];
      await this.audit(
        client,
        user.id,
        "REFUND_CASE_DECIDED",
        row.id,
        input.reason,
      );
      return { case: this.project(updated), replayed: false };
    });
  }
}
