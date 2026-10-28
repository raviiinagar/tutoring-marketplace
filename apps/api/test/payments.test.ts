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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/payments_test`,
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

test("server prices one stable hosted checkout and concurrent retries reuse its Order", async () => {
  const { owner, listing } = await scenario();
  const body = purchase(owner, listing);
  const replies = await Promise.all([
    checkout(body, owner.cookie).expect(200),
    checkout({ ...body, request_key: randomUUID() }, owner.cookie).expect(200),
  ]);
  const first = replies[0].body.purchase;
  assert.equal(first.amount_paise, 59900);
  assert.equal(first.currency, "INR");
  assert.equal(first.policy_version, "access-v1");
  assert.equal(replies[1].body.purchase.id, first.id);
  const ready = await get("/v1/me/purchases/" + first.id, owner.cookie).expect(
    200,
  );
  assert.equal(ready.body.purchase.status, "ORDER_READY");
  assert.equal(
    ready.body.purchase.checkout.order_id,
    gateway.orders.values().next().value.id,
  );
  assert.equal(ready.body.purchase.disclosures.test_only, true);
  assert.equal(ready.body.purchase.access_active, false);
  await checkout({ ...body, amount_paise: 100 }, owner.cookie).expect(400);
});

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
test("callback signatures never grant access; signed capture webhooks journal money once despite replay and lost callbacks", async () => {
  const { owner, listing } = await scenario();
  const first = (
    await checkout(purchase(owner, listing), owner.cookie).expect(200)
  ).body.purchase;
  const order = gateway.orders.get(first.checkout.order_id);
  const payment = captured(order);
  const callback = {
    razorpay_order_id: order.id,
    razorpay_payment_id: payment.id,
    razorpay_signature: "0".repeat(64),
  };
  await post(
    "/v1/me/purchases/" + first.id + "/confirmation",
    callback,
    owner.cookie,
  ).expect(400);
  callback.razorpay_signature = sign(
    order.id + "|" + payment.id,
    config.payments!.keySecret,
  );
  const pending = (
    await post(
      "/v1/me/purchases/" + first.id + "/confirmation",
      callback,
      owner.cookie,
    ).expect(200)
  ).body.purchase;
  assert.equal(pending.status, "VERIFYING");
  assert.equal(pending.captured_at, null);
  assert.equal(pending.access_active, false);
  const payload = event(payment);
  const eventId = "evt_" + randomBytes(8).toString("hex");
  await webhook(payload, eventId, "0".repeat(64)).expect(400);
  await webhook(payload, eventId).expect(202);
  await webhook(payload, eventId).expect(202);
  await webhook(payload).expect(202);
  const worker = new PaymentEvents(database, config, gateway, now);
  await Promise.all([worker.tick(), worker.tick(), worker.tick()]);
  while (await worker.tick()) {}
  const paid = (
    await get("/v1/me/purchases/" + first.id, owner.cookie).expect(200)
  ).body.purchase;
  assert.equal(paid.status, "CAPTURED");
  assert.equal(paid.journal.length, 1);
  assert.equal(paid.journal[0].amount_paise, "59900");
  assert.equal(
    paid.captured_at,
    new Date(payload.created_at * 1000).toISOString(),
  );
  assert.equal(
    new Date(paid.matching_deadline).getTime() -
      new Date(paid.captured_at).getTime(),
    72 * 3600000,
  );
  assert.equal(paid.access_active, false);
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.can_request,
    true,
  );
  await webhook(
    { ...payload, created_at: payload.created_at + 1 },
    eventId,
  ).expect(409);
});

test("lost Order responses block replacement charges; durable capture recovers without browser callbacks after restart", async () => {
  const { owner, listing } = await scenario();
  gateway.loseCreate = true;
  const body = purchase(owner, listing);
  const unknown = (await checkout(body, owner.cookie).expect(200)).body
    .purchase;
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(unknown.checkout, null);
  const retry = (
    await checkout({ ...body, request_key: randomUUID() }, owner.cookie).expect(
      200,
    )
  ).body.purchase;
  assert.equal(retry.id, unknown.id);
  assert.equal(
    [...gateway.orders.values()].filter((o) => o.receipt === unknown.id).length,
    1,
  );
  const order = [...gateway.orders.values()].find(
    (o) => o.receipt === unknown.id,
  );
  const payment = captured(order);
  const payload = event(payment);
  gateway.unavailable = true;
  await webhook(payload).expect(202);
  const worker = new PaymentEvents(database, config, gateway, now);
  while (await worker.tick()) {}
  assert.equal(
    (await get("/v1/me/purchases/" + unknown.id, owner.cookie)).body.purchase
      .status,
    "UNKNOWN",
  );
  await app.close();
  app = await createApplication(
    config,
    database,
    now,
    undefined,
    undefined,
    gateway,
  );
  gateway.unavailable = false;
  clock = new Date(clock.getTime() + 60000);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  const paid = (
    await get("/v1/me/purchases/" + unknown.id, owner.cookie).expect(200)
  ).body.purchase;
  assert.equal(paid.status, "CAPTURED");
  assert.equal(paid.journal.length, 1);
  assert.equal(
    paid.captured_at,
    new Date(payload.created_at * 1000).toISOString(),
  );
  const later = (
    await checkout({ ...body, request_key: randomUUID() }, owner.cookie).expect(
      200,
    )
  ).body.purchase;
  assert.equal(later.id, unknown.id);
  assert.equal(later.checkout, null);
});
test("checkout and financial status enforce account, Learner, supply and block authority", async () => {
  const { owner, teacher, listing } = await scenario();
  const other = await learner();
  const body = purchase(owner, listing);
  await checkout(body).expect(401);
  await checkout(
    { ...body, learner_id: other.profile.id },
    owner.cookie,
  ).expect(404);
  await checkout(
    { ...body, listing_revision: listing.revision + 1 },
    owner.cookie,
  ).expect(409);
  const initial = (await checkout(body, owner.cookie).expect(200)).body
    .purchase;
  await get("/v1/me/purchases/" + initial.id, other.cookie).expect(404);
  await post(
    "/v1/me/purchases/" + initial.id + "/confirmation",
    {
      razorpay_order_id: initial.checkout.order_id,
      razorpay_payment_id: "pay_foreign",
      razorpay_signature: "0".repeat(64),
    },
    other.cookie,
  ).expect(404);
  await post(
    "/v1/me/listings/" + listing.id + "/actions/PAUSE",
    { revision: listing.revision },
    teacher.cookie,
  ).expect(200);
  await checkout(body, owner.cookie)
    .expect(200)
    .expect((response) => assert.equal(response.body.purchase.checkout, null));
  await checkout({ ...body, request_key: randomUUID() }, owner.cookie).expect(
    404,
  );
  assert.equal(
    (await get("/v1/me/purchases/" + initial.id, owner.cookie)).body.purchase
      .checkout,
    null,
  );
  await request(app.getHttpServer())
    .post("/v1/me/purchases")
    .send(body)
    .expect(403);
  const paused = (
    await get("/v1/me/listings", teacher.cookie)
  ).body.listings.find((row: any) => row.id === listing.id);
  const resumed = (
    await post(
      "/v1/me/listings/" + listing.id + "/actions/RESUME",
      { revision: paused.revision },
      teacher.cookie,
    ).expect(200)
  ).body.listing;
  await grantContactFixture(database, config, owner.email, "ACTIVE", clock);
  const enquiry = (
    await post(
      "/v1/me/contact-requests",
      {
        request_key: randomUUID(),
        listing_id: resumed.id,
        listing_revision: resumed.revision,
        learner_id: owner.profile.id,
        subject_id: "subject-physics",
        teaching_mode: "ONLINE",
        learning_requirements: "Practice Physics with worked examples",
        preferred_times: "Tuesday evenings, IST",
      },
      owner.cookie,
    ).expect(200)
  ).body.request;
  await post(
    "/v1/me/contact-requests/" + enquiry.id + "/safety/block",
    { blocked: true },
    owner.cookie,
  ).expect(200);
  await checkout(
    { ...body, request_key: randomUUID(), listing_revision: resumed.revision },
    owner.cookie,
  )
    .expect(403)
    .expect((response) => assert.equal(response.body.code, "CONTACT_BLOCKED"));
});
test("unknown attempts never credit a purchase; mismatched captures remain financial facts requiring review", async () => {
  const { owner, listing } = await scenario();
  const first = (
    await checkout(purchase(owner, listing), owner.cookie).expect(200)
  ).body.purchase;
  const orphanOrder = await gateway.createOrder(randomUUID(), 59900, "INR");
  const orphan = captured(orphanOrder);
  await webhook(event(orphan)).expect(202);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  assert.equal(
    (await get("/v1/me/purchases/" + first.id, owner.cookie)).body.purchase
      .journal.length,
    0,
  );
  const payment = captured(gateway.orders.get(first.checkout.order_id), 100);
  await webhook(event(payment)).expect(202);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  const reviewed = (await get("/v1/me/purchases/" + first.id, owner.cookie))
    .body.purchase;
  assert.equal(reviewed.status, "REVIEW");
  assert.equal(reviewed.resolution_required, true);
  assert.equal(reviewed.journal[0].kind, "UNEXPECTED_CAPTURE");
  assert.equal(reviewed.journal[0].amount_paise, "100");
  assert.equal(reviewed.access_active, false);
});
test("late capture keeps its original matching deadline and out-of-order failures cannot undo captured money", async () => {
  const { owner, listing } = await scenario();
  const first = (
    await checkout(purchase(owner, listing), owner.cookie).expect(200)
  ).body.purchase;
  const payment = captured(gateway.orders.get(first.checkout.order_id));
  const payload = event(payment);
  clock = new Date(clock.getTime() + 73 * 3600000);
  await webhook(payload).expect(202);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  const paid = (await get("/v1/me/purchases/" + first.id, owner.cookie)).body
    .purchase;
  assert.equal(paid.resolution_required, true);
  assert.equal(
    paid.captured_at,
    new Date(payload.created_at * 1000).toISOString(),
  );
  assert.ok(new Date(paid.matching_deadline) < clock);
  await webhook(
    event({ ...payment, status: "failed", captured: false }, "payment.failed"),
  ).expect(202);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  const replay = (await get("/v1/me/purchases/" + first.id, owner.cookie)).body
    .purchase;
  assert.equal(replay.status, "CAPTURED");
  assert.equal(replay.journal.length, 1);
  assert.equal(replay.captured_at, paid.captured_at);
});

const enquiry = (owner: any, listing: any) => ({
  request_key: randomUUID(),
  listing_id: listing.id,
  listing_revision: listing.revision,
  learner_id: owner.profile.id,
  subject_id: "subject-physics",
  teaching_mode: "ONLINE",
  learning_requirements: "Learn Physics mechanics with worked examples",
  preferred_times: "Tuesday evenings, IST",
});
const submitEnquiry = (body: unknown, cookie: string) =>
  post("/v1/me/contact-requests", body, cookie);
const decide = (id: string, cookie: string) =>
  post(
    "/v1/me/tutor-requests/" + id + "/decisions",
    { decision: "ACCEPT" },
    cookie,
  );
async function fund(
  owner: any,
  listing: any,
  input = purchase(owner, listing),
) {
  const row = (await checkout(input, owner.cookie).expect(200)).body.purchase;
  const payment = captured(gateway.orders.get(row.checkout.order_id));
  await webhook(event(payment)).expect(202);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  return row;
}
test("paid capture enables enquiries and the first eligible acceptance activates exactly one 30-day pass", async () => {
  const { owner, teacher, listing } = await scenario();
  const body = enquiry(owner, listing);
  await submitEnquiry(body, owner.cookie).expect(403);
  const paid = await fund(owner, listing);
  const matching = (
    await get("/v1/me/request-access", owner.cookie).expect(200)
  ).body;
  assert.equal(matching.can_request, true);
  assert.equal(matching.coverage.status, "MATCHING");
  assert.equal(
    (await get("/v1/me/purchases/" + paid.id, owner.cookie)).body.purchase
      .access_active,
    false,
  );
  const request = (await submitEnquiry(body, owner.cookie).expect(200)).body
    .request;
  clock = new Date(clock.getTime() + 3600000);
  const accepted = (await decide(request.id, teacher.cookie).expect(200)).body;
  assert.equal(accepted.connection_status, "ACTIVE");
  const active = (await get("/v1/me/request-access", owner.cookie)).body
    .coverage;
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.starts_at, clock.toISOString());
  assert.equal(
    new Date(active.ends_at).getTime() - new Date(active.starts_at).getTime(),
    30 * 86400000,
  );
  assert.equal(
    (await get("/v1/me/purchases/" + paid.id, owner.cookie)).body.purchase
      .access_active,
    true,
  );
  const contacts = (
    await get(
      "/v1/me/connections/" + accepted.connection_id + "/contacts",
      owner.cookie,
    ).expect(200)
  ).body;
  assert.equal(contacts.peer.email, teacher.email);
  await decide(request.id, teacher.cookie)
    .expect(200)
    .expect((response) => assert.equal(response.body.replayed, true));
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.coverage.starts_at,
    active.starts_at,
  );
});

test("two paid Tutors accept concurrently with one entitlement, fixed activation dates and one capture through replay", async () => {
  const { owner, teacher, listing } = await scenario();
  const second = await tutor();
  const secondListing = await publish(second);
  const paid = await fund(owner, listing);
  const before = (await get("/v1/me/request-access", owner.cookie)).body
    .coverage;
  const requests = await Promise.all([
    submitEnquiry(enquiry(owner, listing), owner.cookie).expect(200),
    submitEnquiry(enquiry(owner, secondListing), owner.cookie).expect(200),
  ]);
  clock = new Date(clock.getTime() + 3600000);
  const replies = await Promise.all([
    decide(requests[0].body.request.id, teacher.cookie).expect(200),
    decide(requests[1].body.request.id, second.cookie).expect(200),
  ]);
  assert.notEqual(replies[0].body.connection_id, replies[1].body.connection_id);
  assert.ok(replies.every((r) => r.body.connection_status === "ACTIVE"));
  const active = (await get("/v1/me/request-access", owner.cookie)).body
    .coverage;
  assert.equal(active.id, before.id);
  assert.equal(active.purchase_id, paid.id);
  assert.equal(active.starts_at, clock.toISOString());
  clock = new Date(clock.getTime() + 3600000);
  await Promise.all([
    decide(requests[0].body.request.id, teacher.cookie).expect(200),
    decide(requests[1].body.request.id, second.cookie).expect(200),
  ]);
  const order = gateway.orders.get(paid.checkout.order_id);
  const payment = [...gateway.payments.values()].find(
    (p) => p.order_id === order.id,
  );
  await webhook(
    event(
      payment,
      "payment.captured",
      Math.floor(
        new Date(before.starts_at || paid.created_at).getTime() / 1000,
      ),
    ),
  ).expect(202);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  const final = (await get("/v1/me/purchases/" + paid.id, owner.cookie)).body
    .purchase;
  assert.equal(final.access.starts_at, active.starts_at);
  assert.equal(final.access.ends_at, active.ends_at);
  assert.equal(final.journal.length, 1);
  assert.equal(
    [...gateway.orders.values()].filter((o) => o.receipt === paid.id).length,
    1,
  );
  for (const reply of replies)
    await get(
      "/v1/me/connections/" + reply.body.connection_id + "/contacts",
      owner.cookie,
    ).expect(200);
  await app.close();
  app = await createApplication(
    config,
    database,
    now,
    undefined,
    undefined,
    gateway,
  );
  const retry = (
    await decide(requests[0].body.request.id, teacher.cookie).expect(200)
  ).body;
  assert.equal(retry.replayed, true);
  assert.equal(retry.connection_id, replies[0].body.connection_id);
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.coverage.starts_at,
    active.starts_at,
  );
});

test("production excludes test-provider coverage from enquiry, Connection and safety interfaces", async () => {
  const { owner, teacher, listing } = await scenario();
  await fund(owner, listing);
  const row = (
    await submitEnquiry(enquiry(owner, listing), owner.cookie).expect(200)
  ).body.request;
  const connection = (await decide(row.id, teacher.cookie).expect(200)).body
    .connection_id;
  const production = {
    ...config,
    mode: "production" as const,
    webOrigin: "https://marketplace.example.test",
    allowedOrigins: ["https://marketplace.example.test"],
    mailTransport: "smtp" as const,
    guardianMode: "disabled" as const,
    evidenceScanner: "disabled" as const,
    payments: undefined,
  };
  const prod = await createApplication(production, database, now);
  const ownerCookie = owner.cookie.replace("tm_session=", "__Host-tm_session=");
  try {
    const read = (path: string) =>
      request(prod.getHttpServer()).get(path).set("Cookie", ownerCookie);
    await read("/v1/me/connections/" + connection + "/safety").expect(404);
    await read("/v1/me/connections/" + connection + "/contacts").expect(403);
    await read("/v1/me/contact-requests/" + row.id).expect(404);
    assert.equal(
      (await read("/v1/me/contact-requests").expect(200)).body.requests.length,
      0,
    );
    assert.equal(
      (await read("/v1/me/connections").expect(200)).body.connections.length,
      0,
    );
    assert.equal(
      (await read("/v1/me/request-access").expect(200)).body.can_request,
      false,
    );
  } finally {
    await prod.close();
  }
});

async function refreshSession(user: any) {
  const result = await post("/v1/auth/sessions", {
    email: user.email,
    password,
  }).expect(200);
  user.cookie = result.headers["set-cookie"][0];
}
test("ordinary expiry preserves covered requests and established contacts; only an explicit new checkout creates a repurchase", async () => {
  const { owner, teacher, listing } = await scenario();
  const otherListing = await publishOffer(teacher, {
    ...offer,
    title: "More Physics with worked examples",
  });
  const originalInput = purchase(owner, listing);
  const paid = await fund(owner, listing, originalInput);
  const first = (
    await submitEnquiry(enquiry(owner, listing), owner.cookie).expect(200)
  ).body.request;
  clock = new Date(clock.getTime() + 3600000);
  const connected = (await decide(first.id, teacher.cookie).expect(200)).body
    .connection_id;
  const active = (await get("/v1/me/request-access", owner.cookie)).body
    .coverage;
  clock = new Date(new Date(active.ends_at).getTime() - 3600000);
  await refreshSession(owner);
  await refreshSession(teacher);
  await grantTutorProFixture(database,config,teacher.email,clock); // Keep supply available while testing Learner expiry.
  const later = (
    await submitEnquiry(enquiry(owner, otherListing), owner.cookie).expect(200)
  ).body.request;
  clock = new Date(new Date(active.ends_at).getTime());
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.can_request,
    false,
  );
  await submitEnquiry(
    { ...enquiry(owner, otherListing), request_key: randomUUID() },
    owner.cookie,
  ).expect(403);
  const next = (
    await checkout(purchase(owner, otherListing), owner.cookie).expect(200)
  ).body.purchase;
  assert.notEqual(next.id, paid.id);
  assert.equal(next.status, "ORDER_READY");
  assert.equal(next.journal.length, 0);
  assert.equal(
    (await checkout(originalInput, owner.cookie).expect(200)).body.purchase.id,
    paid.id,
  );
  clock = new Date(clock.getTime() + 3600000);
  const accepted = (await decide(later.id, teacher.cookie).expect(200)).body;
  assert.equal(accepted.connection_status, "ACTIVE");
  await get(
    "/v1/me/connections/" + connected + "/contacts",
    owner.cookie,
  ).expect(200);
  await get(
    "/v1/me/connections/" + accepted.connection_id + "/contacts",
    owner.cookie,
  ).expect(200);
  const old = (await get("/v1/me/purchases/" + paid.id, owner.cookie)).body
    .purchase;
  assert.equal(old.access.starts_at, active.starts_at);
  assert.equal(old.access.ends_at, active.ends_at);
  assert.equal(old.access.status, "EXPIRED");
  assert.equal(
    (await get("/v1/me/purchases/" + next.id, owner.cookie)).body.purchase
      .access_active,
    false,
  );
});

test("supply suspended during provider work preserves captured money and routes to an explicit eligible alternative", async () => {
  const { owner, teacher, listing } = await scenario();
  let release!: () => void;
  let started!: (order: any) => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const created = new Promise<any>((resolve) => {
    started = resolve;
  });
  gateway.onCreate = async (order) => {
    started(order);
    await gate;
  };
  const pending = checkout(purchase(owner, listing), owner.cookie)
    .expect(200)
    .then((result) => result);
  const order = await created;
  try {
    await post(
      "/v1/staff/listings/" + listing.id + "/safety",
      {
        revision: listing.revision,
        action: "SUSPEND",
        reason: "Fictional restriction while checkout is pending",
      },
      teacher.reviewer!.cookie,
    ).expect(200);
  } finally {
    release();
    gateway.onCreate = undefined;
  }
  const reserved = (await pending).body.purchase;
  assert.equal(reserved.checkout, null);
  const payment = captured(order);
  await webhook(event(payment)).expect(202);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  const paid = (
    await get("/v1/me/purchases/" + reserved.id, owner.cookie).expect(200)
  ).body.purchase;
  assert.equal(paid.status, "CAPTURED");
  assert.equal(paid.journal.length, 1);
  assert.equal(paid.access_active, false);
  assert.equal(paid.requires_alternative, true);
  await submitEnquiry(enquiry(owner, listing), owner.cookie).expect(404);
  assert.equal(
    (await get("/v1/me/connections", owner.cookie)).body.connections.length,
    0,
  );
  const alternative = await tutor();
  const available = await publish(alternative);
  const request = (
    await submitEnquiry(enquiry(owner, available), owner.cookie).expect(200)
  ).body.request;
  const accepted = (await decide(request.id, alternative.cookie).expect(200))
    .body;
  assert.equal(accepted.connection_status, "ACTIVE");
  assert.equal(
    (await get("/v1/me/purchases/" + reserved.id, owner.cookie)).body.purchase
      .journal.length,
    1,
  );
});

test("abandoning the Learner role before capture records money without enabling enquiries or contacts", async () => {
  const { owner, listing } = await scenario();
  const reserved = (
    await checkout(purchase(owner, listing), owner.cookie).expect(200)
  ).body.purchase;
  await post("/v1/me/roles", { roles: ["TUTOR"] }, owner.cookie).expect(200);
  const payment = captured(gateway.orders.get(reserved.checkout.order_id));
  await webhook(event(payment)).expect(202);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  const access = (await get("/v1/me/request-access", owner.cookie)).body;
  assert.equal(access.can_request, false);
  const paid = (await get("/v1/me/purchases/" + reserved.id, owner.cookie)).body
    .purchase;
  assert.equal(paid.journal.length, 1);
  assert.equal(paid.requires_alternative, true);
  assert.equal(paid.access_active, false);
  await submitEnquiry(enquiry(owner, listing), owner.cookie).expect(403);
  assert.equal(
    (await get("/v1/me/connections", owner.cookie)).body.connections.length,
    0,
  );
});

test("paid matching deadline equality cannot activate a pass or authorize a replacement charge", async () => {
  const { owner, teacher, listing } = await scenario();
  const paid = await fund(owner, listing);
  const request = (
    await submitEnquiry(enquiry(owner, listing), owner.cookie).expect(200)
  ).body.request;
  clock = new Date(request.expires_at);
  await decide(request.id, teacher.cookie).expect(409);
  assert.equal(
    (await get("/v1/me/connections", owner.cookie)).body.connections.length,
    0,
  );
  const state = (await get("/v1/me/purchases/" + paid.id, owner.cookie)).body
    .purchase;
  assert.equal(state.access_active, false);
  assert.equal(state.access.starts_at, null);
  assert.equal(state.access.status, "EXPIRED");
  assert.equal(
    (await checkout(purchase(owner, listing), owner.cookie).expect(200)).body
      .purchase.id,
    paid.id,
  );
});

test("a financial review blocks further paid acquisitions while preserving an established safe Connection", async () => {
  const { owner, teacher, listing } = await scenario();
  const otherListing = await publishOffer(teacher, {
    ...offer,
    title: "Another Physics learning combination",
  });
  const paid = await fund(owner, listing);
  const first = (
    await submitEnquiry(enquiry(owner, listing), owner.cookie).expect(200)
  ).body.request;
  const connected = (await decide(first.id, teacher.cookie).expect(200)).body
    .connection_id;
  const pending = (
    await submitEnquiry(enquiry(owner, otherListing), owner.cookie).expect(200)
  ).body.request;
  const extra = captured(gateway.orders.get(paid.checkout.order_id));
  await webhook(event(extra)).expect(202);
  while (await new PaymentEvents(database, config, gateway, now).tick()) {}
  const reviewed = (await get("/v1/me/purchases/" + paid.id, owner.cookie)).body
    .purchase;
  assert.equal(reviewed.resolution_required, true);
  assert.equal(reviewed.journal.length, 2);
  assert.deepEqual(reviewed.journal.map((entry: any) => entry.kind).sort(), [
    "CAPTURE",
    "UNEXPECTED_CAPTURE",
  ]);
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.can_request,
    false,
  );
  await decide(pending.id, teacher.cookie).expect(403);
  await get(
    "/v1/me/connections/" + connected + "/contacts",
    owner.cookie,
  ).expect(200);
});
