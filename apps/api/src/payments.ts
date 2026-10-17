import {checkoutOpen} from './operations.js';
import { PaidAccess } from "./paid-access.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Config } from "./config.js";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { LearnersService } from "./learners.js";
import { ListingsService } from "./listings.js";
import { RateLimiter } from "./rate-limit.js";
import { ApiProblem } from "./errors.js";
import { validSignature, type PaymentProvider } from "./payment-provider.js";

export const purchaseInput = z.strictObject({
  request_key: z.uuid(),
  listing_id: z.uuid(),
  listing_revision: z.number().int().positive(),
  learner_id: z.uuid(),
  policy_version: z.literal("access-v1"),
});
export const confirmationInput = z.strictObject({
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
});
type Row = Record<string, any>;
const fail = (code: string, message: string, status = 409) =>
  new ApiProblem(status, code, message);
export class PaymentsService {
  private readonly limits: RateLimiter;
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly learners: LearnersService,
    private readonly listings: ListingsService,
    private readonly paidAccess: PaidAccess,
    private readonly provider: PaymentProvider | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.limits = new RateLimiter(database, config.authSecret, now);
  }
  async policy() {
    const policy = (
      await this.database.pool.query(
        "SELECT * FROM payment_policies WHERE version='access-v1'",
      )
    ).rows[0];
    return {
      policy,
      checkout_available: !!this.config.payments && await checkoutOpen(this.database.pool),
      disclosures: this.config.payments?.disclosures || null,
    };
  }
  private async recipient(
    client: PoolClient,
    payer: string,
    input: { learner_id: string; listing_id: string; listing_revision: number },
  ) {
    await this.learners.requireUsable(client, payer, input.learner_id);
    const listing = await this.listings.requireAvailable(
      client,
      input.listing_id,
    );
    if (listing.user_id === payer)
      throw fail("SELF_REQUEST", "Choose another Tutor.", 403);
    if (listing.revision !== input.listing_revision)
      throw fail(
        "OFFER_CHANGED",
        "This offer changed. Refresh it before checkout.",
      );
    if (
      (
        await client.query(
          "SELECT 1 FROM account_blocks WHERE (owner_id=$1 AND blocked_id=$2) OR (owner_id=$2 AND blocked_id=$1)",
          [payer, listing.user_id],
        )
      ).rowCount
    )
      throw fail(
        "CONTACT_BLOCKED",
        "A current block prevents checkout for this Tutor.",
        403,
      );
  }
  private async owner(
    client: PoolClient,
    token: string | undefined,
    id: string,
  ) {
    const found = (
      await client.query(
        "SELECT t.user_id FROM purchase_cycles p JOIN teaching_listings t ON t.id=p.listing_id WHERE p.id=$1",
        [id],
      )
    ).rows[0];
    const { user } = await this.auth.safetyIdentity(
      client,
      token,
      found ? [found.user_id] : [],
    );
    const row = (
      await client.query(
        "SELECT * FROM purchase_cycles WHERE id=$1 AND payer_id=$2 FOR UPDATE",
        [id, user.id],
      )
    ).rows[0];
    if (!row || (this.config.mode === "production" && row.test_only))
      throw fail("NOT_FOUND", "Purchase not found.", 404);
    return row;
  }
  private async view(client: PoolClient, row: Row) {
    let eligible = false;
    if (
      (row.status === "ORDER_READY" &&
        row.provider_key_id === this.config.payments?.keyId) ||
      row.status === "CAPTURED"
    ) {
      try {
        await this.recipient(client, row.payer_id, {
          learner_id: row.learner_id,
          listing_id: row.listing_id,
          listing_revision: row.listing_revision,
        });
        eligible = true;
      } catch (error) {
        if (!(error instanceof ApiProblem)) throw error;
      }
    }
    const journal = (
      await client.query(
        "SELECT kind,amount_paise,currency,captured_at FROM payment_journal WHERE cycle_id=$1 ORDER BY recorded_at,id",
        [row.id],
      )
    ).rows;
    const access = await this.paidAccess.summary(client, row);
    const cancelled=!!(await client.query('SELECT 1 FROM purchase_cancellations WHERE cycle_id=$1',[row.id])).rowCount;
    return {
      id: row.id,
      status: row.status,
      policy_version: row.policy_version,
      amount_paise: row.amount_paise,
      currency: row.currency,
      disclosures: row.disclosures,
      created_at: new Date(row.created_at).toISOString(),
      captured_at: row.captured_at
        ? new Date(row.captured_at).toISOString()
        : null,
      matching_deadline: row.matching_deadline
        ? new Date(row.matching_deadline).toISOString()
        : null,
      resolution_required: row.resolution_required,
      payment_attempt_failed: row.last_payment_failed,
      requires_alternative:
        row.status === "CAPTURED" && !eligible && access.status === "MATCHING",
      cancelled,
      access_active: access.status === "ACTIVE",
      access,
      journal,
      checkout:
        !cancelled && eligible && row.status === "ORDER_READY" && await checkoutOpen(client)
          ? {
              key_id: row.provider_key_id,
              order_id: row.provider_order_id,
              amount: row.amount_paise,
              currency: row.currency,
              merchant: row.disclosures.merchant,
            }
          : null,
    };
  }
  async detail(token: string | undefined, id: string) {
    return this.database.transaction(async (client) => ({
      purchase: await this.view(client, await this.owner(client, token, id)),
    }));
  }
  async current(token?: string) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const row = (
        await client.query(
          "SELECT id FROM purchase_cycles WHERE payer_id=$1 AND open AND (NOT $2::boolean OR NOT test_only)",
          [user.id, this.config.mode === "production"],
        )
      ).rows[0];
      return { purchase: row ? { id: row.id } : null };
    });
  }
  async confirm(
    token: string | undefined,
    id: string,
    input: z.infer<typeof confirmationInput>,
  ) {
    await this.limits.consume(
      "payment-confirm",
      token || "anonymous",
      30,
      900000,
    );
    const row = await this.database.transaction((client) =>
      this.owner(client, token, id),
    );
    if (
      !this.provider ||
      !this.config.payments ||
      row.provider_key_id !== this.config.payments.keyId
    )
      throw fail(
        "CHECKOUT_UNAVAILABLE",
        "Payment verification is unavailable.",
        503,
      );
    if (
      row.provider_order_id !== input.razorpay_order_id ||
      !validSignature(
        row.provider_order_id + "|" + input.razorpay_payment_id,
        input.razorpay_signature,
        this.config.payments.keySecret,
      )
    )
      throw fail(
        "INVALID_SIGNATURE",
        "Payment confirmation could not be verified.",
        400,
      );
    try {
      const payment = await this.provider.fetchPayment(
        input.razorpay_payment_id,
      );
      if (
        !payment ||
        payment.id !== input.razorpay_payment_id ||
        payment.order_id !== row.provider_order_id ||
        payment.amount !== row.amount_paise ||
        payment.currency !== row.currency
      )
        throw fail(
          "PAYMENT_MISMATCH",
          "The payment does not match this purchase.",
          400,
        );
      await this.database.pool.query(
        "UPDATE purchase_cycles SET status=CASE WHEN $2 THEN 'ORDER_READY' ELSE 'VERIFYING' END,last_payment_failed=$2,updated_at=$3 WHERE id=$1 AND status IN ('CREATING','UNKNOWN','ORDER_READY','VERIFYING')",
        [id, payment.status === "failed", this.now()],
      );
    } catch (error) {
      if (error instanceof ApiProblem) throw error;
      throw fail(
        "VERIFICATION_PENDING",
        "Payment verification is pending. Do not start another payment.",
        503,
      );
    }
    return this.detail(token, id);
  }
  async create(
    token: string | undefined,
    input: z.infer<typeof purchaseInput>,
    correlation: string,
  ) {
    await this.limits.consume(
      "payment-create",
      token || "anonymous",
      30,
      900000,
    );
    if (!this.provider || !this.config.payments)
      throw fail(
        "CHECKOUT_UNAVAILABLE",
        "Access Pass purchases are not available yet.",
        503,
      );
    const reservation = await this.database.transaction(async (client) => {
      const recipient = (
        await client.query(
          "SELECT user_id FROM teaching_listings WHERE id=$1",
          [input.listing_id],
        )
      ).rows[0];
      const { user } = await this.auth.authenticated(
        client,
        token,
        recipient ? [recipient.user_id] : [],
      );
      const retry = (
        await client.query(
          "SELECT * FROM purchase_cycles WHERE payer_id=$1 AND request_key=$2 FOR UPDATE",
          [user.id, input.request_key],
        )
      ).rows[0];
      if (retry) return { row: retry, created: false };
      if(!await checkoutOpen(client,true))throw fail("CHECKOUT_PAUSED","New Access Pass purchases are temporarily paused. Existing payment verification and refunds remain available.",503);
      await this.recipient(client, user.id, input);
      const existing = (
        await client.query(
          "SELECT * FROM purchase_cycles WHERE payer_id=$1 AND open FOR UPDATE",
          [user.id],
        )
      ).rows[0];
      if (existing) {
        if (!(await this.paidAccess.canRepurchase(client, existing)))
          return { row: existing, created: false };
        await client.query(
          "UPDATE purchase_cycles SET open=false,updated_at=$2 WHERE id=$1",
          [existing.id, this.now()],
        );
      }
      const policy = (
        await client.query("SELECT * FROM payment_policies WHERE version=$1", [
          input.policy_version,
        ])
      ).rows[0];
      const id = randomUUID();
      const at = this.now();
      const row = (
        await client.query(
          "INSERT INTO purchase_cycles(id,payer_id,learner_id,listing_id,listing_revision,request_key,policy_version,amount_paise,currency,provider_key_id,test_only,disclosures,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'CREATING',$13,$13) RETURNING *",
          [
            id,
            user.id,
            input.learner_id,
            input.listing_id,
            input.listing_revision,
            input.request_key,
            policy.version,
            policy.amount_paise,
            policy.currency,
            this.config.payments!.keyId,
            this.config.payments!.mode === "test",
            this.config.payments!.disclosures,
            at,
          ],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,'CHECKOUT_RESERVED',$3,$4,$5)",
        [
          randomUUID(),
          user.id,
          correlation,
          at,
          { target: id, policy_version: policy.version },
        ],
      );
      return { row, created: true };
    });
    if (reservation.created) {
      try {
        // Commit before the external request. Never repeat a possibly successful Order POST.
        const order = await this.provider.createOrder(
          reservation.row.id,
          reservation.row.amount_paise,
          reservation.row.currency,
        );
        if (
          order.amount !== reservation.row.amount_paise ||
          order.currency !== reservation.row.currency ||
          order.receipt !== reservation.row.id ||
          !/^order_[A-Za-z0-9]+$/.test(order.id)
        )
          throw new Error("Unexpected Order");
        await this.database.pool.query(
          "UPDATE purchase_cycles SET provider_order_id=COALESCE(provider_order_id,$2),status=CASE WHEN status IN ('CREATING','UNKNOWN') THEN 'ORDER_READY' ELSE status END,updated_at=$3 WHERE id=$1 AND (provider_order_id IS NULL OR provider_order_id=$2)",
          [reservation.row.id, order.id, this.now()],
        );
      } catch {
        await this.database.pool.query(
          "UPDATE purchase_cycles SET status='UNKNOWN',updated_at=$2 WHERE id=$1 AND status='CREATING'",
          [reservation.row.id, this.now()],
        );
      }
    }
    return this.detail(token, reservation.row.id);
  }
}
