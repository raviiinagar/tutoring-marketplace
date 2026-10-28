import {activateTutorPro} from './tutor-pro-access.js';
import { normalizeFinancialEvent } from "./financial-events.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config.js";
import { Database } from "./database.js";
import { ApiProblem } from "./errors.js";
import { tokenHash } from "./security.js";
import { validSignature, type PaymentProvider } from "./payment-provider.js";

const payment = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  amount: z.number().int().positive().safe(),
  currency: z.string().length(3),
  status: z.string(),
  captured: z.boolean(),
  created_at: z.number().int().positive(),
});
const envelope = z.object({
  event: z.string().max(100),
  created_at: z.number().int().positive(),
  payload: z.object({ payment: z.object({ entity: payment }) }),
});
// Verify exact bytes, then retain only financial fields, never card/contact payloads.
export class PaymentEvents {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly provider: PaymentProvider | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async ingest(raw: Buffer, eventId: string, signature: string) {
    const settings = this.config.payments;
    if (!settings || !this.provider)
      throw new ApiProblem(
        503,
        "CHECKOUT_UNAVAILABLE",
        "Payment processing is unavailable.",
      );
    if (
      !Buffer.isBuffer(raw) ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(eventId) ||
      !validSignature(raw, signature, settings.webhookSecret)
    )
      throw new ApiProblem(
        400,
        "INVALID_SIGNATURE",
        "Invalid payment webhook.",
      );
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new ApiProblem(400, "INVALID_WEBHOOK", "Invalid payment event.");
    }
    const kind = z.object({ event: z.string().max(100) }).safeParse(decoded);
    if (!kind.success)
      throw new ApiProblem(400, "INVALID_WEBHOOK", "Invalid payment event.");
    let financial;
    try {
      financial = normalizeFinancialEvent(decoded);
    } catch {
      throw new ApiProblem(400, "INVALID_WEBHOOK", "Invalid financial event.");
    }
    const supported = [
      "payment.captured",
      "payment.authorized",
      "payment.failed",
    ].includes(kind.data.event);
    const parsed = supported ? envelope.safeParse(decoded) : null;
    if (parsed && !parsed.success)
      throw new ApiProblem(400, "INVALID_WEBHOOK", "Invalid payment event.");
    const data =
      financial || (parsed?.success ? parsed.data : { event: kind.data.event });
    if (
      this.config.payments?.accountId &&
      (decoded as { account_id?: string }).account_id !==
        this.config.payments.accountId
    )
      throw new ApiProblem(
        400,
        "MERCHANT_MISMATCH",
        "Webhook merchant does not match configured account.",
      );
    const hash = tokenHash(raw.toString("base64"));
    await this.database.transaction(async (client) => {
      await client.query(
        "INSERT INTO payment_webhook_inbox(event_id,body_hash,event,provider_key_id,status,next_attempt_at,received_at) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(event_id) DO NOTHING",
        [
          eventId,
          hash,
          data,
          settings.keyId,
          supported || financial ? "PENDING" : "IGNORED",
          this.now(),
        ],
      );
      const previous = (
        await client.query(
          "SELECT body_hash FROM payment_webhook_inbox WHERE event_id=$1",
          [eventId],
        )
      ).rows[0];
      if (previous.body_hash !== hash)
        throw new ApiProblem(
          409,
          "EVENT_CONFLICT",
          "This event identifier has different content.",
        );
    });
    return { received: true };
  }
  async tick() {
    if (!this.provider || !this.config.payments) return false;
    const row = await this.database.transaction(async (client) => {
      const found = (
        await client.query(
          "SELECT * FROM payment_webhook_inbox WHERE status IN ('PENDING','UNMATCHED') AND event->>'event' IN ('payment.captured','payment.authorized','payment.failed') AND provider_key_id=$1 AND next_attempt_at<=$2 ORDER BY received_at,event_id LIMIT 1 FOR UPDATE SKIP LOCKED",
          [this.config.payments!.keyId, this.now()],
        )
      ).rows[0];
      if (found)
        await client.query(
          "UPDATE payment_webhook_inbox SET attempts=attempts+1,next_attempt_at=$2 WHERE event_id=$1",
          [found.event_id, new Date(this.now().getTime() + 30000)],
        );
      return found;
    });
    if (!row) return false;
    try {
      const event = envelope.parse(row.event);
      const reported = event.payload.payment.entity;
      // Provider calls run outside transactions with the inbox's bound credentials.
      const actual = await this.provider.fetchPayment(reported.id);
      const order = await this.provider.fetchOrder(reported.order_id);
      if (
        !actual ||
        !order ||
        actual.id !== reported.id ||
        actual.order_id !== reported.order_id ||
        order.id !== reported.order_id ||
        actual.amount !== reported.amount ||
        actual.currency !== reported.currency
      )
        throw new Error("Provider facts disagree");
      await this.database.transaction(async (client) => {
        const inbox = (
          await client.query(
            "SELECT status FROM payment_webhook_inbox WHERE event_id=$1 FOR UPDATE",
            [row.event_id],
          )
        ).rows[0];
        if (!["PENDING", "UNMATCHED"].includes(inbox.status)) return;
        const mark = async (status: string, error: string | null = null) =>
          client.query(
            "UPDATE payment_webhook_inbox SET status=$2,processed_at=$3,last_error=$4 WHERE event_id=$1",
            [row.event_id, status, this.now(), error],
          );
        const receipt = z.uuid().safeParse(order.receipt);
        const cycle = receipt.success
          ? (
              await client.query(
                "SELECT * FROM purchase_cycles WHERE id=$1 AND provider_key_id=$2 FOR UPDATE",
                [receipt.data, row.provider_key_id],
              )
            ).rows[0]
          : undefined;
        if (
          !cycle ||
          (cycle.provider_order_id && cycle.provider_order_id !== order.id)
        ) {
          await mark("UNMATCHED", "UNKNOWN_ORDER");
          return;
        }
        if (cycle.test_only !== (this.config.payments!.mode === "test")) {
          await mark("REVIEW", "MODE_MISMATCH");
          return;
        }
        if (!cycle.provider_order_id)
          await client.query(
            "UPDATE purchase_cycles SET provider_order_id=$2 WHERE id=$1",
            [cycle.id, order.id],
          );
        if (event.event !== "payment.captured") {
          if (!cycle.captured_at)
            await client.query(
              "UPDATE purchase_cycles SET status=CASE WHEN $2 THEN 'VERIFYING' ELSE 'ORDER_READY' END,last_payment_failed=$3,updated_at=$4 WHERE id=$1 AND status NOT IN ('REVIEW','CAPTURED')",
              [
                cycle.id,
                actual.captured || actual.status === "authorized",
                actual.status === "failed",
                this.now(),
              ],
            );
          await mark("PROCESSED");
          return;
        }
        if (
          !reported.captured ||
          reported.status !== "captured" ||
          !actual.captured ||
          !["captured", "refunded"].includes(actual.status) ||
          event.created_at < actual.created_at ||
          event.created_at * 1000 > this.now().getTime() + 300000 ||
          event.created_at * 1000 + 1000 < new Date(cycle.created_at).getTime()
        ) {
          await mark("REVIEW", "INVALID_CAPTURE_FACT");
          await client.query(
            "UPDATE purchase_cycles SET resolution_required=true,status='REVIEW' WHERE id=$1",
            [cycle.id],
          );
          return;
        }
        if (
          (
            await client.query(
              "SELECT 1 FROM payment_journal WHERE provider_payment_id=$1",
              [actual.id],
            )
          ).rowCount
        ) {
          await mark("PROCESSED");
          return;
        }
        const first = !(
          await client.query(
            "SELECT 1 FROM payment_journal WHERE cycle_id=$1 AND kind='CAPTURE'",
            [cycle.id],
          )
        ).rowCount;
        const expected =
          actual.amount === cycle.amount_paise &&
          actual.currency === cycle.currency &&
          order.amount === cycle.amount_paise &&
          order.currency === cycle.currency;
        const kind = first && expected ? "CAPTURE" : "UNEXPECTED_CAPTURE";
        const captured = new Date(event.created_at * 1000);
        const deadline = new Date(captured.getTime() + 72 * 3600000);
        await client.query(
          "INSERT INTO payment_journal(id,cycle_id,provider_payment_id,provider_order_id,kind,amount_paise,currency,captured_at,recorded_at,event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            randomUUID(),
            cycle.id,
            actual.id,
            order.id,
            kind,
            actual.amount,
            actual.currency,
            captured,
            this.now(),
            row.event_id,
          ],
        );
        if (kind === "CAPTURE")
          await client.query(
            "UPDATE purchase_cycles SET status='CAPTURED',captured_at=$2,matching_deadline=$3,last_payment_failed=false,resolution_required=resolution_required OR $4,updated_at=$5 WHERE id=$1",
            [
              cycle.id,
              captured,
              deadline,
              (cycle.product!=='TUTOR_PRO' && deadline <= this.now()) || actual.status === "refunded",
              this.now(),
            ],
          );
        else
          await client.query(
            "UPDATE purchase_cycles SET status='REVIEW',resolution_required=true,updated_at=$2 WHERE id=$1",
            [cycle.id, this.now()],
          );
        if(kind==='CAPTURE')await activateTutorPro(client,cycle,this.now());
        await mark("PROCESSED");
      });
    } catch {
      await this.database.pool.query(
        "UPDATE payment_webhook_inbox SET last_error='PROVIDER_VERIFICATION_PENDING',next_attempt_at=$2 WHERE event_id=$1 AND status IN ('PENDING','UNMATCHED')",
        [
          row.event_id,
          new Date(
            this.now().getTime() +
              Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7)),
          ),
        ],
      );
    }
    return true;
  }
}
