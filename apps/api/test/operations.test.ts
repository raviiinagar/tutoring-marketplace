import {
  ConfiguredNotificationDelivery,
  DeliveryConfigurationError,
} from "../src/notification-delivery.js";
import { NotificationsService } from "../src/notifications.js";
import { AuthService } from "../src/auth.js";
import { StaffService } from "../src/staff.js";
import { RefundsService } from "../src/refunds.js";
import { OperationsMonitor } from "../src/operations-monitor.js";
import { notificationWorker } from "../src/notifications.js";
import { readFile } from "node:fs/promises";
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
let notificationOutage = false;
const deliveredIds: string[] = [];
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
    {
      testOnly: true,
      smsConfigured: false,
      sendEmail: async (message) => {
        if (notificationOutage)
          throw new Error("FICTIONAL_PROVIDER_SECRET_DO_NOT_LOG");
        const result = await new ConfiguredNotificationDelivery(
          config,
        ).sendEmail(message);
        deliveredIds.push(message.id);
        return result;
      },
      sendCriticalSms: async () => {
        throw new DeliveryConfigurationError("No live SMS in tests");
      },
    },
  );
});
beforeEach(() => {
  clock = new Date(clock.getTime() + 8 * 86400000);
  notificationOutage = false;
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
test("Finance MFA pauses only new checkout and versioned control retries preserve the original purchase", async () => {
  const finance = await fixture(["FINANCE"]),
    mfa = await enroll(finance.cookie),
    ordinary = await fixture(null);
  const query =
    "/v1/staff/operations?scope=FINANCE&reason=Inspect%20unsafe%20billing%20operations";
  await get(query, ordinary.cookie).expect(403);
  await get(query, finance.cookie).expect(403);
  let report = (await get(query, mfa.cookie).expect(200)).body;
  const { owner, listing } = await scenario(),
    requestKey = randomUUID();
  const body = {
    request_key: requestKey,
    listing_id: listing.id,
    listing_revision: listing.revision,
    learner_id: owner.profile.id,
    policy_version: "access-v1",
  };
  const purchase = (
    await post("/v1/me/purchases", body, owner.cookie).expect(200)
  ).body.purchase;
  const change = {
    request_key: randomUUID(),
    revision: report.checkout.revision,
    paused: true,
    reason: "Pause new checkout during billing investigation",
  };
  const paused = (
    await post("/v1/staff/operations/checkout", change, mfa.cookie).expect(200)
  ).body;
  assert.equal(paused.checkout.paused, true);
  assert.ok(paused.correlation_id);
  assert.equal(
    (await get("/v1/payments/policy")).body.checkout_available,
    false,
  );
  assert.equal(
    (await get("/v1/me/request-access", owner.cookie)).body.checkout_available,
    false,
  );
  await post(
    "/v1/me/purchases",
    { ...body, request_key: randomUUID() },
    ordinary.cookie,
  ).expect(503);
  const retried = (
    await post("/v1/me/purchases", body, owner.cookie).expect(200)
  ).body.purchase;
  assert.equal(retried.id, purchase.id);
  assert.equal(retried.checkout, null);
  assert.equal(
    (
      await post("/v1/staff/operations/checkout", change, mfa.cookie).expect(
        200,
      )
    ).body.correlation_id,
    paused.correlation_id,
  );
  await post(
    "/v1/staff/operations/checkout",
    { ...change, request_key: randomUUID(), paused: false },
    mfa.cookie,
  ).expect(409);
  report = (await get(query, mfa.cookie).expect(200)).body;
  assert.equal(report.checkout.paused, true);
  await post(
    "/v1/staff/operations/checkout",
    {
      request_key: randomUUID(),
      revision: report.checkout.revision,
      paused: false,
      reason: "Reconciliation checked before resuming checkout",
    },
    mfa.cookie,
  ).expect(200);
  assert.equal(
    (await get("/v1/payments/policy")).body.checkout_available,
    true,
  );
});

test("durable redacted alerts deduplicate outside support hours and verified recovery resolves only current conditions", async () => {
  const operator = await fixture(["SUPPORT", "FINANCE"]),
    mfa = await enroll(operator.cookie);
  config.operations = { ownerId: operator.id };
  const monitor = new OperationsMonitor(database, config, now);
  // Sunday 02:00 IST, outside the published human-support window.
  clock = new Date("2027-06-05T20:30:00.000Z");
  const session = await post("/v1/auth/sessions", {
    email: operator.email,
    password,
  }).expect(200);
  const fresh = await post(
    "/v1/staff/sessions",
    { password, code: totp(mfa.secret, clock) },
    session.headers["set-cookie"][0],
  ).expect(200);
  const cookie = combine(
    session.headers["set-cookie"][0],
    fresh.headers["set-cookie"][0],
  );
  const { owner, listing } = await scenario();
  gateway.loseCreate = true;
  const unknown = (
    await checkout(purchase(owner, listing), owner.cookie).expect(200)
  ).body.purchase;
  assert.equal(unknown.status, "UNKNOWN");
  for (let i = 0; i < 3; i++) await monitor.workerResult("payments", false);
  clock = new Date(clock.getTime() + 6 * 60000);
  await monitor.scan();
  await monitor.scan();
  const query =
    "/v1/staff/operations?scope=FINANCE&reason=Inspect%20unknown%20provider%20purchase";
  const report = (await get(query, cookie).expect(200)).body;
  const alert = report.alerts.find((a: any) => a.code === "UNKNOWN_PAYMENTS");
  assert.ok(alert);
  assert.equal(alert.count, 1);
  assert.equal(
    report.alerts.filter((a: any) => a.code === "UNKNOWN_PAYMENTS").length,
    1,
  );
  assert.equal(report.routing.email, "CONFIGURED");
  assert.ok(
    report.jobs.some((j: any) => j.kind === "PURCHASE" && j.id === unknown.id),
  );
  assert.ok(!JSON.stringify(report).includes(owner.email));
  assert.ok(!JSON.stringify(report).includes(config.payments!.keySecret));
  const support = (
    await get(
      "/v1/staff/operations?scope=SUPPORT&reason=Inspect%20worker%20recovery%20health",
      cookie,
    ).expect(200)
  ).body;
  assert.ok(support.alerts.some((a: any) => a.code === "WORKER_ERRORS"));
  const worker = notificationWorker(database, config, now);
  while (await worker.tick()) {}
  const notices = (
    await get("/v1/me/notifications", session.headers["set-cookie"][0]).expect(
      200,
    )
  ).body.notifications.filter((n: any) => n.target_id === alert.id);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].status, "SENT");
  const mail = JSON.parse(
    await readFile(join(config.mailDir, notices[0].id + ".json"), "utf-8"),
  );
  assert.equal(mail.to, operator.email);
  assert.ok(mail.text.includes("/staff/operations"));
  assert.ok(!mail.text.includes(owner.email));
  await monitor.workerResult("payments", true);
  await monitor.scan();
  const recovered = (
    await get(
      "/v1/staff/operations?scope=SUPPORT&reason=Inspect%20worker%20recovery%20health",
      cookie,
    ).expect(200)
  ).body;
  assert.ok(
    !recovered.alerts.some(
      (a: any) => a.code === "WORKER_ERRORS" && a.status === "OPEN",
    ),
  );
  config.operations = undefined;
});

