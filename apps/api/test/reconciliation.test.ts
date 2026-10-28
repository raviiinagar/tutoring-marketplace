import {grantTutorProFixture} from '../../../scripts/tutor-pro-fixture.js';
import { PaymentEvents } from "../src/payment-events.js";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { Database, migrate } from "../src/database.js";
import { decrypt } from "../src/security.js";
import { assignStaff, type StaffScope } from "../src/staff.js";
import { totp } from "../src/totp.js";
import { grantContactFixture } from "../../../scripts/contact-request-fixture.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let app: INestApplication;
let database: Database;
let config: Config;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let clock = new Date();
const now = () => clock;
const origin = "http://localhost:3000";
const password = "Staff-password-321!";
const post = (path: string, body: unknown, cookie?: string) => {
  const call = request(app.getHttpServer())
    .post(path)
    .set("Origin", origin)
    .send(body);
  return cookie ? call.set("Cookie", cookie) : call;
};
const get = (path: string, cookie?: string) => {
  const call = request(app.getHttpServer()).get(path);
  return cookie ? call.set("Cookie", cookie) : call;
};
const combine = (base: string, staff: string) =>
  base.split(";")[0] + "; " + staff.split(";")[0];
before(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const directory = resolve(".local/tests", randomUUID());
  config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/reconciliation_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
    GUARDIAN_VERIFICATION_MODE: "test",
    PAYMENT_MODE: "razorpay_test",
    RAZORPAY_KEY_ID: "rzp_test_fixture",
    RAZORPAY_KEY_SECRET: "fictional-provider-key-secret-321",
    RAZORPAY_WEBHOOK_SECRET: "fictional-webhook-key-secret-321",
  });
  cluster = await startDatabase(
    config.databaseUrl,
    join(directory, "postgres"),
  );
  database = new Database(config.databaseUrl);
  await migrate(database);
  app = await createApplication(
    config,
    database,
    now,
    undefined,
    undefined,
    gateway,
  );
});
beforeEach(() => {
  clock = new Date(clock.getTime() + 8 * 86400000);
  gateway.loseCreate = false;
  gateway.unavailable = false;
  gateway.onCreate = undefined;
  gateway.loseRefund = false;
  gateway.refundStatus = "processed";
  gateway.refundCalls = [];
});
after(async () => {
  await app?.close();
  await database?.close();
  await cluster?.stop();
});
async function fixture(scopes: StaffScope[] | null = ["SUPPORT"]) {
  const email = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", {
    display_name: "Test operator",
    email,
    password,
  }).expect(202);
  const row = (
    await database.pool.query(
      "SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)",
      [email],
    )
  ).rows[0];
  await post("/v1/auth/verifications", {
    token: new URL(
      decrypt<{ verification_url: string }>(
        row.encrypted_payload,
        config.authSecret,
      ).verification_url,
    ).hash.slice(7),
  }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(
    200,
  );
  if (scopes)
    await assignStaff(
      database,
      email,
      scopes,
      "Fixture staff bootstrap",
      "test operator",
    );
  return {
    email,
    id: login.body.user.id,
    cookie: login.headers["set-cookie"][0] as string,
  };
}
async function enroll(cookie: string) {
  const setup = await post(
    "/v1/staff/mfa/enrollments",
    { password },
    cookie,
  ).expect(200);
  const secret = setup.body.secret;
  const confirmed = await post(
    "/v1/staff/mfa/confirmations",
    { code: totp(secret, clock) },
    cookie,
  ).expect(200);
  return {
    secret,
    codes: confirmed.body.recovery_codes as string[],
    staffCookie: confirmed.headers["set-cookie"][0] as string,
    cookie: combine(cookie, confirmed.headers["set-cookie"][0]),
  };
}
const profile = {
  display_name: "Fictional Tutor",
  biography: "I explain school physics and mathematics using worked examples.",
  birth_date: "1990-01-01",
  adult_confirmed: true,
};
const offer = {
  title: "Physics with worked examples",
  description:
    "School physics explained patiently with examples and structured practice.",
  domain_id: "school",
  subject_id: "subject-physics",
  level_id: "level-class-10",
  curriculum_id: "curriculum-cbse",
  language_ids: ["language-english"],
  currency: "INR",
  teaching_mode: "ONLINE",
  rate_paise: 50000,
  rate_unit: "HOUR",
  trial_kind: "NONE",
};
async function tutor(approved = true, subjects = ["subject-physics"]) {
  const user = await fixture(null);
  await post("/v1/me/roles", { roles: ["TUTOR"] }, user.cookie).expect(200);
  await post("/v1/me/tutor", profile, user.cookie).expect(200);
  if (approved) {
    const reviewer = await fixture(["TRUST"]);
    const mfa = await enroll(reviewer.cookie);
    for (const [kind, subjectId] of [
      ["IDENTITY", ""],
      ...subjects.map((subject) => ["QUALIFICATION", subject]),
    ]) {
      const file = (
        await post(
          "/v1/me/tutor/evidence",
          {
            media_type: "application/pdf",
            data: Buffer.from(
              "%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n",
            ).toString("base64"),
          },
          user.cookie,
        ).expect(201)
      ).body.evidence.id;
      await post(
        "/v1/me/tutor/claims",
        {
          kind,
          description: "Fictional evidence for " + kind,
          evidence_id: file,
          ...(kind === "IDENTITY" ? {} : { subject_id: subjectId }),
        },
        user.cookie,
      ).expect(201);
    }
    await post("/v1/me/tutor/submissions", {}, user.cookie).expect(200);
    const claims = (await get("/v1/me/tutor", user.cookie)).body.claims;
    for (const claim of claims)
      await post(
        "/v1/staff/tutor-claims/" + claim.id + "/reviews",
        {
          outcome: "APPROVE",
          checked_item: "Fictional document and claim checked",
          reason: "Approve fictional Tutor evidence",
          adult_identity_confirmed: true,
          expires_at: new Date(clock.getTime() + 365 * 86400000).toISOString(),
        },
        mfa.cookie,
      ).expect(200);
    await grantTutorProFixture(database,config,user.email,clock);return { ...user, reviewer: mfa };
  }
  return { ...user, reviewer: undefined };
}
async function draft(user: { cookie: string }) {
  return (await post("/v1/me/listings", offer, user.cookie).expect(201)).body
    .listing;
}
async function submitted(user: { cookie: string }) {
  const row = await draft(user);
  return (
    await post(
      "/v1/me/listings/" + row.id + "/actions/SUBMIT",
      { revision: row.revision },
      user.cookie,
    ).expect(200)
  ).body.listing;
}
async function publish(user: Awaited<ReturnType<typeof tutor>>) {
  const row = await submitted(user);
  return (
    await post(
      "/v1/staff/listings/" + row.id + "/reviews",
      {
        revision: row.revision,
        outcome: "APPROVE",
        reason: "Exact school Physics offer checked",
      },
      user.reviewer!.cookie,
    ).expect(200)
  ).body.listing;
}
async function publishOffer(
  user: Awaited<ReturnType<typeof tutor>>,
  payload: unknown,
) {
  let row = (await post("/v1/me/listings", payload, user.cookie).expect(201))
    .body.listing;
  row = (
    await post(
      "/v1/me/listings/" + row.id + "/actions/SUBMIT",
      { revision: row.revision },
      user.cookie,
    ).expect(200)
  ).body.listing;
  return (
    await post(
      "/v1/staff/listings/" + row.id + "/reviews",
      {
        revision: row.revision,
        outcome: "APPROVE",
        reason: "Exact public discovery fixture checked",
      },
      user.reviewer!.cookie,
    ).expect(200)
  ).body.listing;
}

