import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import { ApiProblem } from "./errors.js";
import {
  ProviderRequestError,
  refundSchema,
  type RefundProvider,
} from "./payment-provider.js";
type Row = Record<string, any>;
export const financeReason = z.string().trim().min(10).max(240);
export const reserveInput = z.strictObject({
  reference: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/),
  amount_paise: z.number().int().positive().max(100000000),
  reason: financeReason,
});
const missing = () =>
  new ApiProblem(404, "NOT_FOUND", "Purchase or refund not found.");

export class RefundsService {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly provider: RefundProvider | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async audit(
    client: PoolClient,
    actor: string | null,
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
      amount_paise: Number(row.amount_paise),
      currency: row.currency,
      reason: row.reason,
      status: row.status,
      provider_refund_id: row.provider_refund_id,
      last_error: row.last_error,
      attempts: row.attempts,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }
  async detail(token: string | undefined, id: string) {
    return this.database.transaction(async (client) => {
      const cycle = await this.owner(client, token, id);
      const cancellation =
        (
          await client.query(
            "SELECT reason,created_at FROM purchase_cancellations WHERE cycle_id=$1",
            [id],
          )
        ).rows[0] || null;
      const activated = !!(
        await client.query(
          "SELECT 1 FROM access_entitlements WHERE cycle_id=$1 AND starts_at IS NOT NULL",
          [id],
        )
      ).rowCount;
      return {
        cancelled: !!cancellation,
        cancellation,
        can_cancel: !cancellation && !activated && cycle.open,
        can_review: activated,
        refunds: (
          await client.query(
            "SELECT * FROM refund_operations WHERE cycle_id=$1 ORDER BY created_at,id",
            [id],
          )
        ).rows.map((row) => this.project(row)),
        bank_notice:
          "A processed refund is confirmed by the payment provider. Bank credit timing depends on your payment method and bank.",
      };
    });
  }
  // The purchase is locked before entitlement/request transitions, as in acceptance.
  async revokeAcquisition(client: PoolClient, cycle: Row) {
    await client.query(
      "UPDATE purchase_cycles SET resolution_required=true,updated_at=$2 WHERE id=$1",
      [cycle.id, this.now()],
    );
    await client.query(
      "UPDATE access_entitlements SET status='REVOKED' WHERE cycle_id=$1 AND status<>'REVOKED'",
      [cycle.id],
    );
    await client.query(
      "UPDATE contact_requests SET status='CANCELLED',updated_at=$2 WHERE coverage_snapshot->>'cycle_id'=$1 AND status='PENDING'",
      [cycle.id, this.now()],
    );
  }
  private async cancelLocked(
    client: PoolClient,
    cycle: Row,
    reason: "PAYER_CANCELLED" | "NO_MATCH",
    actor: string | null,
  ) {
    const previous = (
      await client.query(
        "SELECT 1 FROM purchase_cancellations WHERE cycle_id=$1",
        [cycle.id],
      )
    ).rowCount;
    if (previous) return;
    const grant = (
      await client.query(
        "SELECT * FROM access_entitlements WHERE cycle_id=$1 FOR UPDATE",
        [cycle.id],
      )
    ).rows[0];
    if (grant?.starts_at)
      throw new ApiProblem(
        409,
        "ALREADY_ACTIVATED",
        "This Access Pass has been activated. Request a reviewed refund instead.",
      );
    await client.query(
      "INSERT INTO purchase_cancellations(cycle_id,reason,actor_id,created_at) VALUES($1,$2,$3,$4)",
      [cycle.id, reason, actor, this.now()],
    );
    await this.revokeAcquisition(client, cycle);
    await this.audit(client, actor, "PURCHASE_CANCELLED", cycle.id, reason);
  }
  async cancel(token: string | undefined, id: string) {
    await this.database.transaction(async (client) => {
      const cycle = await this.owner(client, token, id);
      await this.cancelLocked(client, cycle, "PAYER_CANCELLED", cycle.payer_id);
      await this.ensureCancellationRefunds(client, cycle);
    });
    return this.detail(token, id);
  }
  // Call only while the purchase lock is held. All pending/unknown operations
  // continue reserving captured funds; transport uncertainty cannot free money.
  async createOperation(
    client: PoolClient,
    cycle: Row,
    capture: Row,
    amount: number,
    key: string,
    reason: string,
  ) {
    const previous = (
      await client.query(
        "SELECT * FROM refund_operations WHERE business_key=$1",
        [key],
      )
    ).rows[0];
    if (previous) return previous;
    const used = Number(
      (
        await client.query(
          "SELECT COALESCE(sum(amount_paise),0) AS total FROM refund_operations WHERE capture_id=$1",
          [capture.id],
        )
      ).rows[0].total,
    );
    const chargebacks = Number(
      (
        await client.query(
          "SELECT COALESCE(sum(amount_paise),0) AS total FROM reversal_journal WHERE capture_id=$1 AND kind='CHARGEBACK'",
          [capture.id],
        )
      ).rows[0].total,
    );
    const exposures = Number(
      (
        await client.query(
          "SELECT COALESCE(sum(amount_paise),0) AS total FROM payment_disputes WHERE capture_id=$1 AND status IN ('open','under_review')",
          [capture.id],
        )
      ).rows[0].total,
    );
    const external = Number(
      (
        await client.query(
          "SELECT COALESCE(sum(amount_paise),0) AS total FROM external_refunds WHERE capture_id=$1 AND status IN ('pending','processed')",
          [capture.id],
        )
      ).rows[0].total,
    );
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      used + chargebacks + exposures + external + amount >
        Number(capture.amount_paise)
    )
      throw new ApiProblem(
        409,
        "REFUND_LIMIT",
        "The remaining captured amount cannot fund this refund.",
      );
    const id = randomUUID();
    return (
      await client.query(
        "INSERT INTO refund_operations(id,cycle_id,capture_id,business_key,amount_paise,currency,reason,provider_body,status,next_attempt_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'WAITING_RESERVE',$9,$9,$9) RETURNING *",
        [
          id,
          cycle.id,
          capture.id,
          key,
          amount,
          capture.currency,
          reason,
          { amount, speed: "normal", receipt: id },
          this.now(),
        ],
      )
    ).rows[0];
  }
  private async ensureCancellationRefunds(client: PoolClient, cycle: Row) {
    if (
      !(
        await client.query(
          "SELECT 1 FROM purchase_cancellations WHERE cycle_id=$1",
          [cycle.id],
        )
      ).rowCount
    )
      return;
    for (const capture of (
      await client.query(
        "SELECT * FROM payment_journal WHERE cycle_id=$1 ORDER BY id",
        [cycle.id],
      )
    ).rows) {
      if (
        (
          await client.query(
            "SELECT 1 FROM refund_operations WHERE capture_id=$1",
            [capture.id],
          )
        ).rowCount
      )
        continue;
      await this.createOperation(
        client,
        cycle,
        capture,
        Number(capture.amount_paise),
        "cancellation:" + capture.id,
        "CANCELLATION",
      );
    }
  }

  async funding(
    account: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof reserveInput>,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      if (!this.config.payments)
        throw new ApiProblem(
          503,
          "PAYMENTS_UNCONFIGURED",
          "Configure the payment provider before recording its funded reserve.",
        );
      const key = this.config.payments.keyId;
      const prior = (
        await client.query(
          "SELECT * FROM refund_reserve_funding WHERE reference=$1",
          [input.reference],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.provider_key_id !== key ||
          Number(prior.amount_paise) !== input.amount_paise
        )
          throw new ApiProblem(
            409,
            "REFERENCE_CONFLICT",
            "This funding reference already has different terms.",
          );
        return { recorded: true, replayed: true };
      }
      await client.query(
        "INSERT INTO refund_reserves(provider_key_id,currency) VALUES($1,'INR') ON CONFLICT DO NOTHING",
        [key],
      );
      await client.query(
        "SELECT 1 FROM refund_reserves WHERE provider_key_id=$1 AND currency='INR' FOR UPDATE",
        [key],
      );
      const inserted = await client.query(
        "INSERT INTO refund_reserve_funding(reference,provider_key_id,amount_paise,currency,actor_id,reason,created_at) VALUES($1,$2,$3,'INR',$4,$5,$6) ON CONFLICT DO NOTHING",
        [
          input.reference,
          key,
          input.amount_paise,
          user.id,
          input.reason,
          this.now(),
        ],
      );
      if (!inserted.rowCount) {
        const stored = (
          await client.query(
            "SELECT * FROM refund_reserve_funding WHERE reference=$1",
            [input.reference],
          )
        ).rows[0];
        if (
          stored.provider_key_id !== key ||
          Number(stored.amount_paise) !== input.amount_paise
        )
          throw new ApiProblem(
            409,
            "REFERENCE_CONFLICT",
            "This funding reference already has different terms.",
          );
      }
      if (inserted.rowCount)
        await client.query(
          "UPDATE refund_reserves SET confirmed_paise=confirmed_paise+$2 WHERE provider_key_id=$1 AND currency='INR'",
          [key, input.amount_paise],
        );
      await this.audit(
        client,
        user.id,
        "REFUND_RESERVE_FUNDED",
        input.reference,
        input.reason,
      );
      return { recorded: true, replayed: !inserted.rowCount };
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
        "REFUND_QUEUE_READ",
        "refund-queue",
        reason,
      );
      return {
        refunds: (
          await client.query(
            "SELECT r.*,p.payer_id FROM refund_operations r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE NOT $1::boolean OR NOT p.test_only ORDER BY r.updated_at DESC,r.id LIMIT 100",
            [this.config.mode === "production"],
          )
        ).rows.map((row) => ({ ...this.project(row), cycle_id: row.cycle_id })),
        reserves: (
          await client.query(
            "SELECT * FROM refund_reserves WHERE provider_key_id=$1",
            [this.config.payments?.keyId || ""],
          )
        ).rows,
      };
    });
  }
  async retry(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      const row = (
        await client.query(
          "SELECT r.* FROM refund_operations r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE r.id=$1 AND (NOT $2::boolean OR NOT p.test_only)",
          [id, this.config.mode === "production"],
        )
      ).rows[0];
      if (!row) throw missing();
      await client.query(
        "UPDATE refund_operations SET next_attempt_at=$2,status=CASE WHEN status IN ('REVIEW','FAILED') THEN CASE WHEN provider_refund_id IS NULL THEN 'UNKNOWN' ELSE 'PENDING' END ELSE status END WHERE id=$1 AND status<>'PROCESSED'",
        [id, this.now()],
      );
      await this.audit(client, user.id, "REFUND_RETRY_REQUESTED", id, reason);
      return { scheduled: true };
    });
  }

  private async schedule() {
    return this.database.transaction(async (client) => {
      const cycle = (
        await client.query(
          `SELECT p.* FROM purchase_cycles p WHERE p.test_only=$2 AND (
    (p.captured_at IS NOT NULL AND p.matching_deadline<=$1 AND NOT EXISTS (SELECT 1 FROM access_entitlements a WHERE a.cycle_id=p.id AND a.starts_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM purchase_cancellations c WHERE c.cycle_id=p.id))
    OR EXISTS (SELECT 1 FROM purchase_cancellations c JOIN payment_journal j ON j.cycle_id=c.cycle_id WHERE c.cycle_id=p.id AND NOT EXISTS (SELECT 1 FROM refund_operations r WHERE r.capture_id=j.id))
    OR EXISTS (SELECT 1 FROM payment_journal j WHERE j.cycle_id=p.id AND j.kind='UNEXPECTED_CAPTURE' AND NOT EXISTS (SELECT 1 FROM refund_operations r WHERE r.capture_id=j.id))
    ) ORDER BY p.created_at,p.id LIMIT 1 FOR UPDATE OF p SKIP LOCKED`,
          [this.now(), this.config.mode !== "production"],
        )
      ).rows[0];
      if (!cycle) return false;
      const activated = !!(
        await client.query(
          "SELECT 1 FROM access_entitlements WHERE cycle_id=$1 AND starts_at IS NOT NULL",
          [cycle.id],
        )
      ).rowCount;
      const cancelled = !!(
        await client.query(
          "SELECT 1 FROM purchase_cancellations WHERE cycle_id=$1",
          [cycle.id],
        )
      ).rowCount;
      if (
        !cancelled &&
        !activated &&
        cycle.captured_at &&
        new Date(cycle.matching_deadline) <= this.now()
      )
        await this.cancelLocked(client, cycle, "NO_MATCH", null);
      await this.ensureCancellationRefunds(client, cycle);
      for (const capture of (
        await client.query(
          "SELECT j.* FROM payment_journal j WHERE j.cycle_id=$1 AND j.kind='UNEXPECTED_CAPTURE' AND NOT EXISTS (SELECT 1 FROM refund_operations r WHERE r.capture_id=j.id)",
          [cycle.id],
        )
      ).rows) {
        await this.createOperation(
          client,
          cycle,
          capture,
          Number(capture.amount_paise),
          "excess:" + capture.id,
          "EXCESS_CAPTURE",
        );
        await client.query(
          "INSERT INTO finance_exceptions(id,cycle_id,kind,reference,details,created_at) VALUES($1,$2,'EXCESS_CAPTURE',$3,$4,$5) ON CONFLICT(kind,reference) DO NOTHING",
          [
            randomUUID(),
            cycle.id,
            capture.id,
            {
              amount_paise: Number(capture.amount_paise),
              currency: capture.currency,
            },
            this.now(),
          ],
        );
      }
      return true;
    });
  }
  async tick(): Promise<boolean> {
    const scheduled = await this.schedule();
    if (!this.provider || !this.config.payments) return scheduled;
    const operation = await this.database.transaction(async (client) => {
      const row = (
        await client.query(
          `SELECT r.*,p.provider_key_id,j.provider_payment_id FROM refund_operations r JOIN purchase_cycles p ON p.id=r.cycle_id JOIN payment_journal j ON j.id=r.capture_id
     WHERE p.provider_key_id=$1 AND p.test_only=$2 AND r.status NOT IN ('PROCESSED','REVIEW','FAILED') AND r.next_attempt_at<=$3 AND (r.lease_until IS NULL OR r.lease_until<=$3)
     ORDER BY r.next_attempt_at,r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`,
          [
            this.config.payments!.keyId,
            this.config.mode !== "production",
            this.now(),
          ],
        )
      ).rows[0];
      if (!row) return undefined;
      if (!row.reserve_held) {
        const reserved = await client.query(
          "UPDATE refund_reserves SET reserved_paise=reserved_paise+$3 WHERE provider_key_id=$1 AND currency=$2 AND confirmed_paise-reserved_paise-spent_paise>=$3",
          [row.provider_key_id, row.currency, row.amount_paise],
        );
        if (!reserved.rowCount) {
          await client.query(
            "UPDATE refund_operations SET status='WAITING_RESERVE',last_error='INSUFFICIENT_RESERVE',next_attempt_at=$2,updated_at=$3 WHERE id=$1",
            [row.id, new Date(this.now().getTime() + 60000), this.now()],
          );
          return undefined;
        }
      }
      const lease = randomUUID();
      await client.query(
        "UPDATE refund_operations SET status='SENDING',reserve_held=true,lease_token=$2,lease_until=$3,attempts=attempts+1,updated_at=$4 WHERE id=$1",
        [row.id, lease, new Date(this.now().getTime() + 60000), this.now()],
      );
      return { ...row, lease_token: lease };
    });
    if (!operation) return scheduled;
    let result;
    let failure: string | undefined;
    try {
      result = refundSchema.parse(
        operation.provider_refund_id
          ? await this.provider.fetchRefund(operation.provider_refund_id)
          : await this.provider.createRefund(
              operation.provider_payment_id,
              operation.id,
              operation.provider_body,
            ),
      );
      if (
        (operation.provider_refund_id &&
          result.id !== operation.provider_refund_id) ||
        result.payment_id !== operation.provider_payment_id ||
        result.amount !== Number(operation.amount_paise) ||
        result.currency !== operation.currency ||
        (result.receipt && result.receipt !== operation.id)
      )
        failure = "PROVIDER_FACT_CONFLICT";
    } catch (error) {
      failure =
        error instanceof ProviderRequestError &&
        [400, 401, 403, 422].includes(error.status)
          ? "PROVIDER_REJECTED_REQUIRES_REVIEW"
          : "PROVIDER_RESULT_UNKNOWN";
    }
    await this.database.transaction(async (client) => {
      await client.query(
        "SELECT 1 FROM purchase_cycles WHERE id=$1 FOR UPDATE",
        [operation.cycle_id],
      );
      const row = (
        await client.query(
          "SELECT * FROM refund_operations WHERE id=$1 FOR UPDATE",
          [operation.id],
        )
      ).rows[0];
      if (
        row.lease_token !== operation.lease_token ||
        row.status === "PROCESSED"
      )
        return;
      const status = failure
        ? failure !== "PROVIDER_RESULT_UNKNOWN" || row.attempts >= 8
          ? "REVIEW"
          : "UNKNOWN"
        : result!.status.toUpperCase();
      if (status === "PROCESSED") {
        await client.query(
          "UPDATE refund_reserves SET reserved_paise=reserved_paise-$3,spent_paise=spent_paise+$3 WHERE provider_key_id=$1 AND currency=$2",
          [operation.provider_key_id, row.currency, row.amount_paise],
        );
        await client.query(
          "INSERT INTO reversal_journal(id,cycle_id,capture_id,operation_id,provider_reference,kind,amount_paise,currency,recorded_at) VALUES($1,$2,$3,$4,$5,'REFUND',$6,$7,$8) ON CONFLICT(operation_id) DO NOTHING",
          [
            randomUUID(),
            row.cycle_id,
            row.capture_id,
            row.id,
            result!.id,
            row.amount_paise,
            row.currency,
            this.now(),
          ],
        );
        await client.query(
          `UPDATE purchase_cycles p SET open=false,updated_at=$2 WHERE p.id=$1
      AND p.resolution_required
      AND NOT EXISTS (SELECT 1 FROM payment_journal j WHERE j.cycle_id=p.id AND j.amount_paise>(SELECT COALESCE(sum(r.amount_paise),0) FROM reversal_journal r WHERE r.capture_id=j.id))`,
          [row.cycle_id, this.now()],
        );
        await this.audit(
          client,
          null,
          "REFUND_PROCESSED",
          row.id,
          "Payment provider confirmed the refund",
        );
      }
      await client.query(
        "UPDATE refund_operations SET status=$2,provider_refund_id=COALESCE(provider_refund_id,$3),lease_token=NULL,lease_until=NULL,next_attempt_at=$4,last_error=$5,updated_at=$6 WHERE id=$1",
        [
          row.id,
          status,
          failure ? null : result!.id,
          new Date(
            this.now().getTime() +
              Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7)),
          ),
          failure || (status === "FAILED" ? "PROVIDER_REFUND_FAILED" : null),
          this.now(),
        ],
      );
    });
    return true;
  }
}
