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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/refunds_test`,
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
    return { ...user, reviewer: mfa };
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
  orders = new Map<string, any>();
  payments = new Map<string, any>();
  loseCreate = false;
  unavailable = false;
  onCreate?: (order: any) => Promise<void>;
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

test("cancellation ends unconnected requests and refunds the full price once through an ambiguous provider retry", async () => {
  const s = await funded();
  const enquiry = {
    request_key: randomUUID(),
    listing_id: s.listing.id,
    listing_revision: s.listing.revision,
    learner_id: s.owner.profile.id,
    subject_id: "subject-physics",
    teaching_mode: "ONLINE",
    learning_requirements: "Explain Physics mechanics using worked examples",
    preferred_times: "Tuesday evening, IST",
  };
  const pending = (
    await post("/v1/me/contact-requests", enquiry, s.owner.cookie).expect(200)
  ).body.request;
  await cancellations(s.cycle.id).expect(401);
  await cancellations(s.cycle.id, s.teacher.cookie).expect(404);
  const canceled = (await cancellations(s.cycle.id, s.owner.cookie).expect(200))
    .body;
  assert.equal(canceled.cancelled, true);
  assert.equal(
    (await get("/v1/me/contact-requests/" + pending.id, s.owner.cookie)).body
      .request.status,
    "CANCELLED",
  );
  assert.equal(
    (await get("/v1/me/request-access", s.owner.cookie)).body.can_request,
    false,
  );
  const { RefundsService } = await import("../src/refunds.js");
  const worker = app.get(RefundsService);
  await worker.tick();
  let state = (await refunds(s.cycle.id, s.owner.cookie).expect(200)).body;
  assert.equal(state.refunds[0].status, "WAITING_RESERVE");
  assert.equal(state.refunds[0].amount_paise, 59900);
  assert.equal(gateway.refundCalls.length, 0);
  await reserve();
  clock = new Date(clock.getTime() + 60000);
  gateway.loseRefund = true;
  await worker.tick();
  state = (await refunds(s.cycle.id, s.owner.cookie)).body;
  assert.equal(state.refunds[0].status, "UNKNOWN");
  const key = gateway.refundCalls[0].key;
  gateway.loseRefund = false;
  clock = new Date(clock.getTime() + 60000);
  await worker.tick();
  state = (await refunds(s.cycle.id, s.owner.cookie)).body;
  assert.equal(state.refunds[0].status, "PROCESSED");
  assert.equal(gateway.refunds.size, 1);
  assert.equal(gateway.refundCalls.at(-1)!.key, key);
  await cancellations(s.cycle.id, s.owner.cookie).expect(200);
  await worker.tick();
  assert.equal(
    (await refunds(s.cycle.id, s.owner.cookie)).body.refunds.length,
    1,
  );
  assert.equal(
    (await get("/v1/me/purchases/" + s.cycle.id, s.owner.cookie)).body.purchase
      .checkout,
    null,
  );
  await post(
    "/v1/me/tutor-requests/" + pending.id + "/decisions",
    { decision: "ACCEPT" },
    s.teacher.cookie,
  ).expect(409);
  assert.equal(
    (await get("/v1/me/connections", s.owner.cookie)).body.connections.length,
    0,
  );
  const fresh = (
    await checkout(purchase(s.owner, s.listing), s.owner.cookie).expect(200)
  ).body.purchase;
  assert.notEqual(fresh.id, s.cycle.id);
});

test("no-match equality and late capture create a full refund without extending the matching window", async () => {
  const s = await funded();
  const { RefundsService } = await import("../src/refunds.js");
  const worker = app.get(RefundsService);
  const paid = (await get("/v1/me/purchases/" + s.cycle.id, s.owner.cookie))
    .body.purchase;
  clock = new Date(new Date(paid.matching_deadline).getTime() - 1);
  await worker.tick();
  assert.equal(
    (await refunds(s.cycle.id, s.owner.cookie)).body.cancelled,
    false,
  );
  clock = new Date(paid.matching_deadline);
  await worker.tick();
  const state = (await refunds(s.cycle.id, s.owner.cookie)).body;
  assert.equal(state.cancelled, true);
  assert.equal(state.cancellation.reason, "NO_MATCH");
  assert.equal(state.refunds[0].amount_paise, 59900);
  assert.equal(
    (await get("/v1/me/purchases/" + s.cycle.id, s.owner.cookie)).body.purchase
      .matching_deadline,
    paid.matching_deadline,
  );
  const late = await scenario();
  const cycle = (
    await checkout(purchase(late.owner, late.listing), late.owner.cookie)
  ).body.purchase;
  await cancellations(cycle.id, late.owner.cookie).expect(200);
  const payment = captured(gateway.orders.get(cycle.checkout.order_id));
  const captureTime = clock.getTime();
  clock = new Date(clock.getTime() + 74 * 3600000);
  await webhook(
    event(payment, "payment.captured", Math.floor(captureTime / 1000)),
  ).expect(202);
  await new PaymentEvents(database, config, gateway, now).tick();
  await worker.tick();
  const lateState = (await refunds(cycle.id, late.owner.cookie)).body;
  assert.equal(lateState.cancelled, true);
  assert.equal(lateState.refunds[0].amount_paise, 59900);
  assert.equal(
    (await get("/v1/me/request-access", late.owner.cookie)).body.can_request,
    false,
  );
});

test("cancellation and first acceptance serialize, and a completed full refund permits a fresh explicit purchase", async () => {
  const s = await funded();
  await reserve(599000);
  const body = {
    request_key: randomUUID(),
    listing_id: s.listing.id,
    listing_revision: s.listing.revision,
    learner_id: s.owner.profile.id,
    subject_id: "subject-physics",
    teaching_mode: "ONLINE",
    learning_requirements: "Practice school Physics with worked examples",
    preferred_times: "Tuesday evening, IST",
  };
  const row = (await post("/v1/me/contact-requests", body, s.owner.cookie)).body
    .request;
  const results = await Promise.all([
    cancellations(s.cycle.id, s.owner.cookie),
    post(
      "/v1/me/tutor-requests/" + row.id + "/decisions",
      { decision: "ACCEPT" },
      s.teacher.cookie,
    ),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const state = (await refunds(s.cycle.id, s.owner.cookie)).body;
  const connections = (await get("/v1/me/connections", s.owner.cookie)).body
    .connections;
  assert.equal(connections.length, state.cancelled ? 0 : 1);
  if (!state.cancelled) {
    await cancellations(s.cycle.id, s.owner.cookie).expect(409);
    return;
  }
  const { RefundsService } = await import("../src/refunds.js");
  const worker = app.get(RefundsService);
  for (let i = 0; i < 5; i++) {
    clock = new Date(clock.getTime() + 60000);
    await worker.tick();
  }
  const fresh = (
    await checkout(purchase(s.owner, s.listing), s.owner.cookie).expect(200)
  ).body.purchase;
  assert.notEqual(fresh.id, s.cycle.id);
});


test('Finance MFA limits reserve/retry commands, funding references deduplicate and failed refunds remain reserved for review',async()=>{
 const s=await funded();const support=await fixture(['SUPPORT']);const supportMfa=await enroll(support.cookie);
 const input={reference:randomUUID(),amount_paise:59900,reason:'Verified fictional reserve deposit reference'};
 await post('/v1/staff/refund-reserve/funding',input,s.owner.cookie).expect(403);
 await post('/v1/staff/refund-reserve/funding',input,supportMfa.cookie).expect(403);
 const finance=await fixture(['FINANCE']);await post('/v1/staff/refund-reserve/funding',input,finance.cookie).expect(403);
 const mfa=await enroll(finance.cookie);await post('/v1/staff/refund-reserve/funding',input,mfa.cookie).expect(200);
 await post('/v1/staff/refund-reserve/funding',input,mfa.cookie).expect(200).expect(r=>assert.equal(r.body.replayed,true));
 await post('/v1/staff/refund-reserve/funding',{...input,amount_paise:100},mfa.cookie).expect(409);
 await cancellations(s.cycle.id,s.owner.cookie);gateway.refundStatus='failed';
 const {RefundsService}=await import('../src/refunds.js');const worker=app.get(RefundsService);
 await worker.tick();let state=(await refunds(s.cycle.id,s.owner.cookie)).body;assert.equal(state.refunds[0].status,'FAILED');
 const id=state.refunds[0].id;const count=gateway.refundCalls.length;clock=new Date(clock.getTime()+60000);await worker.tick();assert.equal(gateway.refundCalls.length,count);
 await post('/v1/staff/refunds/'+id+'/retries',{reason:'Reconcile same failed provider refund reference'},supportMfa.cookie).expect(403);
 await post('/v1/staff/refunds/'+id+'/retries',{reason:'Reconcile same failed provider refund reference'},mfa.cookie).expect(200);
 const provider=[...gateway.refunds.values()].find(row=>row.receipt===id)!;provider.status='processed';await worker.tick();
 state=(await refunds(s.cycle.id,s.owner.cookie)).body;assert.equal(state.refunds[0].status,'PROCESSED');assert.equal(gateway.refundCalls.length,count);
 await refunds(s.cycle.id,s.teacher.cookie).expect(404);
});