async function learner() {
  const user = await fixture(null);
  const row = (
    await post(
      "/v1/me/learners/adult",
      {
        alias: "Fictional learner",
        learning_requirements: "Practice Physics concepts with worked examples",
        adult_confirmed: true,
      },
      user.cookie,
    ).expect(201)
  ).body.profile;
  return { ...user, profile: row };
}
async function scenario() {
  const owner = await learner();
  const teacher = await tutor();
  const listing = await publish(teacher);
  return { owner, teacher, listing };
}

class ProviderFixture {
  reconRows: any[] = [];
  settlements = new Map<string, any>();
  async fetchRecon(input: { skip: number; count: number }) {
    return this.reconRows.slice(input.skip, input.skip + input.count);
  }
  async fetchSettlement(id: string) {
    return this.settlements.get(id);
  }
  async fetchOrderPayments(id: string) {
    return [...this.payments.values()].filter((row) => row.order_id === id);
  }

  orders = new Map<string, any>();
  payments = new Map<string, any>();
  loseCreate = false;
  unavailable = false;
  onCreate?: (order: any) => Promise<void>;
  disputes = new Map<string, any>();
  async fetchDispute(id: string) {
    return this.disputes.get(id);
  }
  refunds = new Map<string, any>();
  refundCalls: { key: string; body: unknown }[] = [];
  loseRefund = false;
  refundStatus: "pending" | "processed" | "failed" = "processed";
  async createRefund(paymentId: string, key: string, body: any) {
    this.refundCalls.push({ key, body });
    let row = this.refunds.get(key);
    if (!row) {
      row = {
        id: "rfnd_" + randomBytes(8).toString("hex"),
        entity: "refund",
        payment_id: paymentId,
        amount: body.amount,
        currency: "INR",
        status: this.refundStatus,
        receipt: body.receipt,
        created_at: Math.floor(clock.getTime() / 1000),
      };
      this.refunds.set(key, row);
    }
    if (this.loseRefund)
      throw new Error("Lost refund response after provider committed");
    return row;
  }
  async fetchRefund(id: string) {
    return [...this.refunds.values()].find((row) => row.id === id);
  }