test("provider-outage inbox replay is scoped and duplicate replay produces one captured business fact", async () => {
  const finance = await fixture(["FINANCE"]),
    fmfa = await enroll(finance.cookie),
    support = await fixture(["SUPPORT"]),
    smfa = await enroll(support.cookie);
  const s = await scenario(),
    cycle = (
      await checkout(purchase(s.owner, s.listing), s.owner.cookie).expect(200)
    ).body.purchase;
  const payment = captured(gateway.orders.get(cycle.checkout.order_id)),
    eventId = "evt_" + randomBytes(8).toString("hex");
  await webhook(event(payment), eventId).expect(202);
  gateway.unavailable = true;
  const events = new PaymentEvents(database, config, gateway, now);
  for (let i = 0; i < 3; i++) {
    await events.tick();
    clock = new Date(clock.getTime() + 240000);
  }
  const monitor = new OperationsMonitor(database, config, now);
  await monitor.scan();
  const query =
    "/v1/staff/operations?scope=FINANCE&reason=Inspect%20provider%20outage%20recovery";
  const report = (await get(query, fmfa.cookie).expect(200)).body;
  assert.ok(
    report.alerts.some(
      (a: any) => a.code === "PAYMENT_REPEATED_ERRORS" && a.status === "OPEN",
    ),
  );
  assert.ok(
    report.jobs.some(
      (j: any) =>
        j.kind === "PAYMENT_EVENT" &&
        j.id === eventId &&
        j.recovery === "REPLAY",
    ),
  );
  const command = {
    request_key: randomUUID(),
    kind: "PAYMENT_EVENT",
    id: eventId,
    reason: "Provider connectivity restored; retry original verified inbox",
  };
  await post("/v1/staff/operations/replays", command, smfa.cookie).expect(403);
  await post("/v1/staff/operations/replays", command, finance.cookie).expect(
    403,
  );
  gateway.unavailable = false;
  const first = (
    await post("/v1/staff/operations/replays", command, fmfa.cookie).expect(200)
  ).body;
  assert.ok(first.correlation_id);
  await events.tick();
  const second = (
    await post("/v1/staff/operations/replays", command, fmfa.cookie).expect(200)
  ).body;
  assert.equal(second.correlation_id, first.correlation_id);
  await events.tick();
  const detail = (
    await get("/v1/me/purchases/" + cycle.id, s.owner.cookie).expect(200)
  ).body.purchase;
  assert.equal(detail.status, "CAPTURED");
  assert.equal(detail.journal.length, 1);
  assert.equal(Number(detail.journal[0].amount_paise), 59900);
  await post(
    "/v1/staff/operations/replays",
    { ...command, id: "evt_other" },
    fmfa.cookie,
  ).expect(409);
});

