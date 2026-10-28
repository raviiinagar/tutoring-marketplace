import {grantTutorProFixture} from '../../../scripts/tutor-pro-fixture.js';
import { DeliveryUnknownError } from "../src/notification-delivery.js";
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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/notifications_test`,
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
    sender,
  );
});
beforeEach(() => {
  clock = new Date(clock.getTime() + 8 * 86400000);
  gateway.loseCreate = false;
  gateway.unavailable = false;
  sender.failEmail = false;
  sender.smsUnknown = false;
  sender.emails = [];
  sender.emailAttempts = [];
  sender.sms = [];
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

class MemoryDelivery {
  readonly testOnly = true;
  readonly smsConfigured = true;
  failEmail = false;
  smsUnknown = false;
  emailAttempts: {
    id: string;
    to: string;
    subject: string;
    text: string;
    url: string;
  }[] = [];
  emails: {
    id: string;
    to: string;
    subject: string;
    text: string;
    url: string;
  }[] = [];
  sms: {
    id: string;
    reference: string;
    url: string;
    provider_reference: string;
  }[] = [];
  async sendEmail(message: {
    id: string;
    to: string;
    subject: string;
    text: string;
    url: string;
  }) {
    this.emailAttempts.push(message);
    if (this.failEmail) throw new Error("Fictional SMTP outage");
    this.emails.push(message);
    return { reference: "email-" + message.id };
  }
  async sendCriticalSms(message: {
    id: string;
    reference: string;
    url: string;
  }) {
    const reference = "SM" + randomBytes(16).toString("hex");
    this.sms.push({ ...message, provider_reference: reference });
    if (this.smsUnknown) throw new DeliveryUnknownError();
    return { reference };
  }
  async reconcileCriticalSms(
    reference: string,
    message: { id: string; reference: string; url: string },
  ) {
    if (
      !this.sms.some(
        (row) =>
          row.provider_reference === reference &&
          row.id === message.id &&
          row.reference === message.reference,
      )
    )
      throw new Error("Fictional provider identity mismatch");
    return { reference, status: "ACCEPTED" as const };
  }
}
const sender = new MemoryDelivery();
const enquiry = (s: any) => ({
  request_key: randomUUID(),
  listing_id: s.listing.id,
  listing_revision: s.listing.revision,
  learner_id: s.owner.profile.id,
  subject_id: "subject-physics",
  teaching_mode: "ONLINE",
  learning_requirements:
    "Explain mechanics and momentum using private worked examples",
  preferred_times: "Tuesday evening, IST",
});
const preferences = {
  enquiry_email: true,
  chat_email: true,
  availability_email: true,
  marketing_email: false,
  notice_version: "notification-preferences-v1",
};

test("committed enquiries enqueue minimal notifications, retries survive an outage and request replay never duplicates delivery", async () => {
  const s = await scenario();
  await grantContactFixture(database, config, s.owner.email, "ACTIVE", clock);
  const body = enquiry(s);
  const sent = (
    await post("/v1/me/contact-requests", body, s.owner.cookie).expect(200)
  ).body.request;
  await post("/v1/me/contact-requests", body, s.owner.cookie).expect(200);
  const inbox = (
    await get("/v1/me/notifications", s.teacher.cookie).expect(200)
  ).body.notifications;
  assert.equal(
    inbox.filter(
      (row: any) =>
        row.template === "REQUEST_RECEIVED" && row.target_id === sent.id,
    ).length,
    1,
  );
  assert.equal(
    inbox.find((row: any) => row.target_id === sent.id).status,
    "PENDING",
  );
  const { NotificationsService } = await import("../src/notifications.js");
  const worker = app.get(NotificationsService);
  sender.failEmail = true;
  for (let i = 0; i < 4; i++) await worker.tick();
  assert.equal(sender.emails.length, 0);
  sender.failEmail = false;
  clock = new Date(clock.getTime() + 60000);
  await Promise.all([
    worker.tick(),
    worker.tick(),
    worker.tick(),
    worker.tick(),
  ]);
  const delivered = (
    await get("/v1/me/notifications", s.teacher.cookie)
  ).body.notifications.find((row: any) => row.target_id === sent.id);
  assert.equal(delivered.status, "SENT");
  assert.equal(
    sender.emails.filter((row) => row.to === s.teacher.email).length,
    1,
  );
  const count = sender.emails.length;
  for (let i = 0; i < 3; i++) await worker.tick();
  assert.equal(sender.emails.length, count);
  const text = JSON.stringify(sender.emails);
  assert.ok(!text.includes(body.learning_requirements));
  assert.ok(!text.includes(body.preferred_times));
  assert.ok(!text.includes("FICTIONAL-TUTOR-EVIDENCE"));
  await get("/v1/me/notifications").expect(401);
});

test("optional enquiry preferences are respected while verified financial service notices cannot be disabled", async () => {
  const s = await scenario();
  await grantContactFixture(database, config, s.owner.email, "ACTIVE", clock);
  const sent = (
    await post("/v1/me/contact-requests", enquiry(s), s.owner.cookie)
  ).body.request;
  await post(
    "/v1/me/notification-preferences",
    { ...preferences, enquiry_email: false },
    s.teacher.cookie,
  ).expect(200);
  const { NotificationsService } = await import("../src/notifications.js");
  const worker = app.get(NotificationsService);
  for (let i = 0; i < 12; i++) await worker.tick();
  const notification = (
    await get("/v1/me/notifications", s.teacher.cookie)
  ).body.notifications.find((row: any) => row.target_id === sent.id);
  assert.equal(notification.status, "SUPPRESSED");
  assert.equal(notification.last_error, "PREFERENCE_DISABLED");
  assert.equal(
    sender.emails.filter((row) => row.to === s.teacher.email).length,
    0,
  );
  const paid = await funded();
  await post(
    "/v1/me/notification-preferences",
    {
      ...preferences,
      enquiry_email: false,
      chat_email: false,
      availability_email: false,
      marketing_email: false,
    },
    paid.owner.cookie,
  ).expect(200);
  await post(
    "/v1/me/notification-preferences",
    { ...preferences, service_email: false },
    paid.owner.cookie,
  ).expect(400);
  for (let i = 0; i < 15; i++) await worker.tick();
  const records = (await get("/v1/me/notifications", paid.owner.cookie)).body
    .notifications;
  const captured = records.find(
    (row: any) =>
      row.template === "PAYMENT_CAPTURED" && row.target_id === paid.cycle.id,
  );
  assert.ok(captured);
  assert.equal(captured.status, "SENT");
  assert.equal(captured.mandatory, true);
});

async function connected() {
  const s = await scenario();
  await grantContactFixture(database, config, s.owner.email, "ACTIVE", clock);
  const sent = (
    await post("/v1/me/contact-requests", enquiry(s), s.owner.cookie)
  ).body.request;
  const connection = (
    await post(
      "/v1/me/tutor-requests/" + sent.id + "/decisions",
      { decision: "ACCEPT" },
      s.teacher.cookie,
    ).expect(200)
  ).body.connection_id;
  return { ...s, connection };
}
test("chat notices contain no message text and current read positions and blocks suppress queued delivery", async () => {
  const s = await connected();
  const { NotificationsService } = await import("../src/notifications.js");
  const worker = app.get(NotificationsService);
  const text =
    "A private learning conversation with personal context that must stay inside chat";
  const send = () =>
    post(
      "/v1/me/connections/" + s.connection + "/messages",
      { client_message_id: randomUUID(), text },
      s.owner.cookie,
    ).expect(201);
  await send();
  for (let i = 0; i < 15; i++) await worker.tick();
  let notices = (
    await get("/v1/me/notifications", s.teacher.cookie)
  ).body.notifications.filter(
    (row: any) =>
      row.template === "CHAT_MESSAGE" && row.target_id === s.connection,
  );
  assert.equal(notices.length, 1);
  assert.equal(notices[0].status, "SENT");
  assert.ok(!JSON.stringify(sender.emails).includes(text));
  await send();
  await post(
    "/v1/me/connections/" + s.connection + "/read-position",
    { sequence: 2 },
    s.teacher.cookie,
  ).expect(200);
  for (let i = 0; i < 8; i++) await worker.tick();
  notices = (
    await get("/v1/me/notifications", s.teacher.cookie)
  ).body.notifications.filter(
    (row: any) =>
      row.template === "CHAT_MESSAGE" && row.target_id === s.connection,
  );
  assert.ok(
    notices.some((row: any) => row.last_error === "MESSAGE_ALREADY_READ"),
  );
  await send();
  await post(
    "/v1/me/connections/" + s.connection + "/safety/block",
    { blocked: true },
    s.teacher.cookie,
  ).expect(200);
  for (let i = 0; i < 8; i++) await worker.tick();
  notices = (
    await get("/v1/me/notifications", s.teacher.cookie)
  ).body.notifications.filter(
    (row: any) =>
      row.template === "CHAT_MESSAGE" && row.target_id === s.connection,
  );
  assert.ok(
    notices.some((row: any) => row.last_error === "INTERACTION_UNAVAILABLE"),
  );
  assert.equal(
    sender.emails.filter(
      (row) =>
        row.to === s.teacher.email &&
        row.subject.includes("new private message"),
    ).length,
    1,
  );
});

test("availability delivery requires verified consent and unsubscribe cancels queued retries without affecting another subscriber", async () => {
  const selection = {
    domain_id: "school",
    subject_id: "subject-chemistry",
    level_id: "level-class-10",
    curriculum_id: "curriculum-cbse",
    language_id: "language-english",
  };
  async function subscribe() {
    const email = randomUUID() + "@example.test";
    await post("/v1/availability/subscriptions", {
      email,
      selection,
      consent: true,
      adult_confirmed: true,
      consent_version: "availability-v1",
    }).expect(202);
    const mails = (
      await database.pool.query(
        "SELECT encrypted_payload FROM mail_outbox WHERE availability_subscription_id IS NOT NULL ORDER BY created_at DESC",
      )
    ).rows.map((row) => decrypt<any>(row.encrypted_payload, config.authSecret));
    const mail = mails.find((row) => row.to === email)!;
    await post("/v1/availability/confirmations", {
      token: new URL(mail.availability_verification_url).hash.slice(7),
    }).expect(200);
    return {
      email,
      unsubscribe: new URL(mail.availability_unsubscribe_url).hash.slice(7),
    };
  }
  const a = await subscribe();
  const b = await subscribe();
  const teacher = await tutor(true, ["subject-chemistry"]);
  await publishOffer(teacher, {
    ...offer,
    subject_id: "subject-chemistry",
    title: "Chemistry explained through worked examples",
  });
  const { AvailabilityService } = await import("../src/availability.js");
  await app.get(AvailabilityService).tick();
  await app.get(AvailabilityService).tick();
  const { NotificationsService } = await import("../src/notifications.js");
  const worker = app.get(NotificationsService);
  sender.failEmail = true;
  for (let i = 0; i < 15; i++) await worker.tick();
  assert.ok(sender.emailAttempts.some((row) => row.to === a.email));
  assert.ok(sender.emailAttempts.some((row) => row.to === b.email));
  await post("/v1/availability/unsubscriptions", {
    token: a.unsubscribe,
  }).expect(200);
  sender.failEmail = false;
  clock = new Date(clock.getTime() + 60000);
  for (let i = 0; i < 20; i++) await worker.tick();
  assert.equal(sender.emails.filter((row) => row.to === a.email).length, 0);
  const delivered = sender.emails.filter((row) => row.to === b.email);
  assert.equal(delivered.length, 1);
  assert.ok(delivered[0].text.includes("/availability/unsubscribe#token="));
  for (let i = 0; i < 5; i++) await worker.tick();
  assert.equal(sender.emails.filter((row) => row.to === b.email).length, 1);
});

test("Support MFA sees failures without message content, and an uncertain critical SMS is reconciled without blind resend", async () => {
  const s = await funded();
  await cancellations(s.cycle.id, s.owner.cookie);
  const { RefundsService } = await import("../src/refunds.js");
  for (let i = 0; i < 12; i++) await app.get(RefundsService).tick();
  const operation = (await refunds(s.cycle.id, s.owner.cookie)).body.refunds[0];
  const support = await fixture(["SUPPORT"]);
  const mfa = await enroll(support.cookie);
  const path =
    "/v1/staff/notifications?reason=Inspect%20critical%20refund%20delivery%20status";
  await get(path, s.owner.cookie).expect(403);
  await get(path, support.cookie).expect(403);
  sender.smsUnknown = true;
  const { NotificationsService } = await import("../src/notifications.js");
  const worker = app.get(NotificationsService);
  for (let i = 0; i < 25; i++) await worker.tick();
  let queue = (await get(path, mfa.cookie).expect(200)).body;
  let alert = queue.notifications.find(
    (row: any) => row.channel === "SMS" && row.target_id === operation.id,
  );
  assert.ok(alert);
  assert.equal(alert.status, "UNKNOWN");
  const count = sender.sms.length;
  for (let i = 0; i < 4; i++) await worker.tick();
  assert.equal(sender.sms.length, count);
  await post(
    "/v1/staff/notifications/" + alert.id + "/retries",
    { reason: "Check unknown provider outcome before sending again" },
    mfa.cookie,
  ).expect(409);
  const provider = sender.sms.find((row) => row.id === alert.id)!;
  await post(
    "/v1/staff/notifications/" + alert.id + "/provider-confirmations",
    {
      provider_reference: provider.provider_reference,
      reason: "Verified the original SMS reference in the provider account",
    },
    mfa.cookie,
  ).expect(200);
  queue = (await get(path, mfa.cookie)).body;
  alert = queue.notifications.find((row: any) => row.id === alert.id);
  assert.equal(alert.status, "SENT");
  assert.equal(sender.sms.length, count);
  const text = JSON.stringify(queue);
  assert.ok(!text.includes(s.owner.email));
  assert.ok(!text.includes("learning_requirements"));
  assert.ok(!text.includes(config.payments!.keySecret));
});

test("production refuses a test notification sender even when passed through dependency injection", async () => {
  const production = {
    ...config,
    mode: "production" as const,
    webOrigin: "https://marketplace.example.test",
    allowedOrigins: ["https://marketplace.example.test"],
    mailTransport: "smtp" as const,
    guardianMode: "disabled" as const,
    evidenceScanner: "disabled" as const,
  };
  await assert.rejects(
    createApplication(
      production,
      database,
      now,
      undefined,
      undefined,
      gateway,
      sender,
    ),
    /Test notification delivery is forbidden in production/,
  );
});

test("withdrawing Guardian consent suppresses queued chat notices without disclosing a child alias", async () => {
  const owner = await fixture(null);
  const teacher = await tutor();
  const listing = await publish(teacher);
  const consent = {
    accepted: true,
    notice_version: "test-notice-v1",
    consent_version: "test-consent-v1",
  };
  const applied = (
    await post(
      "/v1/me/guardian-verifications",
      {
        adult_reference: "test-adult-confirmed",
        authority_reference: "test-authority-confirmed",
        adult_confirmed: true,
        consent,
      },
      owner.cookie,
    ).expect(201)
  ).body;
  await post(
    "/v1/staff/guardian-verifications/" + applied.id + "/reviews",
    {
      decision: "APPROVE",
      identifiable_adult_reviewed: true,
      authority_reviewed: true,
      reason: "Fictional Guardian authority reviewed",
    },
    teacher.reviewer!.cookie,
  ).expect(200);
  const child = (
    await post(
      "/v1/me/learners/children",
      {
        alias: "Private child alias",
        learning_requirements: "Practice Physics concepts with examples",
        age_band: "13_15",
        consent,
      },
      owner.cookie,
    ).expect(201)
  ).body.profile;
  await grantContactFixture(database, config, owner.email, "ACTIVE", clock);
  const row = (
    await post(
      "/v1/me/contact-requests",
      enquiry({ owner: { profile: child }, listing }),
      owner.cookie,
    ).expect(200)
  ).body.request;
  const connection = (
    await post(
      "/v1/me/tutor-requests/" + row.id + "/decisions",
      { decision: "ACCEPT" },
      teacher.cookie,
    ).expect(200)
  ).body.connection_id;
  await post(
    "/v1/me/connections/" + connection + "/messages",
    {
      client_message_id: randomUUID(),
      text: "Private explanation for the Guardian to review",
    },
    teacher.cookie,
  ).expect(201);
  await post(
    "/v1/me/learners/" + child.id + "/consent-withdrawals",
    {},
    owner.cookie,
  ).expect(200);
  const { NotificationsService } = await import("../src/notifications.js");
  for (let i = 0; i < 20; i++) await app.get(NotificationsService).tick();
  const notice = (
    await get("/v1/me/notifications", owner.cookie)
  ).body.notifications.find(
    (n: any) => n.template === "CHAT_MESSAGE" && n.target_id === connection,
  );
  assert.equal(notice.status, "SUPPRESSED");
  assert.equal(notice.last_error, "INTERACTION_UNAVAILABLE");
  assert.ok(!JSON.stringify(sender.emails).includes(child.alias));
});

test("concurrent critical alert workers respect the daily owner SMS budget", async () => {
  const a = await funded();
  const b = await funded();
  await cancellations(a.cycle.id, a.owner.cookie);
  await cancellations(b.cycle.id, b.owner.cookie);
  const { RefundsService } = await import("../src/refunds.js");
  for (let i = 0; i < 12; i++) await app.get(RefundsService).tick();
  const original = config.sms;
  config.sms = {
    accountSid: "AC" + "1".repeat(32),
    authToken: "x".repeat(32),
    messagingSid: "MG" + "2".repeat(32),
    contentSid: "HX" + "3".repeat(32),
    ownerPhone: "+919876543210",
    dailyLimit: 1,
  };
  try {
    const { NotificationsService } = await import("../src/notifications.js");
    const worker = app.get(NotificationsService);
    for (let i = 0; i < 12; i++)
      await Promise.all([worker.tick(), worker.tick(), worker.tick()]);
    assert.equal(sender.sms.length, 1);
    const support = await fixture(["SUPPORT"]);
    const mfa = await enroll(support.cookie);
    const queue = (
      await get(
        "/v1/staff/notifications?reason=Inspect%20daily%20critical%20alert%20budget",
        mfa.cookie,
      ).expect(200)
    ).body;
    assert.ok(
      queue.notifications.some(
        (n: any) =>
          n.channel === "SMS" &&
          n.status === "CONFIG_REQUIRED" &&
          n.last_error === "SMS_DAILY_LIMIT",
      ),
    );
  } finally {
    config.sms = original;
  }
});