  async createOrder(cycle: string, amount: number, currency: string) {
    const row = {
      id: "order_" + randomBytes(8).toString("hex"),
      entity: "order",
      amount,
      currency,
      receipt: cycle,
      notes: { cycle_id: cycle },
      status: "created",
    };
    this.orders.set(row.id, row);
    await this.onCreate?.(row);
    if (this.loseCreate)
      throw new Error("Lost response after provider success");
    return row;
  }
  async fetchOrder(id: string) {
    if (this.unavailable) throw new Error("Provider unavailable");
    return this.orders.get(id);
  }
  async fetchPayment(id: string) {
    if (this.unavailable) throw new Error("Provider unavailable");
    return this.payments.get(id);
  }
}
const gateway = new ProviderFixture();
const purchase = (owner: any, listing: any) => ({
  request_key: randomUUID(),
  listing_id: listing.id,
  listing_revision: listing.revision,
  learner_id: owner.profile.id,
  policy_version: "access-v1",
});
const checkout = (body: unknown, cookie?: string) =>
  post("/v1/me/purchases", body, cookie);

const sign = (value: string, secret = config.payments!.webhookSecret) =>
  createHmac("sha256", secret).update(value).digest("hex");
function captured(order: any, amount = 59900) {
  const payment = {
    id: "pay_" + randomBytes(8).toString("hex"),
    entity: "payment",
    order_id: order.id,
    amount,
    currency: "INR",
    status: "captured",
    captured: true,
    created_at: Math.floor(clock.getTime() / 1000) - 10,
  };
  gateway.payments.set(payment.id, payment);
  order.status = "paid";
  return payment;
}
const event = (
  payment: any,
  type = "payment.captured",
  time = Math.floor(clock.getTime() / 1000),
) => ({
  entity: "event",
  event: type,
  created_at: time,
  payload: { payment: { entity: payment } },
});
const webhook = (
  body: unknown,
  id = "evt_" + randomBytes(8).toString("hex"),
  signature?: string,
) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return request(app.getHttpServer())
    .post("/v1/payments/razorpay/webhooks")
    .set("Content-Type", "application/json")
    .set("x-razorpay-event-id", id)
    .set("x-razorpay-signature", signature ?? sign(raw))
    .send(raw);
};

async function funded() {
  const s = await scenario();
  const cycle = (
    await checkout(purchase(s.owner, s.listing), s.owner.cookie).expect(200)
  ).body.purchase;
  const payment = captured(gateway.orders.get(cycle.checkout.order_id));
  await webhook(event(payment)).expect(202);
  const events = new PaymentEvents(database, config, gateway, now);
  await events.tick();
  return { ...s, cycle, payment };
}
const cancellations = (id: string, cookie?: string) =>
  post("/v1/me/purchases/" + id + "/cancellations", {}, cookie);