test("webhook, backup and security observations require scoped evidence and stale health never stays green", async () => {
  const operator = await fixture(["SUPPORT", "FINANCE"]),
    mfa = await enroll(operator.cookie),
    outsider = await fixture(null);
  const monitor = new OperationsMonitor(database, config, now),
    path = "/v1/staff/operations/observations";
  const evidence = {
    request_key: randomUUID(),
    kind: "WEBHOOK_DELIVERY",
    healthy: false,
    observed_at: clock.toISOString(),
    evidence_reference: "FICTIONAL-PROVIDER-DELIVERY-DISABLED",
    reason: "Provider dashboard confirms webhook delivery is disabled",
  };
  await post(path, evidence, outsider.cookie).expect(403);
  const first = (await post(path, evidence, mfa.cookie).expect(200)).body;
  assert.ok(first.correlation_id);
  assert.equal(
    (await post(path, evidence, mfa.cookie).expect(200)).body.correlation_id,
    first.correlation_id,
  );
  await monitor.scan();
  let report = (
    await get(
      "/v1/staff/operations?scope=FINANCE&reason=Inspect%20webhook%20delivery%20health",
      mfa.cookie,
    ).expect(200)
  ).body;
  assert.ok(
    report.alerts.some(
      (a: any) => a.code === "WEBHOOK_UNHEALTHY" && a.status === "OPEN",
    ),
  );
  clock = new Date(clock.getTime() + 1000);
  await post(
    path,
    {
      ...evidence,
      request_key: randomUUID(),
      healthy: true,
      observed_at: clock.toISOString(),
      reason: "Confirmed provider delivery restored using dashboard evidence",
    },
    mfa.cookie,
  ).expect(200);
  await monitor.scan();
  report = (
    await get(
      "/v1/staff/operations?scope=FINANCE&reason=Inspect%20webhook%20delivery%20health",
      mfa.cookie,
    ).expect(200)
  ).body;
  assert.ok(
    !report.alerts.some(
      (a: any) => a.code === "WEBHOOK_UNHEALTHY" && a.status === "OPEN",
    ),
  );
  await post(
    path,
    {
      ...evidence,
      request_key: randomUUID(),
      kind: "BACKUP",
      evidence_reference: "FICTIONAL-BACKUP-FAILED",
    },
    mfa.cookie,
  ).expect(200);
  await post(
    path,
    {
      ...evidence,
      request_key: randomUUID(),
      kind: "SECURITY",
      evidence_reference: "FICTIONAL-SECURITY-INCIDENT",
    },
    mfa.cookie,
  ).expect(200);
  await monitor.scan();
  report = (
    await get(
      "/v1/staff/operations?scope=SUPPORT&reason=Inspect%20security%20backup%20conditions",
      mfa.cookie,
    ).expect(200)
  ).body;
  assert.ok(
    report.alerts.some(
      (a: any) => a.code === "BACKUP_UNHEALTHY" && a.status === "OPEN",
    ),
  );
  assert.ok(
    report.alerts.some(
      (a: any) => a.code === "SECURITY_OBSERVATION" && a.status === "OPEN",
    ),
  );
  clock = new Date(clock.getTime() + 16 * 60000);
  await monitor.scan();
  report = (
    await get(
      "/v1/staff/operations?scope=FINANCE&reason=Inspect%20stale%20webhook%20evidence",
      mfa.cookie,
    ).expect(200)
  ).body;
  assert.ok(
    report.alerts.some(
      (a: any) => a.code === "WEBHOOK_UNHEALTHY" && a.status === "OPEN",
    ),
  );
  assert.ok(
    report.observations.some(
      (o: any) => o.kind === "WEBHOOK_DELIVERY" && o.stale,
    ),
  );
});

