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
    PRIVACY_RETENTION_POLICY_FILE: "config/privacy-retention.example.json",
    PRIVACY_TOMBSTONE_DIR: join(directory, "privacy-ledger"),
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/finance_test`,
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

const requestBody = (s: any) => ({
  request_key: randomUUID(),
  listing_id: s.listing.id,
  listing_revision: s.listing.revision,
  learner_id: s.owner.profile.id,
  subject_id: "subject-physics",
  teaching_mode: "ONLINE",
  learning_requirements: "Explain Physics concepts with worked examples",
  preferred_times: "Tuesday evening, IST",
});
async function connected() {
  const s = await funded();
  const pending = (
    await post("/v1/me/contact-requests", requestBody(s), s.owner.cookie)
  ).body.request;
  const result = (
    await post(
      "/v1/me/tutor-requests/" + pending.id + "/decisions",
      { decision: "ACCEPT" },
      s.teacher.cookie,
    ).expect(200)
  ).body;
  return { ...s, connection: result.connection_id };
}
const refundCase = (s: any) =>
  post(
    "/v1/me/purchases/" + s.cycle.id + "/refund-cases",
    {
      request_key: randomUUID(),
      reason:
        "Please review the platform connection fee after this fictional connection",
    },
    s.owner.cookie,
  );
test("Finance MFA sees deduplicated searches and separate request, Connection and mature paid-cohort facts", async () => {
  const s = await connected(),
    staff = await fixture(["FINANCE"]),
    mfa = await enroll(staff.cookie),
    start = clock.toISOString().slice(0, 10);
  const query = () =>
    "/v1/staff/marketplace-metrics?" +
    new URLSearchParams({
      reason: "Inspect aggregate delivered marketplace value",
      from: start,
      to: new Date(clock.getTime() + 86400000).toISOString().slice(0, 10),
    });
  const key = randomUUID(),
    search = {
      request_key: key,
      filters: { domain_id: "school", subject_id: "subject-physics" },
    };
  await post("/v1/discovery/searches", search).expect(200);
  await post("/v1/discovery/searches", search).expect(200);
  await post("/v1/discovery/searches", {
    ...search,
    filters: { domain_id: "entrance" },
  }).expect(409);
  await get("/v1/discovery?domain_id=school").expect(200);
  await post("/v1/discovery/searches", {
    request_key: randomUUID(),
    filters: { domain_id: "school", cursor: randomUUID() },
  }).expect(200);
  await post("/v1/discovery/searches", {
    request_key: randomUUID(),
    filters: { domain_id: "entrance", subject_id: "subject-physics" },
  }).expect(200);
  await get(query()).expect(401);
  await get(query(), staff.cookie).expect(403);
  const data = (await get(query(), mfa.cookie).expect(200)).body;
  const school = data.domains.find((r: any) => r.id === "school"),
    entrance = data.domains.find((r: any) => r.id === "entrance");
  assert.equal(school.searches, 1);
  assert.equal(school.matched_searches, 1);
  assert.equal(entrance.empty_searches, 1);
  assert.equal(school.requests, 1);
  assert.equal(school.acceptances, 1);
  assert.equal(school.connections, 1);
  assert.equal(school.captured_purchases, 1);
  assert.equal(school.captured_paise, 59900);
  assert.equal(school.mature_requests, 0);
  assert.equal(school.mature_response_rate, null);
  assert.equal(school.mature_paid_purchases, 0);
  assert.equal(school.mature_paid_match_rate, null);
  assert.equal(data.estimated_teaching_outcomes, null);
  assert.ok(!JSON.stringify(data).includes(s.owner.email));
  assert.ok(!JSON.stringify(data).includes("Fictional learner"));
  clock = new Date(clock.getTime() + 4 * 86400000);
  const elevated = await post(
      "/v1/staff/sessions",
      { password, code: totp(mfa.secret, clock) },
      staff.cookie,
    ).expect(200),
    cookie = combine(staff.cookie, elevated.headers["set-cookie"][0]);
  const matured = (await get(query(), cookie).expect(200)).body.domains.find(
    (r: any) => r.id === "school",
  );
  assert.equal(matured.mature_requests, 1);
  assert.equal(matured.mature_response_rate, 1);
  assert.equal(matured.mature_connection_rate, 1);
  assert.equal(matured.mature_paid_match_rate, 1);
  await webhook(event(s.payment)).expect(202);
  await new PaymentEvents(database, config, gateway, now).tick();
  assert.equal(
    (await get(query(), cookie).expect(200)).body.domains.find(
      (r: any) => r.id === "school",
    ).captured_paise,
    59900,
  );
  const proof = (
    await post(
      "/v1/me/privacy/verifications",
      { password, purpose: "DELETE" },
      s.owner.cookie,
    ).expect(200)
  ).body.proof;
  await post(
    "/v1/me/privacy/requests",
    {
      request_key: randomUUID(),
      kind: "DELETE",
      verification: proof,
      confirmation: "DELETE MY ACCOUNT",
    },
    s.owner.cookie,
  ).expect(202);
  const { PrivacyWorker } = await import("../src/privacy-worker.js");
  await new PrivacyWorker(database, config, now).tick();
  const erased = (await get(query(), cookie).expect(200)).body.domains.find(
    (r: any) => r.id === "school",
  );
  assert.equal(erased.requests, 0);
  assert.equal(erased.connections, 0);
  assert.equal(erased.captured_paise, 59900);
  assert.equal(erased.searches, 1);
});

test("refund facts stay in the original checkout domain after Listing edits and mature no-match rates have explicit denominators", async () => {
  const s = await funded(),
    { mfa, staff } = await reserve(),
    start = clock.toISOString().slice(0, 10);
  await post(
    "/v1/me/listings/" + s.listing.id,
    {
      revision: s.listing.revision,
      offer: {
        ...offer,
        domain_id: "entrance",
        level_id: "level-class-12",
        curriculum_id: undefined,
        exam_id: "exam-jee-main",
      },
    },
    s.teacher.cookie,
  ).expect(200);
  await cancellations(s.cycle.id, s.owner.cookie).expect(200);
  const { RefundsService } = await import("../src/refunds.js");
  await app.get(RefundsService).tick();
  clock = new Date(clock.getTime() + 4 * 86400000);
  const login = await post("/v1/auth/sessions", {
      email: staff.email,
      password,
    }).expect(200),
    account = login.headers["set-cookie"][0];
  const elevate = await post(
      "/v1/staff/sessions",
      { password, code: totp(mfa.secret, clock) },
      account,
    ).expect(200),
    cookie = combine(account, elevate.headers["set-cookie"][0]);
  const result = (
    await get(
      "/v1/staff/marketplace-metrics?" +
        new URLSearchParams({
          reason: "Verify original domain refund cohort accounting",
          from: start,
          to: new Date(clock.getTime() + 86400000).toISOString().slice(0, 10),
        }),
      cookie,
    ).expect(200)
  ).body;
  const school = result.domains.find((r: any) => r.id === "school"),
    entrance = result.domains.find((r: any) => r.id === "entrance");
  assert.equal(school.captured_purchases, 1);
  assert.equal(school.refund_intents, 1);
  assert.equal(school.confirmed_refunds, 1);
  assert.equal(school.refunded_paise, 59900);
  assert.equal(school.mature_paid_purchases, 1);
  assert.equal(school.mature_paid_match_rate, 0);
  assert.equal(school.mature_paid_refund_rate, 1);
  assert.equal(entrance.captured_purchases, 0);
});