const refunds = (id: string, cookie?: string) =>
  get("/v1/me/purchases/" + id + "/refunds", cookie);
async function reserve(amount = 59900) {
  const staff = await fixture(["FINANCE"]);
  const mfa = await enroll(staff.cookie);
  await post(
    "/v1/staff/refund-reserve/funding",
    {
      reference: randomUUID(),
      amount_paise: amount,
      reason: "Verified fictional funded reserve for refund test",
    },
    mfa.cookie,
  ).expect(200);
  return { staff, mfa };
}

test("payment history and immutable receipt snapshots belong only to the payer and exclude direct tuition", async () => {
  const s = await funded();
  await get("/v1/me/payment-history").expect(401);
  const history = (
    await get("/v1/me/payment-history", s.owner.cookie).expect(200)
  ).body;
  assert.equal(history.purchases.length, 1);
  assert.equal(history.purchases[0].amount_paise, 59900);
  const first = (
    await get(
      "/v1/me/purchases/" + s.cycle.id + "/receipt",
      s.owner.cookie,
    ).expect(200)
  ).body.document;
  assert.equal(first.amount_paise, 59900);
  assert.equal(first.base_paise + first.tax_paise, 59900);
  assert.equal(first.kind, "TEST_PAYMENT_CONFIRMATION");
  const merchant = first.merchant;
  const original = config.payments!.disclosures.merchant;
  config.payments!.disclosures.merchant = "Changed merchant configuration";
  try {
    const again = (
      await get("/v1/me/purchases/" + s.cycle.id + "/receipt", s.owner.cookie)
    ).body.document;
    assert.equal(again.id, first.id);
    assert.equal(again.merchant, merchant);
  } finally {
    config.payments!.disclosures.merchant = original;
  }
  await get(
    "/v1/me/purchases/" + s.cycle.id + "/receipt",
    s.teacher.cookie,
  ).expect(404);
  assert.equal(
    (await get("/v1/me/payment-history", s.teacher.cookie)).body.purchases
      .length,
    0,
  );
  assert.ok(!JSON.stringify(first).includes("50000"));
});

