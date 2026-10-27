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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/coupons_test`,
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

async function campaign(percent = 100, maxUses = 100) {
  const operator = await fixture(["FINANCE"]);
  const mfa = await enroll(operator.cookie);
  const input = {
    code: "SAVE" + randomBytes(6).toString("hex").toUpperCase(),
    percent_off: percent,
    max_uses: maxUses,
    starts_at: clock.toISOString(),
    expires_at: new Date(clock.getTime() + 86400000).toISOString(),
    reason: "Fictional coupon campaign for acceptance testing",
  };
  const r = await post("/v1/staff/coupons", input, mfa.cookie).expect(201);
  return { operator, mfa, input, row: r.body.coupon };
}
const enquiry = (owner: any, listing: any) => ({
  request_key: randomUUID(),
  listing_id: listing.id,
  listing_revision: listing.revision,
  learner_id: owner.profile.id,
  subject_id: "subject-physics",
  teaching_mode: "ONLINE",
  learning_requirements: "Fictional Physics practice with worked examples",
  preferred_times: "Weekday evenings, IST",
});
test("100% coupon works without a payment provider, creates no money, survives retry and activates once on Tutor acceptance", async () => {
  const { owner, teacher, listing } = await scenario();
  const c = await campaign();
  const before = gateway.orders.size;
  const saved = config.payments;
  config.payments = undefined;
  try {
    const input = { ...purchase(owner, listing), coupon_code: c.input.code };
    const quote = await post(
      "/v1/me/coupons/quote",
      { code: c.input.code.toLowerCase() },
      owner.cookie,
    ).expect(200);
    assert.equal(quote.body.quote.total_paise, 0);
    const replies = await Promise.all([
      checkout(input, owner.cookie).expect(200),
      checkout(input, owner.cookie).expect(200),
    ]);
    assert.equal(replies[0].body.purchase, null);
    assert.equal(replies[0].body.promotion.id, replies[1].body.promotion.id);
    assert.equal(gateway.orders.size, before);
    assert.equal(
      (
        await database.pool.query(
          "SELECT count(*)::int AS count FROM purchase_cycles WHERE payer_id=$1",
          [owner.id],
        )
      ).rows[0].count,
      0,
    );
    const grant = (
      await database.pool.query(
        "SELECT * FROM access_entitlements WHERE payer_id=$1 AND source='COUPON'",
        [owner.id],
      )
    ).rows[0];
    assert.equal(grant.captured_at, null);
    assert.equal(grant.starts_at, null);
    await checkout({ ...input, listing_revision: 999 }, owner.cookie).expect(
      409,
    );
    const access = await get("/v1/me/request-access", owner.cookie).expect(200);
    assert.equal(access.body.can_request, true);
    assert.equal(access.body.coverage.source, "COUPON");
    const r = await post(
      "/v1/me/contact-requests",
      enquiry(owner, listing),
      owner.cookie,
    ).expect(200);
    const d = await post(
      "/v1/me/tutor-requests/" + r.body.request.id + "/decisions",
      { decision: "ACCEPT" },
      teacher.cookie,
    ).expect(200);
    await get(
      "/v1/me/connections/" + d.body.connection_id,
      owner.cookie,
    ).expect(200);
    await post(
      "/v1/me/connections/" + d.body.connection_id + "/messages",
      {
        client_message_id: randomUUID(),
        text: "Hello from the coupon-funded learner.",
      },
      owner.cookie,
    ).expect(201);
    const history = await get("/v1/me/coupon-redemptions", owner.cookie).expect(
      200,
    );
    const active = history.body.redemptions[0];
    assert.equal(active.access.status, "ACTIVE");
    assert.equal(
      new Date(active.access.ends_at).getTime() -
        new Date(active.access.starts_at).getTime(),
      30 * 86400000,
    );
    await post(
      "/v1/me/tutor-requests/" + r.body.request.id + "/decisions",
      { decision: "ACCEPT" },
      teacher.cookie,
    ).expect(200);
    const again = await get("/v1/me/coupon-redemptions", owner.cookie);
    assert.equal(
      again.body.redemptions[0].access.ends_at,
      active.access.ends_at,
    );
    await checkout(
      { ...input, request_key: randomUUID() },
      owner.cookie,
    ).expect(409);
  } finally {
    config.payments = saved;
  }
});
test("campaign capacity is atomic across users; disabling prevents new uses and staff requires Finance MFA", async () => {
  const { owner, listing } = await scenario();
  const second = await learner();
  const c = await campaign(100, 1);
  const results = await Promise.all([
    checkout(
      { ...purchase(owner, listing), coupon_code: c.input.code },
      owner.cookie,
    ),
    checkout(
      { ...purchase(second, listing), coupon_code: c.input.code },
      second.cookie,
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  await post("/v1/staff/coupons", c.input, owner.cookie).expect(403);
  await post("/v1/staff/coupons", c.input, c.operator.cookie).expect(403);
  const support = await fixture(["SUPPORT"]);
  const mfa = await enroll(support.cookie);
  await get("/v1/staff/coupons", mfa.cookie).expect(403);
  const c2 = await campaign();
  await post(
    "/v1/staff/coupons/" + c2.row.id + "/disable",
    { reason: "Stop this fictional campaign early" },
    c2.mfa.cookie,
  ).expect(200);
  await post(
    "/v1/me/coupons/quote",
    { code: c2.input.code },
    owner.cookie,
  ).expect(409);
  await checkout(
    { ...purchase(owner, listing), coupon_code: c2.input.code },
    owner.cookie,
  ).expect(409);
});
test("invalid, not-yet-started and expired codes cannot grant access; cancellation does not restore a coupon use", async () => {
  const { owner, listing } = await scenario();
  const c = await campaign();
  await post(
    "/v1/me/coupons/quote",
    { code: "MISSINGCODE" },
    owner.cookie,
  ).expect(409);
  await checkout(
    { ...purchase(owner, listing), coupon_code: c.input.code, amount_paise: 0 },
    owner.cookie,
  ).expect(400);
  const input = { ...purchase(owner, listing), coupon_code: c.input.code };
  const r = await checkout(input, owner.cookie).expect(200);
  const id = r.body.promotion.id;
  const outsider = await learner();
  await post(
    "/v1/me/coupon-redemptions/" + id + "/cancellation",
    {},
    outsider.cookie,
  ).expect(404);
  await post(
    "/v1/me/coupon-redemptions/" + id + "/cancellation",
    {},
    owner.cookie,
  ).expect(200);
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.can_request,
    false,
  );
  await checkout({ ...input, request_key: randomUUID() }, owner.cookie).expect(
    409,
  );
  clock = new Date(clock.getTime() + 86400000);
  await post(
    "/v1/me/coupons/quote",
    { code: c.input.code },
    outsider.cookie,
  ).expect(409);
  const future = {
    ...c.input,
    code: "FUTURE" + randomBytes(4).toString("hex").toUpperCase(),
    starts_at: new Date(clock.getTime() + 3600000).toISOString(),
    expires_at: new Date(clock.getTime() + 86400000).toISOString(),
  };
  const operator = await fixture(["FINANCE"]);
  const mfa = await enroll(operator.cookie);
  await post("/v1/staff/coupons", future, mfa.cookie).expect(201);
  await post(
    "/v1/me/coupons/quote",
    { code: future.code },
    outsider.cookie,
  ).expect(409);
});
test("partial coupon prices the provider order and immutable disclosures; only confirmed discounted capture authorizes access", async () => {
  const { owner, listing } = await scenario();
  const c = await campaign(25);
  const input = { ...purchase(owner, listing), coupon_code: c.input.code };
  const r = await checkout(input, owner.cookie).expect(200);
  const cycle = r.body.purchase;
  assert.equal(cycle.amount_paise, 44925);
  assert.equal(cycle.coupon.discount_paise, 14975);
  assert.equal(
    cycle.disclosures.base_paise + cycle.disclosures.tax_paise,
    44925,
  );
  assert.equal(gateway.orders.get(cycle.checkout.order_id).amount, 44925);
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.can_request,
    false,
  );
  assert.equal(
    (await checkout(input, owner.cookie)).body.purchase.id,
    cycle.id,
  );
  const order = gateway.orders.get(cycle.checkout.order_id);
  const payment = {
    id: "pay_" + randomBytes(8).toString("hex"),
    entity: "payment",
    order_id: order.id,
    amount: 44925,
    currency: "INR",
    status: "captured",
    captured: true,
    created_at: Math.floor(clock.getTime() / 1000),
  };
  gateway.payments.set(payment.id, payment);
  order.status = "paid";
  const body = JSON.stringify({
    entity: "event",
    event: "payment.captured",
    created_at: payment.created_at,
    payload: { payment: { entity: payment } },
  });
  await request(app.getHttpServer())
    .post("/v1/payments/razorpay/webhooks")
    .set("Content-Type", "application/json")
    .set("x-razorpay-event-id", "evt_" + randomUUID())
    .set(
      "x-razorpay-signature",
      createHmac("sha256", config.payments!.webhookSecret)
        .update(body)
        .digest("hex"),
    )
    .send(body)
    .expect(202);
  await new PaymentEvents(database, config, gateway, now).tick();
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.can_request,
    true,
  );
});
test("coupon matching expiry equality prevents acceptance and permits a new different coupon without altering old facts", async () => {
  const { owner, teacher, listing } = await scenario();
  const c = await campaign();
  const input = { ...purchase(owner, listing), coupon_code: c.input.code };
  const r = await checkout(input, owner.cookie).expect(200);
  const req = (
    await post(
      "/v1/me/contact-requests",
      enquiry(owner, listing),
      owner.cookie,
    ).expect(200)
  ).body.request;
  clock = new Date(r.body.promotion.access.matching_deadline);
  const sign = async (user: any) => {
    const login = await post("/v1/auth/sessions", {
      email: user.email,
      password,
    }).expect(200);
    return login.headers["set-cookie"][0];
  };
  owner.cookie = await sign(owner);
  teacher.cookie = await sign(teacher);
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.can_request,
    false,
  );
  await post(
    "/v1/me/tutor-requests/" + req.id + "/decisions",
    { decision: "ACCEPT" },
    teacher.cookie,
  ).expect(409);
  const history = (await get("/v1/me/coupon-redemptions", owner.cookie)).body
    .redemptions;
  assert.equal(history[0].access.status, "EXPIRED");
  assert.equal(history[0].access.starts_at, null);
  const next = await campaign();
  await checkout(
    { ...purchase(owner, listing), coupon_code: next.input.code },
    owner.cookie,
  ).expect(200);
});
test("ordinary production-mode verified accounts can redeem a non-cash coupon while checkout stays disabled", async () => {
  const { owner, teacher, listing } = await scenario();
  const operator = await fixture(["FINANCE"]);
  const mfa = await enroll(operator.cookie);
  // Isolated fixture only: emulate previously reviewed non-test evidence. Never alter hosted evidence.
  await database.pool.query(
    "UPDATE tutor_evidence SET test_only=false WHERE user_id=$1",
    [teacher.id],
  );
  const production = {
    ...config,
    mode: "production" as const,
    guardianMode: "disabled" as const,
    evidenceScanner: "disabled" as const,
    payments: undefined,
    mailTransport: "smtp" as const,
  };
  const prod = await createApplication(production, database, now);
  const cookie = (value: string) =>
    value
      .replace("tm_session=", "__Host-tm_session=")
      .replace("tm_staff=", "__Host-tm_staff=");
  const write = (path: string, body: unknown, c: string) =>
    request(prod.getHttpServer())
      .post(path)
      .set("Origin", origin)
      .set("Cookie", cookie(c))
      .send(body);
  const read = (path: string, c: string) =>
    request(prod.getHttpServer()).get(path).set("Cookie", cookie(c));
  try {
    const code = "REALUSER" + randomBytes(4).toString("hex").toUpperCase();
    await write(
      "/v1/staff/coupons",
      {
        code,
        percent_off: 100,
        max_uses: 5,
        starts_at: clock.toISOString(),
        expires_at: new Date(clock.getTime() + 86400000).toISOString(),
        reason: "Isolated production-mode non-cash acceptance",
      },
      mfa.cookie,
    ).expect(201);
    assert.equal(
      (await read("/v1/payments/policy", owner.cookie)).body.checkout_available,
      false,
    );
    await write(
      "/v1/me/purchases",
      { ...purchase(owner, listing), coupon_code: code },
      owner.cookie,
    ).expect(200);
    const access = (
      await read("/v1/me/request-access", owner.cookie).expect(200)
    ).body;
    assert.equal(access.can_request, true);
    assert.equal(access.coverage.test_only, false);
    const row = (
      await write(
        "/v1/me/contact-requests",
        enquiry(owner, listing),
        owner.cookie,
      ).expect(200)
    ).body.request;
    const connection = (
      await write(
        "/v1/me/tutor-requests/" + row.id + "/decisions",
        { decision: "ACCEPT" },
        teacher.cookie,
      ).expect(200)
    ).body.connection_id;
    assert.equal(
      (await read("/v1/me/contact-requests", owner.cookie)).body.requests
        .length,
      1,
    );
    assert.equal(
      (await read("/v1/me/connections", owner.cookie)).body.connections[0].id,
      connection,
    );
    await read(
      "/v1/me/connections/" + connection + "/contacts",
      owner.cookie,
    ).expect(200);
  } finally {
    await prod.close();
  }
});
