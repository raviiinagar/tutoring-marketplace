import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config.js";

const id = z.string().regex(/^(?:pay|order)_[A-Za-z0-9]+$/);
const orderSchema = z.object({
  id,
  entity: z.literal("order"),
  amount: z.number().int().positive(),
  currency: z.string(),
  receipt: z.string(),
  status: z.string(),
  notes: z.unknown().optional(),
});
const paymentSchema = z.object({
  id,
  entity: z.literal("payment"),
  order_id: id,
  amount: z.number().int().positive(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean(),
  created_at: z.number().int().positive(),
});
export type ProviderOrder = z.infer<typeof orderSchema>;
export type ProviderPayment = z.infer<typeof paymentSchema>;
export const refundSchema = z.object({
  id: z.string().regex(/^rfnd_[A-Za-z0-9]+$/),
  entity: z.literal("refund"),
  payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  amount: z.number().int().positive().safe(),
  currency: z.string().length(3),
  status: z.enum(["pending", "processed", "failed"]),
  receipt: z.string().nullable().optional(),
  created_at: z.number().int().positive(),
});
export type ProviderRefund = z.infer<typeof refundSchema>;
export const disputeSchema = z.object({
  id: z.string().regex(/^disp_[A-Za-z0-9]+$/),
  payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  amount: z.number().int().positive().safe(),
  currency: z.string().length(3),
  amount_deducted: z.number().int().nonnegative().safe().default(0),
  status: z.enum(["open", "under_review", "won", "lost", "closed"]),
  phase: z.string().max(80),
  created_at: z.number().int().positive(),
});
export type ProviderDispute = z.infer<typeof disputeSchema>;
export interface DisputeProvider {
  fetchDispute(id: string): Promise<ProviderDispute>;
}
export type RefundBody = { amount: number; speed: "normal"; receipt: string };
export interface RefundProvider {
  createRefund(
    paymentId: string,
    key: string,
    body: RefundBody,
  ): Promise<ProviderRefund>;
  fetchRefund(id: string): Promise<ProviderRefund>;
}
export const supportsRefunds = (
  provider: PaymentProvider | undefined,
): provider is PaymentProvider & RefundProvider =>
  !!provider && "createRefund" in provider && "fetchRefund" in provider;
export class ProviderRequestError extends Error {
  constructor(readonly status: number) {
    super("Payment provider rejected the request");
  }
}
export interface PaymentProvider {
  createOrder(
    cycle: string,
    amount: number,
    currency: string,
  ): Promise<ProviderOrder>;
  fetchOrder(id: string): Promise<ProviderOrder>;
  fetchPayment(id: string): Promise<ProviderPayment>;
}
export function validSignature(
  value: string | Buffer,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    createHmac("sha256", secret).update(value).digest(),
  );
}
export class RazorpayProvider
  implements PaymentProvider, RefundProvider, DisputeProvider
{
  constructor(
    private readonly settings: NonNullable<Config["payments"]>,
    private readonly transport: typeof fetch = fetch,
  ) {}
  private async call(
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ) {
    const response = await this.transport(
      "https://api.razorpay.com/v1/" + path,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              this.settings.keyId + ":" + this.settings.keySecret,
            ).toString("base64"),
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new ProviderRequestError(response.status);
    return response.json();
  }
  async createOrder(cycle: string, amount: number, currency: string) {
    return orderSchema.parse(
      await this.call("orders", {
        amount,
        currency,
        receipt: cycle,
        partial_payment: false,
        notes: { cycle_id: cycle },
      }),
    );
  }
  async fetchOrder(id: string) {
    return orderSchema.parse(
      await this.call("orders/" + encodeURIComponent(id)),
    );
  }
  async fetchPayment(id: string) {
    return paymentSchema.parse(
      await this.call("payments/" + encodeURIComponent(id)),
    );
  }
  async createRefund(paymentId: string, key: string, body: RefundBody) {
    return refundSchema.parse(
      await this.call(
        "payments/" + encodeURIComponent(paymentId) + "/refund",
        body,
        { "X-Refund-Idempotency": key },
      ),
    );
  }
  async fetchRefund(id: string) {
    return refundSchema.parse(
      await this.call("refunds/" + encodeURIComponent(id)),
    );
  }
  async fetchDispute(id: string) {
    return disputeSchema.parse(
      await this.call("disputes/" + encodeURIComponent(id)),
    );
  }
}