test("settlement and bank imports deduplicate, preserve fee-inclusive tax and balance without treating processed settlement as bank credit", async () => {
  const finance = await fixture(["FINANCE"]);
  const mfa = await enroll(finance.cookie);
  const { SettlementReconciliation } =
    await import("../src/settlement-reconciliation.js");
  const worker = app.get(SettlementReconciliation);
  for (let i = 0; i < 10; i++) await worker.tick();
  const baseline = (
    await get(
      "/v1/staff/finance/reconciliation?reason=Inspect%20previous%20financial%20baseline",
      mfa.cookie,
    )
  ).body.totals;
  const s = await funded();
  const settlementId = "setl_" + randomBytes(8).toString("hex");
  const utr = "UTR" + randomBytes(8).toString("hex");
  gateway.reconRows = [
    {
      entity_id: s.payment.id,
      type: "payment",
      amount: 59900,
      debit: 0,
      credit: 58720,
      currency: "INR",
      fee: 1180,
      tax: 180,
      settled: true,
      on_hold: false,
      settlement_id: settlementId,
      settlement_utr: utr,
    },
  ];
  gateway.settlements.set(settlementId, {
    id: settlementId,
    amount: 58720,
    status: "processed",
    fees: 0,
    tax: 0,
    utr,
    created_at: Math.floor(clock.getTime() / 1000),
  });
  const input = {
    request_key: randomUUID(),
    year: 2026,
    month: 10,
    reason: "Reconcile fictional provider allocation and bank receipt",
  };
  await post(
    "/v1/staff/finance/reconciliation-runs",
    input,
    s.owner.cookie,
  ).expect(403);
  const created = (
    await post(
      "/v1/staff/finance/reconciliation-runs",
      input,
      mfa.cookie,
    ).expect(200)
  ).body.run;
  assert.equal(
    (await post("/v1/staff/finance/reconciliation-runs", input, mfa.cookie))
      .body.run.id,
    created.id,
  );
  for (let i = 0; i < 5; i++) await worker.tick();
  let view = (
    await get(
      "/v1/staff/finance/reconciliation?reason=Inspect%20fictional%20settlement%20totals",
      mfa.cookie,
    ).expect(200)
  ).body;
  assert.equal(view.totals.gateway_fee_paise, 1180);
  assert.equal(view.totals.gateway_tax_paise, 180);
  assert.equal(view.totals.bank_received_paise, 0);
  const receipt = {
    reference: randomUUID(),
    utr,
    amount_paise: 58720,
    currency: "INR",
    received_at: clock.toISOString(),
  };
  const bankInput = {
    rows: [receipt],
    reason: "Verified fictional bank statement receipt and UTR",
  };
  await post("/v1/staff/finance/bank-receipts", bankInput, mfa.cookie).expect(
    200,
  );
  await post("/v1/staff/finance/bank-receipts", bankInput, mfa.cookie).expect(
    200,
  );
  await post(
    "/v1/staff/finance/reconciliation-runs",
    { ...input, request_key: randomUUID() },
    mfa.cookie,
  );
  for (let i = 0; i < 5; i++) await worker.tick();
  view = (
    await get(
      "/v1/staff/finance/reconciliation?reason=Inspect%20fictional%20settlement%20totals",
      mfa.cookie,
    )
  ).body;
  assert.equal(view.totals.gateway_fee_paise, 1180);
  assert.equal(view.totals.bank_received_paise, 58720);
  assert.equal(
    view.totals.total_debits_paise - baseline.total_debits_paise,
    119800,
  );
  assert.equal(
    view.totals.total_credits_paise - baseline.total_credits_paise,
    119800,
  );
  const conflict = (
    await post(
      "/v1/staff/finance/bank-receipts",
      { ...bankInput, rows: [{ ...receipt, amount_paise: 58719 }] },
      mfa.cookie,
    )
  ).body;
  assert.equal(conflict.conflicts, 1);
  const isolated = await get(
    "/v1/staff/finance/reconciliation?reason=Inspect%20restricted%20financial%20data",
    s.owner.cookie,
  ).expect(403);
  assert.ok(!JSON.stringify(view).includes(s.owner.email));
  assert.equal(isolated.status, 403);
});

test("a missing capture callback is fetched without a new charge and requires audited capture-time evidence before access", async () => {
  const s = await scenario();
  gateway.loseCreate = true;
  const cycle = (await checkout(purchase(s.owner, s.listing), s.owner.cookie))
    .body.purchase;
  gateway.loseCreate = false;
  const order = [...gateway.orders.values()].find(
    (row) => row.receipt === cycle.id,
  )!;
  const payment = captured(order);
  const ordersBefore = gateway.orders.size;
  const settlementId = "setl_" + randomBytes(8).toString("hex");
  gateway.reconRows = [
    {
      entity_id: payment.id,
      type: "payment",
      amount: 59900,
      debit: 0,
      credit: 58720,
      currency: "INR",
      fee: 1180,
      tax: 180,
      settled: true,
      settlement_id: settlementId,
      order_id: order.id,
    },
  ];
  gateway.settlements.set(settlementId, {
    id: settlementId,
    amount: 58720,
    status: "processed",
    fees: 0,
    tax: 0,
    utr: "UTR" + randomBytes(8).toString("hex"),
    created_at: Math.floor(clock.getTime() / 1000),
  });
  const finance = await fixture(["FINANCE"]);
  const mfa = await enroll(finance.cookie);
  await post(
    "/v1/staff/finance/reconciliation-runs",
    {
      request_key: randomUUID(),
      year: 2026,
      month: 10,
      reason: "Recover a verified captured payment with missing callbacks",
    },
    mfa.cookie,
  ).expect(200);
  const { SettlementReconciliation } =
    await import("../src/settlement-reconciliation.js");
  const worker = app.get(SettlementReconciliation);
  for (let i = 0; i < 8; i++) await worker.tick();
  const queue = (
    await get(
      "/v1/staff/refund-cases?reason=Inspect%20missing%20capture%20evidence",
      mfa.cookie,
    )
  ).body;
  assert.ok(
    queue.exceptions.some(
      (row: any) =>
        row.kind === "CAPTURE_TIMESTAMP_REQUIRED" && row.cycle_id === cycle.id,
    ),
  );
  assert.equal(
    (await get("/v1/me/request-access", s.owner.cookie)).body.can_request,
    false,
  );
  assert.equal(gateway.orders.size, ordersBefore);
  const input = {
    provider_payment_id: payment.id,
    captured_at: clock.toISOString(),
    reason: "Confirmed capture instant using provider transaction evidence",
  };
  await post(
    "/v1/staff/finance/purchases/" + cycle.id + "/capture-confirmations",
    input,
    s.owner.cookie,
  ).expect(403);
  await post(
    "/v1/staff/finance/purchases/" + cycle.id + "/capture-confirmations",
    input,
    mfa.cookie,
  ).expect(200);
  await post(
    "/v1/staff/finance/purchases/" + cycle.id + "/capture-confirmations",
    input,
    mfa.cookie,
  ).expect(200);
  assert.equal(
    (await get("/v1/me/request-access", s.owner.cookie)).body.can_request,
    true,
  );
  assert.equal(gateway.orders.size, ordersBefore);
  assert.equal(
    (
      await get("/v1/me/purchases/" + cycle.id, s.owner.cookie)
    ).body.purchase.journal.filter((row: any) => row.kind === "CAPTURE").length,
    1,
  );
});

