import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import { Database } from "./database.js";
import { RefundsService } from "./refunds.js";
import { financeException } from "./finance.js";
import { tokenHash } from "./security.js";
import {
  refundSchema,
  disputeSchema,
  settlementSchema,
  type PaymentProvider,
  type RefundProvider,
  type DisputeProvider,
} from "./payment-provider.js";
type Row = Record<string, any>;
const refundKinds = [
  "refund.created",
  "refund.processed",
  "refund.failed",
  "refund.speed_changed",
  "refund.reconciled",
];
const disputeKinds = [
  "payment.dispute.created",
  "payment.dispute.won",
  "payment.dispute.lost",
  "payment.dispute.closed",
  "payment.dispute.under_review",
  "payment.dispute.action_required",
];
export function normalizeFinancialEvent(value: unknown) {
  const event = z.object({ event: z.string() }).parse(value).event;
  if (event === "settlement.processed")
    return z
      .object({
        event: z.literal("settlement.processed"),
        account_id: z.string().max(100).optional(),
        created_at: z.number().int().positive(),
        payload: z.object({
          settlement: z.object({ entity: settlementSchema }),
        }),
      })
      .parse(value);
  if (![...refundKinds, ...disputeKinds].includes(event)) return null;
  return z
    .object({
      event: z.string(),
      account_id: z.string().max(100).optional(),
      created_at: z.number().int().positive(),
      payload: refundKinds.includes(event)
        ? z.object({ refund: z.object({ entity: refundSchema }) })
        : z.object({ dispute: z.object({ entity: disputeSchema }) }),
    })
    .parse(value);
}
export class FinancialEvents {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly provider:
      (PaymentProvider & RefundProvider & Partial<DisputeProvider>) | undefined,
    private readonly refunds: RefundsService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async reversal(
    client: PoolClient,
    cycle: Row,
    capture: Row,
    reference: string,
    kind: "REFUND" | "CHARGEBACK",
    amount: number,
    operation?: Row,
  ) {
    const previous = (
      await client.query(
        "SELECT amount_paise FROM reversal_journal WHERE provider_reference=$1",
        [reference],
      )
    ).rows[0];
    if (previous && Number(previous.amount_paise) !== amount)
      await financeException(
        client,
        cycle.id,
        "REVERSAL_FACT_CHANGED",
        reference,
        {
          recorded_paise: Number(previous.amount_paise),
          observed_paise: amount,
        },
        this.now(),
      );
    await client.query(
      "INSERT INTO reversal_journal(id,cycle_id,capture_id,operation_id,provider_reference,kind,amount_paise,currency,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(provider_reference) DO NOTHING",
      [
        randomUUID(),
        cycle.id,
        capture.id,
        operation?.id || null,
        reference,
        kind,
        amount,
        capture.currency,
        this.now(),
      ],
    );
    const total = Number(
      (
        await client.query(
          "SELECT COALESCE(sum(amount_paise),0) AS total FROM reversal_journal WHERE capture_id=$1",
          [capture.id],
        )
      ).rows[0].total,
    );
    if (total > Number(capture.amount_paise))
      await financeException(
        client,
        cycle.id,
        "EXCESS_REVERSAL",
        capture.id,
        { captured_paise: Number(capture.amount_paise), reversed_paise: total },
        this.now(),
      );
    if (total >= Number(capture.amount_paise)) {
      await this.refunds.revokeAcquisition(client, cycle);
      await client.query(
        "UPDATE purchase_cycles p SET open=false WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM payment_journal j WHERE j.cycle_id=p.id AND j.amount_paise>(SELECT COALESCE(sum(amount_paise),0) FROM reversal_journal r WHERE r.capture_id=j.id))",
        [cycle.id],
      );
    }
  }
  async tick(): Promise<boolean> {
    if (!this.provider || !this.config.payments) return false;
    const job = await this.database.transaction(async (client) => {
      const row = (
        await client.query(
          "SELECT * FROM payment_webhook_inbox WHERE status IN ('PENDING','UNMATCHED') AND event->>'event'=ANY($1::text[]) AND provider_key_id=$2 AND next_attempt_at<=$3 ORDER BY received_at,event_id LIMIT 1 FOR UPDATE SKIP LOCKED",
          [
            [...refundKinds, ...disputeKinds],
            this.config.payments!.keyId,
            this.now(),
          ],
        )
      ).rows[0];
      if (row)
        await client.query(
          "UPDATE payment_webhook_inbox SET attempts=attempts+1,next_attempt_at=$2 WHERE event_id=$1",
          [row.event_id, new Date(this.now().getTime() + 60000)],
        );
      return row;
    });
    if (!job) return false;
    try {
      const event = normalizeFinancialEvent(job.event)!;
      const refundEvent = refundKinds.includes(event.event);
      const payload = event.payload as Row;
      const reported = refundEvent
        ? payload.refund.entity
        : payload.dispute.entity;
      const actual = refundEvent
        ? refundSchema.parse(await this.provider.fetchRefund(reported.id))
        : disputeSchema.parse(await this.provider.fetchDispute?.(reported.id));
      if (
        actual.id !== reported.id ||
        actual.payment_id !== reported.payment_id ||
        actual.amount !== reported.amount ||
        actual.currency !== reported.currency
      )
        throw new Error("Provider financial identity mismatch");
      await this.database.transaction(async (client) => {
        const found = (
          await client.query(
            "SELECT j.*,p.provider_key_id,p.test_only FROM payment_journal j JOIN purchase_cycles p ON p.id=j.cycle_id WHERE j.provider_payment_id=$1 AND p.provider_key_id=$2",
            [actual.payment_id, job.provider_key_id],
          )
        ).rows[0];
        if (!found || found.test_only !== (this.config.mode !== "production")) {
          await client.query(
            "UPDATE payment_webhook_inbox SET status='UNMATCHED',last_error='UNKNOWN_CAPTURE' WHERE event_id=$1",
            [job.event_id],
          );
          return;
        }
        const cycle = (
          await client.query(
            "SELECT * FROM purchase_cycles WHERE id=$1 FOR UPDATE",
            [found.cycle_id],
          )
        ).rows[0];
        const inbox = (
          await client.query(
            "SELECT * FROM payment_webhook_inbox WHERE event_id=$1 FOR UPDATE",
            [job.event_id],
          )
        ).rows[0];
        if (!["PENDING", "UNMATCHED"].includes(inbox.status)) return;
        if (
          actual.currency !== found.currency ||
          actual.amount > Number(found.amount_paise)
        ) {
          await financeException(
            client,
            cycle.id,
            "PROVIDER_AMOUNT_MISMATCH",
            actual.id,
            { amount: actual.amount, currency: actual.currency },
            this.now(),
          );
          await client.query(
            "UPDATE payment_webhook_inbox SET status='REVIEW',last_error='FINANCIAL_FACT_CONFLICT' WHERE event_id=$1",
            [job.event_id],
          );
          return;
        }
        const prior = (
          await client.query(
            "SELECT fact FROM finance_observations WHERE provider_reference=$1 LIMIT 1",
            [actual.id],
          )
        ).rows[0];
        if (
          prior &&
          (prior.fact.payment_id !== actual.payment_id ||
            prior.fact.amount !== actual.amount ||
            prior.fact.currency !== actual.currency)
        ) {
          await financeException(
            client,
            cycle.id,
            "PROVIDER_IDENTITY_CONFLICT",
            actual.id,
            { amount_paise: actual.amount, currency: actual.currency },
            this.now(),
          );
          await client.query(
            "UPDATE payment_webhook_inbox SET status='REVIEW',last_error='PROVIDER_IDENTITY_CONFLICT' WHERE event_id=$1",
            [job.event_id],
          );
          return;
        }
        const fact = refundEvent
          ? refundSchema.parse(actual)
          : disputeSchema.parse(actual);
        await client.query(
          "INSERT INTO finance_observations(fingerprint,cycle_id,provider_reference,kind,fact,recorded_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
          [
            tokenHash(JSON.stringify(fact)),
            cycle.id,
            actual.id,
            refundEvent ? "REFUND" : "DISPUTE",
            fact,
            this.now(),
          ],
        );
        if (refundEvent) {
          const refund = refundSchema.parse(actual);
          const operation = (
            await client.query(
              "SELECT * FROM refund_operations WHERE capture_id=$1 AND (provider_refund_id=$2 OR id::text=$3) FOR UPDATE",
              [found.id, refund.id, refund.receipt || ""],
            )
          ).rows[0];
          if (
            operation &&
            (Number(operation.amount_paise) !== refund.amount ||
              operation.currency !== refund.currency ||
              (operation.provider_refund_id &&
                operation.provider_refund_id !== refund.id))
          ) {
            await financeException(
              client,
              cycle.id,
              "REFUND_OPERATION_CONFLICT",
              refund.id,
              { amount: refund.amount },
              this.now(),
            );
            await client.query(
              "UPDATE payment_webhook_inbox SET status='REVIEW',last_error='REFUND_OPERATION_CONFLICT' WHERE event_id=$1",
              [job.event_id],
            );
            return;
          }
          if (operation) {
            if (operation.status !== "PROCESSED") {
              if (refund.status === "processed") {
                if (operation.reserve_held)
                  await client.query(
                    "UPDATE refund_reserves SET reserved_paise=reserved_paise-$3,spent_paise=spent_paise+$3 WHERE provider_key_id=$1 AND currency=$2",
                    [cycle.provider_key_id, refund.currency, refund.amount],
                  );
                else
                  await financeException(
                    client,
                    cycle.id,
                    "REFUND_WITHOUT_LOCAL_RESERVE",
                    refund.id,
                    { amount_paise: refund.amount },
                    this.now(),
                  );
                await this.reversal(
                  client,
                  cycle,
                  found,
                  refund.id,
                  "REFUND",
                  refund.amount,
                  operation,
                );
              }
              await client.query(
                "UPDATE refund_operations SET provider_refund_id=$2,status=$3,lease_token=NULL,lease_until=NULL,next_attempt_at=$4,updated_at=$4,last_error=$5 WHERE id=$1",
                [
                  operation.id,
                  refund.id,
                  refund.status === "processed"
                    ? "PROCESSED"
                    : refund.status === "failed"
                      ? "FAILED"
                      : "PENDING",
                  this.now(),
                  refund.status === "failed" ? "PROVIDER_REFUND_FAILED" : null,
                ],
              );
            }
          } else {
            await client.query(
              "INSERT INTO external_refunds(id,capture_id,amount_paise,currency,status,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET status=CASE WHEN external_refunds.status='processed' THEN external_refunds.status ELSE EXCLUDED.status END,updated_at=EXCLUDED.updated_at",
              [
                refund.id,
                found.id,
                refund.amount,
                refund.currency,
                refund.status,
                this.now(),
              ],
            );
            await financeException(
              client,
              cycle.id,
              "EXTERNAL_REFUND",
              refund.id,
              { amount_paise: refund.amount, status: refund.status },
              this.now(),
            );
            await client.query(
              "UPDATE purchase_cycles SET resolution_required=true WHERE id=$1",
              [cycle.id],
            );
            if (refund.status === "processed")
              await this.reversal(
                client,
                cycle,
                found,
                refund.id,
                "REFUND",
                refund.amount,
              );
          }
        } else {
          const dispute = disputeSchema.parse(actual);
          await client.query(
            "INSERT INTO payment_disputes(id,cycle_id,capture_id,provider_key_id,amount_paise,currency,amount_deducted,status,phase,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,phase=EXCLUDED.phase,amount_deducted=EXCLUDED.amount_deducted,updated_at=EXCLUDED.updated_at",
            [
              dispute.id,
              cycle.id,
              found.id,
              cycle.provider_key_id,
              dispute.amount,
              dispute.currency,
              dispute.amount_deducted,
              dispute.status,
              dispute.phase,
              this.now(),
            ],
          );
          if (["open", "under_review", "lost"].includes(dispute.status))
            await client.query(
              "UPDATE purchase_cycles SET resolution_required=true WHERE id=$1",
              [cycle.id],
            );
          if (dispute.status === "lost" && dispute.amount_deducted > 0)
            await this.reversal(
              client,
              cycle,
              found,
              "chargeback:" + dispute.id,
              "CHARGEBACK",
              dispute.amount_deducted,
            );
          const reserved = Number(
            (
              await client.query(
                "SELECT COALESCE(sum(amount_paise),0) AS total FROM refund_operations WHERE capture_id=$1",
                [found.id],
              )
            ).rows[0].total,
          );
          if (
            reserved + dispute.amount > Number(found.amount_paise) &&
            ["open", "under_review", "lost"].includes(dispute.status)
          )
            await financeException(
              client,
              cycle.id,
              "OVERLAPPING_RECOVERY",
              dispute.id,
              {
                refund_reserved_paise: reserved,
                disputed_paise: dispute.amount,
              },
              this.now(),
            );
        }
        await client.query(
          "UPDATE payment_webhook_inbox SET status='PROCESSED',processed_at=$2,last_error=NULL WHERE event_id=$1",
          [job.event_id, this.now()],
        );
      });
    } catch {
      await this.database.pool.query(
        "UPDATE payment_webhook_inbox SET last_error='FINANCIAL_VERIFICATION_PENDING',next_attempt_at=$2 WHERE event_id=$1 AND status IN ('PENDING','UNMATCHED')",
        [job.event_id, new Date(this.now().getTime() + 60000)],
      );
    }
    return true;
  }
}
