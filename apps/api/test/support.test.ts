import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
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
const del = (path: string, cookie: string) =>
  request(app.getHttpServer())
    .delete(path)
    .set("Origin", origin)
    .set("Cookie", cookie)
    .send({});
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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/support_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
    GUARDIAN_VERIFICATION_MODE: "test",
  });
  cluster = await startDatabase(
    config.databaseUrl,
    join(directory, "postgres"),
  );
  database = new Database(config.databaseUrl);
  await migrate(database);
  app = await createApplication(config, database, now);
});
beforeEach(() => {
  clock = new Date(clock.getTime() + 8 * 86400000);
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

test("support cases preserve ownership, scoped assignment, restricted notes and audited resolution", async () => {
  const owner = await fixture(null),
    stranger = await fixture(null),
    operator = await fixture(["SUPPORT"]);
  const body = {
    request_key: randomUUID(),
    category: "ACCOUNT",
    subject: "Help with account sessions",
    description: "Please explain how to revoke a lost device session.",
  };
  await post("/v1/me/support-cases", body).expect(401);
  const created = await post("/v1/me/support-cases", body, owner.cookie).expect(
    201,
  );
  const id = created.body.case.id;
  assert.equal(created.body.case.status, "OPEN");
  assert.equal(
    (await post("/v1/me/support-cases", body, owner.cookie).expect(201)).body
      .case.id,
    id,
  );
  await get("/v1/me/support-cases/" + id, stranger.cookie).expect(404);
  await post(
    "/v1/staff/support-cases/" + id + "/inspections",
    { reason: "Investigate account session request" },
    operator.cookie,
  ).expect(403);
  const staff = await enroll(operator.cookie);
  const reason = "Investigate account session request";
  let view = (
    await post(
      "/v1/staff/support-cases/" + id + "/inspections",
      { reason },
      staff.cookie,
    ).expect(200)
  ).body.case;
  assert.equal(view.description, body.description);
  const action = (input: unknown, cookie = staff.cookie) =>
    post("/v1/staff/support-cases/" + id + "/actions", input, cookie);
  view = (
    await action({
      revision: view.revision,
      operation: "CLAIM",
      reason,
    }).expect(200)
  ).body.case;
  view = (
    await action({
      revision: view.revision,
      operation: "NOTE",
      reason,
      message: "Restricted investigation note",
    }).expect(200)
  ).body.case;
  assert.equal(view.events.at(-1).message, "Restricted investigation note");
  let own = (await get("/v1/me/support-cases/" + id, owner.cookie).expect(200))
    .body.case;
  assert.ok(!JSON.stringify(own).includes("Restricted investigation note"));
  const other = await fixture(["SUPPORT"]),
    otherMfa = await enroll(other.cookie);
  await action(
    {
      revision: view.revision,
      operation: "RESOLVE",
      reason,
      message: "Read session controls in your account.",
    },
    otherMfa.cookie,
  ).expect(409);
  await action({
    revision: 1,
    operation: "RESOLVE",
    reason,
    message: "Read session controls in your account.",
  }).expect(409);
  view = (
    await action({
      revision: view.revision,
      operation: "RESOLVE",
      reason,
      message: "Open My account, then revoke the lost device session.",
    }).expect(200)
  ).body.case;
  own = (await get("/v1/me/support-cases/" + id, owner.cookie).expect(200)).body
    .case;
  assert.equal(own.status, "RESOLVED");
  assert.equal(own.events.at(-1).outcome, "RESOLVE");
  assert.ok(own.events.at(-1).message.includes("revoke"));
  assert.ok(view.events.at(-1).reason.includes("Investigate"));
  const finance = await fixture(["FINANCE"]),
    fm = await enroll(finance.cookie);
  await post(
    "/v1/staff/support-cases/" + id + "/inspections",
    { reason },
    fm.cookie,
  ).expect(403);
  const policy = (await get("/v1/support-policy").expect(200)).body;
  assert.equal(policy.hours, "Monday-Saturday, 10:00-18:00 IST");
  assert.equal(policy.timezone, "Asia/Kolkata");
  assert.ok(
    (await get("/v1/me/support-cases", stranger.cookie).expect(200)).body.cases
      .length === 0,
  );
});

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
const find = (query: Record<string, string | number> = {}) =>
  request(app.getHttpServer()).get("/v1/discovery").query(query);

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
const enquiry = (learnerId: string, row: { id: string; revision: number }) => ({
  request_key: randomUUID(),
  listing_id: row.id,
  listing_revision: row.revision,
  learner_id: learnerId,
  subject_id: "subject-physics",
  teaching_mode: "ONLINE",
  learning_requirements: "Explain Physics mechanics using worked examples",
  preferred_times: "Tuesday and Thursday evenings, IST",
});
const submit = (body: unknown, cookie?: string) =>
  post("/v1/me/contact-requests", body, cookie);
const grant = (email: string, state: "ACTIVE" | "MATCHING" = "ACTIVE") =>
  grantContactFixture(database, config, email, state, clock);

const decide = (id: string, decision: "ACCEPT" | "DECLINE", cookie?: string) =>
  post("/v1/me/tutor-requests/" + id + "/decisions", { decision }, cookie);
async function pending(state: "ACTIVE" | "MATCHING" = "ACTIVE") {
  const s = await scenario();
  const coverage = await grant(s.owner.email, state);
  const body = enquiry(s.owner.profile.id, s.listing);
  const row = (await submit(body, s.owner.cookie).expect(200)).body.request;
  return { ...s, coverage, body, row };
}
async function accepted() {
  const s = await pending();
  const response = (
    await decide(s.row.id, "ACCEPT", s.teacher.cookie).expect(200)
  ).body;
  return { ...s, connection: response.connection_id as string };
}
const contacts = (id: string, cookie?: string) =>
  get("/v1/me/connections/" + id + "/contacts", cookie);
const week = 7 * 86400000;
const reviewBody = {
  request_key: randomUUID(),
  rating: 2,
  text: "The explanations were rushed and my questions were not answered clearly.",
  interaction_attested: true,
  policy_version: "review-v1",
};
async function login(user: { cookie: string; email: string }) {
  const r = await post("/v1/auth/sessions", {
    email: user.email,
    password,
  }).expect(200);
  user.cookie = r.headers["set-cookie"][0];
}
async function mature(s: Awaited<ReturnType<typeof accepted>>, offset = week) {
  clock = new Date(clock.getTime() + offset);
  await login(s.owner);
  await login(s.teacher);
}
const reviewPath = (id: string) => "/v1/me/connections/" + id + "/review";

test("review and safety appeals become private Trust cases with revision-safe domain adjudication", async () => {
  const s = await accepted();
  await mature(s);
  const submitted = (
    await post(
      reviewPath(s.connection),
      { ...reviewBody, request_key: randomUUID() },
      s.owner.cookie,
    ).expect(201)
  ).body.review;
  const reviewer = await fixture(["TRUST"]),
    trust = await enroll(reviewer.cookie);
  const rejected = (
    await post(
      "/v1/staff/reviews/" + submitted.id + "/decisions",
      {
        revision: submitted.revision,
        outcome: "REJECT",
        policy_code: "IRRELEVANT",
        reason: "Check whether the review concerns this Connection",
      },
      trust.cookie,
    ).expect(200)
  ).body.review;
  await post(
    "/v1/me/reviews/" + submitted.id + "/appeals",
    {
      request_key: randomUUID(),
      revision: rejected.revision,
      description: "My review describes the interaction on this Connection.",
    },
    s.owner.cookie,
  ).expect(201);
  let row = (
    await get("/v1/me/support-cases", s.owner.cookie).expect(200)
  ).body.cases.find((c: any) => c.category === "REVIEW_APPEAL");
  assert.ok(row);
  assert.equal(row.related_id, submitted.id);
  const support = await fixture(["SUPPORT"]),
    sm = await enroll(support.cookie);
  await post(
    "/v1/staff/support-cases/" + row.id + "/inspections",
    { reason: "Investigate review appeal ownership" },
    sm.cookie,
  ).expect(403);
  await assignStaff(
    database,
    s.teacher.email,
    ["TRUST"],
    "Fictional participant scope test",
    "test fixture",
  );
  const participant = await enroll(s.teacher.cookie);
  const queue = await get(
    "/v1/staff/support-cases?scope=TRUST&reason=Inspect%20fictional%20appeal%20queue",
    participant.cookie,
  ).expect(200);
  assert.ok(!queue.body.cases.some((c: any) => c.id === row.id));
  await post(
    "/v1/staff/support-cases/" + row.id + "/inspections",
    { reason: "Inspect a participant appeal case" },
    participant.cookie,
  ).expect(403);
  const action = (id: string, input: unknown) =>
    post("/v1/staff/support-cases/" + id + "/actions", input, trust.cookie);
  const reason = "Reconsider the disputed moderation outcome";
  row = (
    await action(row.id, {
      revision: row.revision,
      operation: "CLAIM",
      reason,
    }).expect(200)
  ).body.case;
  await action(row.id, {
    revision: row.revision,
    operation: "RESOLVE",
    reason,
    message: "Generic closure cannot decide this appeal.",
  }).expect(409);
  row = (
    await action(row.id, {
      revision: row.revision,
      operation: "REOPEN_REVIEW",
      reason,
      message: "The review has been returned for a fresh policy check.",
    }).expect(200)
  ).body.case;
  assert.equal(row.status, "RESOLVED");
  const current = (
    await get(reviewPath(s.connection), s.owner.cookie).expect(200)
  ).body.review;
  assert.equal(current.status, "PENDING");
  const history = (
    await get("/v1/me/reviews", s.owner.cookie).expect(200)
  ).body.reviews.find((r: any) => r.id === submitted.id);
  assert.ok(history.decisions.some((d: any) => d.outcome === "REOPEN_REVIEW"));
  assert.equal(history.appeals[0].status, "RESOLVED");
  const rejectedAgain = (
    await post(
      "/v1/staff/reviews/" + submitted.id + "/decisions",
      {
        revision: current.revision,
        outcome: "REJECT",
        policy_code: "IRRELEVANT",
        reason: "Record another fictional moderation outcome",
      },
      trust.cookie,
    ).expect(200)
  ).body.review;
  await post(
    "/v1/me/reviews/" + submitted.id + "/appeals",
    {
      request_key: randomUUID(),
      revision: rejectedAgain.revision,
      description: "Please reconsider this updated moderation decision.",
    },
    s.owner.cookie,
  ).expect(201);
  let stale = (
    await get("/v1/me/support-cases", s.owner.cookie).expect(200)
  ).body.cases.find(
    (c: any) => c.category === "REVIEW_APPEAL" && c.status === "OPEN",
  );
  stale = (
    await action(stale.id, {
      revision: stale.revision,
      operation: "CLAIM",
      reason,
    }).expect(200)
  ).body.case;
  await post(
    "/v1/me/reviews/" + submitted.id + "/withdrawals",
    { revision: rejectedAgain.revision },
    s.owner.cookie,
  ).expect(200);
  await action(stale.id, {
    revision: stale.revision,
    operation: "REOPEN_REVIEW",
    reason,
    message: "This stale appeal must not restore withdrawn feedback.",
  }).expect(409);
  assert.equal(
    (await get("/v1/me/support-cases/" + stale.id, s.owner.cookie)).body.case
      .status,
    "IN_PROGRESS",
  );
  await action(stale.id, {
    revision: stale.revision,
    operation: "SUPERSEDED",
    reason,
    message: "The author withdrew the review, so this appeal is superseded.",
  }).expect(200);
  assert.equal(
    (await get(reviewPath(s.connection), s.owner.cookie)).body.review.status,
    "WITHDRAWN",
  );
  const report = (
    await post(
      "/v1/me/connections/" + s.connection + "/safety/reports",
      {
        request_key: randomUUID(),
        category: "HARASSMENT",
        description: "Please investigate this fictional conversation report.",
        message_sequences: [],
      },
      s.owner.cookie,
    ).expect(201)
  ).body.case;
  let safety = (
    await post(
      "/v1/staff/safety-cases/" + report.id + "/actions",
      {
        revision: report.revision,
        operation: "RESTRICT_CONNECTION",
        reason: "Restrict this fictional conversation during investigation",
      },
      trust.cookie,
    ).expect(200)
  ).body.case;
  await post(
    "/v1/me/safety-cases/" + report.id + "/appeals",
    {
      request_key: randomUUID(),
      description: "Please reconsider the restriction on this conversation.",
    },
    s.teacher.cookie,
  ).expect(201);
  row = (
    await get("/v1/me/support-cases", s.teacher.cookie).expect(200)
  ).body.cases.find((c: any) => c.category === "SAFETY_APPEAL");
  assert.ok(row);
  row = (
    await action(row.id, {
      revision: row.revision,
      operation: "CLAIM",
      reason,
    }).expect(200)
  ).body.case;
  row = (
    await action(row.id, {
      revision: row.revision,
      operation: "LIFT_CONNECTION",
      reason,
      message: "This case restriction has been lifted after appeal review.",
    }).expect(200)
  ).body.case;
  assert.equal(row.events.at(-1).outcome, "LIFT_CONNECTION");
  const notices = (await get("/v1/me/safety", s.teacher.cookie).expect(200))
    .body;
  assert.ok(
    notices.restrictions.find((r: any) => r.case_id === report.id).lifted_at,
  );
  assert.equal(notices.appeals[0].status, "RESOLVED");
  const currentSafety = (
    await post(
      "/v1/staff/safety-cases/" + report.id + "/inspections",
      { reason },
      trust.cookie,
    ).expect(200)
  ).body.case;
  await post(
    "/v1/staff/safety-cases/" + report.id + "/actions",
    {
      revision: currentSafety.revision,
      operation: "RESTRICT_ACCOUNT",
      reason: "New fictional account restriction after the earlier appeal",
    },
    trust.cookie,
  ).expect(200);
  await post(
    "/v1/me/safety-cases/" + report.id + "/appeals",
    {
      request_key: randomUUID(),
      description: "Please review the new account restriction separately.",
    },
    s.teacher.cookie,
  ).expect(201);
  const ownAppeals = (await get("/v1/me/safety", s.teacher.cookie).expect(200))
    .body.appeals;
  assert.equal(ownAppeals.length, 2);
  assert.ok(ownAppeals.some((a: any) => a.status === "RESOLVED"));
  assert.ok(ownAppeals.some((a: any) => a.status === "PENDING_REVIEW"));

  await action(row.id, {
    revision: row.revision,
    operation: "LIFT_CONNECTION",
    reason,
    message: "Repeating the decision must not change history.",
  }).expect(409);
});

test("owners can answer a waiting case without exposing restricted notes and policy hours match IST", async () => {
  const owner = await fixture(null),
    operator = await fixture(["SUPPORT"]),
    mfa = await enroll(operator.cookie);
  let row = (
    await post(
      "/v1/me/support-cases",
      {
        request_key: randomUUID(),
        category: "ACCOUNT",
        subject: "Help with sign in",
        description: "I need guidance with my current account sessions.",
      },
      owner.cookie,
    ).expect(201)
  ).body.case;
  const reason = "Investigate a fictional account support case";
  row = (
    await post(
      "/v1/staff/support-cases/" + row.id + "/actions",
      { revision: row.revision, operation: "CLAIM", reason },
      mfa.cookie,
    ).expect(200)
  ).body.case;
  row = (
    await post(
      "/v1/staff/support-cases/" + row.id + "/actions",
      {
        revision: row.revision,
        operation: "REPLY",
        reason,
        message: "Please confirm whether your lost session has been revoked.",
      },
      mfa.cookie,
    ).expect(200)
  ).body.case;
  assert.equal(row.status, "WAITING_CUSTOMER");
  const reply = "The lost device session has now been revoked successfully.";
  const path = "/v1/me/support-cases/" + row.id + "/messages";
  const stranger = await fixture(null);
  await post(
    path,
    { revision: row.revision, message: reply },
    stranger.cookie,
  ).expect(404);
  row = (
    await post(
      path,
      { revision: row.revision, message: reply },
      owner.cookie,
    ).expect(200)
  ).body.case;
  assert.equal(row.status, "IN_PROGRESS");
  assert.equal(row.events.at(-1).message, reply);
  await post(
    path,
    { revision: row.revision - 1, message: reply },
    owner.cookie,
  ).expect(409);
  clock = new Date("2026-10-17T04:29:00Z");
  assert.equal((await get("/v1/support-policy")).body.open_now, false);
  clock = new Date("2026-10-17T04:30:00Z");
  assert.equal((await get("/v1/support-policy")).body.open_now, true);
  clock = new Date("2026-10-17T12:30:00Z");
  const closed = (await get("/v1/support-policy")).body;
  assert.equal(closed.open_now, false);
  assert.equal(closed.next_opening_at, "2026-10-19T04:30:00.000Z");
  clock = new Date("2026-10-18T06:00:00Z");
  assert.equal((await get("/v1/support-policy")).body.open_now, false);
});