test("a signed settlement callback is refetched once and remains pending bank evidence", async () => {
  const finance = await fixture(["FINANCE"]);
  const mfa = await enroll(finance.cookie);
  const settlement = {
    id: "setl_" + randomBytes(8).toString("hex"),
    amount: 58720,
    status: "processed",
    fees: 0,
    tax: 0,
    utr: "UTR" + randomBytes(8).toString("hex"),
    created_at: Math.floor(clock.getTime() / 1000),
  };
  gateway.settlements.set(settlement.id, settlement);
  const body = {
    event: "settlement.processed",
    created_at: Math.floor(clock.getTime() / 1000),
    payload: { settlement: { entity: settlement } },
  };
  await webhook(body).expect(202);
  await webhook(body).expect(202);
  const { SettlementReconciliation } =
    await import("../src/settlement-reconciliation.js");
  const worker = app.get(SettlementReconciliation);
  for (let i = 0; i < 8; i++) await worker.tick();
  const view = (
    await get(
      "/v1/staff/finance/reconciliation?reason=Inspect%20provider%20settlement%20callback",
      mfa.cookie,
    )
  ).body;
  const matching = view.settlements.filter(
    (row: any) => row.id === settlement.id,
  );
  assert.equal(matching.length, 1);
  assert.equal(matching[0].bank_matched, false);
});

test("a missing refund callback is fetched by reconciliation without creating a replacement refund or charge", async () => {
  await reserve(599000);
  const { RefundsService: PriorRefunds } = await import("../src/refunds.js");
  for (let i = 0; i < 10; i++) await app.get(PriorRefunds).tick();
  const s = await funded();
  await reserve(599000);
  await cancellations(s.cycle.id, s.owner.cookie);
  gateway.loseRefund = true;
  const { RefundsService } = await import("../src/refunds.js");
  await app.get(RefundsService).tick();
  const state = (await refunds(s.cycle.id, s.owner.cookie)).body;
  const operation = state.refunds[0];
  assert.equal(operation.status, "UNKNOWN");
  const uncertainCalls = gateway.refundCalls.length;
  clock = new Date(clock.getTime() + 25 * 3600000);
  await app.get(RefundsService).tick();
  assert.equal(gateway.refundCalls.length, uncertainCalls);
  assert.equal(
    (await refunds(s.cycle.id, s.owner.cookie)).body.refunds[0].status,
    "REVIEW",
  );
  const actual = [...gateway.refunds.values()].find(
    (row) => row.receipt === operation.id,
  )!;
  const settlementId = "setl_" + randomBytes(8).toString("hex");
  gateway.reconRows = [
    {
      entity_id: actual.id,
      type: "refund",
      amount: 59900,
      debit: 59900,
      credit: 0,
      currency: "INR",
      fee: 0,
      tax: 0,
      settled: true,
      settlement_id: settlementId,
      payment_id: s.payment.id,
    },
  ];
  gateway.settlements.set(settlementId, {
    id: settlementId,
    amount: 0,
    status: "processed",
    fees: 0,
    tax: 0,
    utr: "UTR" + randomBytes(8).toString("hex"),
    created_at: Math.floor(clock.getTime() / 1000),
  });
  const finance = await fixture(["FINANCE"]);
  const mfa = await enroll(finance.cookie);
  await post(
    "/v1/staff/finance/reconciliation-runs",
    {
      request_key: randomUUID(),
      year: 2026,
      month: 10,
      reason: "Reconcile original refund with a missing callback",
    },
    mfa.cookie,
  ).expect(200);
  const { SettlementReconciliation } =
    await import("../src/settlement-reconciliation.js");
  const worker = app.get(SettlementReconciliation);
  const { FinancialEvents } = await import("../src/financial-events.js");
  const events = app.get(FinancialEvents);
  const orders = gateway.orders.size;
  const calls = gateway.refundCalls.length;
  for (let i = 0; i < 12; i++) {
    await worker.tick();
    await events.tick();
  }
  assert.equal(
    (await refunds(s.cycle.id, s.owner.cookie)).body.refunds[0].status,
    "PROCESSED",
  );
  assert.equal(gateway.orders.size, orders);
  assert.equal(gateway.refundCalls.length, calls);
});

