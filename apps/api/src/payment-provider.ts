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
export class RazorpayProvider implements PaymentProvider {
  constructor(
    private readonly settings: NonNullable<Config["payments"]>,
    private readonly transport: typeof fetch = fetch,
  ) {}
  private async call(path: string, body?: unknown) {
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
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("Payment provider request failed");
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
}