test("notification dead letters recover from an external outage without a duplicate logical notice or leaked provider error", async () => {
  const operator = await fixture(["SUPPORT"]),
    mfa = await enroll(operator.cookie);
  config.operations = { ownerId: operator.id };
  const monitor = new OperationsMonitor(database, config, now);
  for (let i = 0; i < 3; i++)
    await monitor.workerResult("notifications", false);
  await monitor.scan();
  const service = app.get(NotificationsService),
    own = async () =>
      (await get("/v1/me/notifications", operator.cookie).expect(200)).body
        .notifications;
  const target = (await own()).find(
    (n: any) => n.template === "OPERATOR_SYSTEM_EMAIL",
  );
  assert.ok(target);
  notificationOutage = true;
  for (let i = 0; i < 200; i++) {
    if ((await own()).find((n: any) => n.id === target.id)?.status === "FAILED")
      break;
    await service.tick();
    clock = new Date(clock.getTime() + 60000);
  }
  assert.equal(
    (await own()).find((n: any) => n.id === target.id).status,
    "FAILED",
  );
  notificationOutage = false;
  const fresh = await post(
      "/v1/staff/sessions",
      { password, code: totp(mfa.secret, clock) },
      operator.cookie,
    ).expect(200),
    cookie = combine(operator.cookie, fresh.headers["set-cookie"][0]);
  const query =
    "/v1/staff/operations?scope=SUPPORT&reason=Recover%20original%20failed%20notification";
  const report = (await get(query, cookie).expect(200)).body;
  assert.ok(
    !JSON.stringify(report).includes("FICTIONAL_PROVIDER_SECRET_DO_NOT_LOG"),
  );
  const command = {
    request_key: randomUUID(),
    kind: "NOTIFICATION",
    id: target.id,
    reason: "External delivery recovered; resume the original logical notice",
  };
  const first = (
    await post("/v1/staff/operations/replays", command, cookie).expect(200)
  ).body;
  for (let i = 0; i < 200; i++) {
    if ((await own()).find((n: any) => n.id === target.id)?.status === "SENT")
      break;
    await service.tick();
  }
  assert.equal(
    (await own()).find((n: any) => n.id === target.id).status,
    "SENT",
  );
  assert.equal(
    (await post("/v1/staff/operations/replays", command, cookie).expect(200))
      .body.correlation_id,
    first.correlation_id,
  );
  assert.equal(deliveredIds.filter((id) => id === target.id).length, 1);
  config.operations = undefined;
});
test("overdue captured access and an unfunded refund reserve raise separate critical conditions", async () => {
  const s = await funded();
  clock = new Date(clock.getTime() + 73 * 3600000);
  const operator = await fixture(["FINANCE"]),
    mfa = await enroll(operator.cookie),
    auth = new AuthService(database, config, now),
    staff = new StaffService(database, config, auth, now);
  const refundsWorker = new RefundsService(
    database,
    config,
    auth,
    staff,
    gateway,
    now,
  );
  for (let i = 0; i < 5; i++) await refundsWorker.tick();
  const monitor = new OperationsMonitor(database, config, now);
  await monitor.scan();
  const report = (
    await get(
      "/v1/staff/operations?scope=FINANCE&reason=Inspect%20overdue%20access%20and%20refund%20reserve",
      mfa.cookie,
    ).expect(200)
  ).body;
  assert.ok(
    report.alerts.some(
      (a: any) =>
        a.code === "CAPTURE_WITHOUT_ACTIVATION" && a.status === "OPEN",
    ),
  );
  assert.ok(
    report.alerts.some(
      (a: any) => a.code === "REFUND_FAILURES" && a.status === "OPEN",
    ),
  );
  assert.ok(
    report.jobs.some(
      (j: any) => j.kind === "REFUND" && j.status === "WAITING_RESERVE",
    ),
  );
  assert.equal(
    (await get("/v1/me/purchases/" + s.cycle.id, s.owner.cookie).expect(200))
      .body.purchase.access_active,
    false,
  );
});

