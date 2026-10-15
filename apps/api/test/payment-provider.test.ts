import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { RazorpayProvider } from "../src/payment-provider.js";

const settings = {
  mode: "test" as const,
  keyId: "rzp_test_contract",
  keySecret: "fictional-contract-secret-321",
  webhookSecret: "fictional-contract-webhook-321",
  disclosures: {
    merchant: "Fictional merchant",
    invoice_notice: "Test only",
    base_paise: 59900,
    tax_paise: 0,
    test_only: true,
  },
};
test("Razorpay adapter uses server Orders without partial payment and validates provider responses", async () => {
  const cycle = "11111111-1111-4111-8111-111111111111";
  const transport: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://api.razorpay.com/v1/orders");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      amount: 59900,
      currency: "INR",
      receipt: cycle,
      partial_payment: false,
      notes: { cycle_id: cycle },
    });
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Basic " +
        Buffer.from(settings.keyId + ":" + settings.keySecret).toString(
          "base64",
        ),
    );
    return new Response(
      JSON.stringify({
        id: "order_contract",
        entity: "order",
        amount: 59900,
        currency: "INR",
        receipt: cycle,
        status: "created",
      }),
    );
  };
  const order = await new RazorpayProvider(settings, transport).createOrder(
    cycle,
    59900,
    "INR",
  );
  assert.equal(order.amount, 59900);
  await assert.rejects(
    new RazorpayProvider(
      settings,
      async () => new Response('{"id":"order_bad"}'),
    ).createOrder(cycle, 59900, "INR"),
  );
  await assert.rejects(
    new RazorpayProvider(
      settings,
      async () => new Response("{}", { status: 503 }),
    ).fetchPayment("pay_contract"),
  );
});
test("checkout is disabled by default and live configuration cannot invent merchant or tax disclosures", () => {
  const env = {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused/contract_test",
    AUTH_SECRET: "fictional-configuration-secret-321",
  };
  assert.equal(loadConfig(env).payments, undefined);
  assert.throws(
    () => loadConfig({ ...env, PAYMENT_MODE: "razorpay_live" }),
    /production isolation/,
  );
  const production = {
    ...env,
    NODE_ENV: "production",
    WEB_ORIGIN: "https://example.test",
    MAIL_TRANSPORT: "smtp",
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "fictional",
    SMTP_PASSWORD: "fictional",
    SMTP_FROM: "fictional@example.test",
  };
  assert.throws(
    () => loadConfig({ ...production, PAYMENT_MODE: "razorpay_test" }),
    /forbidden in production/,
  );
  assert.throws(
    () =>
      loadConfig({
        ...production,
        PAYMENT_MODE: "razorpay_live",
        RAZORPAY_KEY_ID: "rzp_live_contract",
        RAZORPAY_KEY_SECRET: settings.keySecret,
        RAZORPAY_WEBHOOK_SECRET: settings.webhookSecret,
      }),
    /tax breakdown/,
  );
  assert.throws(
    () =>
      loadConfig({
        ...production,
        PAYMENT_MODE: "razorpay_live",
        RAZORPAY_KEY_ID: "rzp_live_contract",
        RAZORPAY_KEY_SECRET: settings.keySecret,
        RAZORPAY_WEBHOOK_SECRET: settings.webhookSecret,
        PAYMENT_BASE_PAISE: "59900",
        PAYMENT_TAX_PAISE: "0",
      }),
    /merchant/,
  );
});