test("daily read-only reconciliation schedules overlapping periods once without creating payment Orders", async () => {
  const finance = await fixture(["FINANCE"]);
  const mfa = await enroll(finance.cookie);
  const original = config.payments!.dailyReconciliation;
  config.payments!.dailyReconciliation = true;
  const { SettlementReconciliation } =
    await import("../src/settlement-reconciliation.js");
  const worker = app.get(SettlementReconciliation);
  const orders = gateway.orders.size;
  try {
    for (let i = 0; i < 5; i++) await worker.tick();
    const first = (
      await get(
        "/v1/staff/finance/reconciliation?reason=Inspect%20daily%20provider%20reconciliation",
        mfa.cookie,
      )
    ).body;
    const ids = first.runs
      .filter(
        (row: any) => row.reason === "Automatic daily provider reconciliation",
      )
      .map((row: any) => row.id);
    assert.equal(ids.length, 2);
    for (let i = 0; i < 5; i++) await worker.tick();
    const again = (
      await get(
        "/v1/staff/finance/reconciliation?reason=Inspect%20daily%20provider%20reconciliation",
        mfa.cookie,
      )
    ).body;
    assert.deepEqual(
      again.runs
        .filter(
          (row: any) =>
            row.reason === "Automatic daily provider reconciliation",
        )
        .map((row: any) => row.id),
      ids,
    );
    assert.equal(gateway.orders.size, orders);
  } finally {
    config.payments!.dailyReconciliation = original;
  }
});

test('foreign unexpected captures remain separate from INR totals and preserve their actual currency',async()=>{
 const s=await funded();const finance=await fixture(['FINANCE']);const mfa=await enroll(finance.cookie);
 const path='/v1/staff/finance/reconciliation?reason=Inspect%20currency%20separated%20financial%20totals';
 const {SettlementReconciliation}=await import('../src/settlement-reconciliation.js');const worker=app.get(SettlementReconciliation);
 for(let i=0;i<20;i++)await worker.tick();const baseline=(await get(path,mfa.cookie)).body.totals.total_debits_paise;
 const foreign={...s.payment,id:'pay_'+randomBytes(8).toString('hex'),currency:'USD',amount:9000};gateway.payments.set(foreign.id,foreign);
 await webhook(event(foreign)).expect(202);await app.get(PaymentEvents).tick();for(let i=0;i<20;i++)await worker.tick();
 const view=(await get(path,mfa.cookie).expect(200)).body;
 assert.equal(view.totals.total_debits_paise,baseline);
 const usd=view.totals_by_currency.find((row:any)=>row.currency==='USD');assert.equal(usd.total_debits_minor,9000);assert.equal(usd.total_credits_minor,9000);
 const history=(await get('/v1/me/payment-history',s.owner.cookie)).body.purchases;assert.ok(history[0].captures.some((row:any)=>row.currency==='USD'&&Number(row.amount_paise)===9000));
});