test("recovery acknowledgement failure can resume the same command after its original event already completed", async () => {
  const operator = await fixture(["FINANCE"]),
    mfa = await enroll(operator.cookie),
    s = await scenario();
  const cycle = (
      await checkout(purchase(s.owner, s.listing), s.owner.cookie).expect(200)
    ).body.purchase,
    payment = captured(gateway.orders.get(cycle.checkout.order_id)),
    eventId = "evt_" + randomBytes(8).toString("hex");
  await webhook(event(payment), eventId).expect(202);
  const command = {
    request_key: randomUUID(),
    kind: "PAYMENT_EVENT",
    id: eventId,
    reason:
      "Recover original inbox operation after durable acknowledgement outage",
  };
  // Fault injection is confined to this isolated PostgreSQL cluster.
  await database.pool.query(
    `CREATE FUNCTION fictional_ops_ack_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional acknowledgement storage outage'; END $$; CREATE TRIGGER fictional_ops_ack_failure BEFORE UPDATE ON operations_replays FOR EACH ROW WHEN (NEW.status='SCHEDULED') EXECUTE FUNCTION fictional_ops_ack_failure()`,
  );
  try {
    await post("/v1/staff/operations/replays", command, mfa.cookie).expect(500);
  } finally {
    await database.pool.query(
      "DROP TRIGGER fictional_ops_ack_failure ON operations_replays; DROP FUNCTION fictional_ops_ack_failure()",
    );
  }
  const events = new PaymentEvents(database, config, gateway, now);
  await events.tick();
  const replay = (
    await post("/v1/staff/operations/replays", command, mfa.cookie).expect(200)
  ).body;
  assert.ok(replay.correlation_id);
  assert.equal(replay.scheduled, false);
  await events.tick();
  const detail = (
    await get("/v1/me/purchases/" + cycle.id, s.owner.cookie).expect(200)
  ).body.purchase;
  assert.equal(detail.journal.length, 1);
});
