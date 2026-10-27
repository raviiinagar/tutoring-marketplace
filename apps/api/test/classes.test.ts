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
import { personalExport } from "../src/privacy-inventory.js";
import { decrypt } from "../src/security.js";
import { assignStaff } from "../src/staff.js";
import { totp } from "../src/totp.js";
import { grantContactFixture } from "../../../scripts/contact-request-fixture.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let app: INestApplication;
let database: Database;
let config: Config;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let base: string;
const origin = "http://localhost:3000";
const password = "Fictional-chat-password-321!";
let clock = new Date();
const now = () => clock;
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
async function openApp() {
  app = await createApplication(config, database, now);
  await app.listen(0, "127.0.0.1");
  base = "http://127.0.0.1:" + app.getHttpServer().address().port;
}
before(async () => {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  const directory = resolve(".local/tests", randomUUID());
  config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/classes_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
    GUARDIAN_VERIFICATION_MODE: "test",
    PRIVACY_RETENTION_POLICY:
      '{"id":"fictional-classes-retention-v1","test_only":true,"approved_by":"Fictional class test harness","approval_reference":"isolated-tests-only","classes":{"ACCOUNT":{"days":1,"purpose":"Fictional class test retention."},"PHOTO":{"days":1,"purpose":"Fictional class test retention."},"EVIDENCE":{"days":1,"purpose":"Fictional class test retention."},"SAFETY":{"days":1,"purpose":"Fictional class test retention."},"SUPPORT":{"days":1,"purpose":"Fictional class test retention."},"FINANCE":{"days":1,"purpose":"Fictional class test retention."}}}',
    PRIVACY_TOMBSTONE_DIR: join(directory, "privacy-ledger"),
  });
  cluster = await startDatabase(
    config.databaseUrl,
    join(directory, "postgres"),
  );
  database = new Database(config.databaseUrl);
  await migrate(database);
  await openApp();
});
after(async () => {
  await app?.close();
  await database?.close();
  await cluster?.stop();
});
beforeEach(() => {
  clock = new Date(clock.getTime() + 2 * 3600000);
});
async function account() {
  const email = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", {
    display_name: "Fictional adult",
    email,
    password,
  }).expect(202);
  // Fixture setup reads the external mail outbox; feature assertions use public interfaces only.
  const mail = (
    await database.pool.query(
      "SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)",
      [email],
    )
  ).rows[0];
  const link = decrypt<{ verification_url: string }>(
    mail.encrypted_payload,
    config.authSecret,
  ).verification_url;
  await post("/v1/auth/verifications", {
    token: new URL(link).hash.slice(7),
  }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(
    200,
  );
  return {
    email,
    id: login.body.user.id as string,
    cookie: login.headers["set-cookie"][0] as string,
  };
}
async function staff(
  scopes: Array<"TRUST" | "SUPPORT" | "FINANCE"> = ["TRUST"],
) {
  const user = await account();
  await assignStaff(
    database,
    user.email,
    scopes,
    "Fictional chat verification fixture",
    "test operator",
  );
  const enrollment = (
    await post("/v1/staff/mfa/enrollments", { password }, user.cookie).expect(
      200,
    )
  ).body;
  const elevated = await post(
    "/v1/staff/mfa/confirmations",
    { code: totp(enrollment.secret, clock) },
    user.cookie,
  ).expect(200);
  return {
    ...user,
    cookie:
      user.cookie.split(";")[0] +
      "; " +
      (elevated.headers["set-cookie"][0] as string).split(";")[0],
  };
}
async function connection(state: "ACTIVE" | "MATCHING" = "ACTIVE") {
  const owner = await account();
  const teacher = await account();
  const reviewer = await staff();
  const learner = (
    await post(
      "/v1/me/learners/adult",
      {
        alias: "Fictional learner",
        learning_requirements: "Learn Physics using worked examples",
        adult_confirmed: true,
      },
      owner.cookie,
    ).expect(201)
  ).body.profile;
  await post("/v1/me/roles", { roles: ["TUTOR"] }, teacher.cookie).expect(200);
  await post(
    "/v1/me/tutor",
    {
      display_name: "Fictional chat Tutor",
      biography:
        "I explain school Physics through patient worked examples and practice.",
      birth_date: "1990-01-01",
      adult_confirmed: true,
    },
    teacher.cookie,
  ).expect(200);
  for (const kind of ["IDENTITY", "QUALIFICATION"]) {
    const evidence = (
      await post(
        "/v1/me/tutor/evidence",
        {
          media_type: "application/pdf",
          data: Buffer.from(
            "%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n",
          ).toString("base64"),
        },
        teacher.cookie,
      ).expect(201)
    ).body.evidence.id;
    await post(
      "/v1/me/tutor/claims",
      {
        kind,
        description: "Fictional " + kind + " evidence for chat fixture",
        evidence_id: evidence,
        ...(kind === "QUALIFICATION" ? { subject_id: "subject-physics" } : {}),
      },
      teacher.cookie,
    ).expect(201);
  }
  await post("/v1/me/tutor/submissions", {}, teacher.cookie).expect(200);
  const claims = (await get("/v1/me/tutor", teacher.cookie).expect(200)).body
    .claims;
  for (const claim of claims)
    await post(
      "/v1/staff/tutor-claims/" + claim.id + "/reviews",
      {
        outcome: "APPROVE",
        checked_item: "Fictional identity or Physics evidence checked",
        reason: "Approve fictional chat participant evidence",
        adult_identity_confirmed: true,
        expires_at: new Date(clock.getTime() + 86400000).toISOString(),
      },
      reviewer.cookie,
    ).expect(200);
  const offer = {
    title: "Physics for a private chat fixture",
    description:
      "School Physics explained through clear worked examples and structured practice.",
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
  let listing = (
    await post("/v1/me/listings", offer, teacher.cookie).expect(201)
  ).body.listing;
  listing = (
    await post(
      "/v1/me/listings/" + listing.id + "/actions/SUBMIT",
      { revision: listing.revision },
      teacher.cookie,
    ).expect(200)
  ).body.listing;
  listing = (
    await post(
      "/v1/staff/listings/" + listing.id + "/reviews",
      {
        revision: listing.revision,
        outcome: "APPROVE",
        reason: "Approve exact fictional chat teaching offer",
      },
      reviewer.cookie,
    ).expect(200)
  ).body.listing;
  await grantContactFixture(database, config, owner.email, state, clock);
  const enquiry = (
    await post(
      "/v1/me/contact-requests",
      {
        request_key: randomUUID(),
        listing_id: listing.id,
        listing_revision: listing.revision,
        learner_id: learner.id,
        subject_id: "subject-physics",
        teaching_mode: "ONLINE",
        learning_requirements: "Explain Physics mechanics with worked examples",
        preferred_times: "Tuesday evenings, IST",
      },
      owner.cookie,
    ).expect(200)
  ).body.request;
  const accepted = (
    await post(
      "/v1/me/tutor-requests/" + enquiry.id + "/decisions",
      { decision: "ACCEPT" },
      teacher.cookie,
    ).expect(200)
  ).body;
  return {
    owner,
    teacher,
    reviewer,
    learner,
    listing,
    id: accepted.connection_id as string,
  };
}
const classPath = (id: string) => "/v1/me/connections/" + id + "/classes";
const details = () => ({
  request_key: randomUUID(),
  title: "Fictional Physics class",
  meet_url: "https://meet.google.com/abc-defg-hij?authuser=0",
  starts_at: new Date(clock.getTime() + 3600000).toISOString(),
  duration_minutes: 60,
});

test("only the connected Tutor schedules private encrypted classes and retried saves deduplicate", async () => {
  const c = await connection(),
    input = details(),
    path = classPath(c.id);
  await post(path, input, c.owner.cookie).expect(403);
  await post(path, input).expect(401);
  const created = await post(path, input, c.teacher.cookie).expect(201);
  const replay = await post(path, input, c.teacher.cookie).expect(201);
  assert.equal(replay.body.class.id, created.body.class.id);
  assert.equal(replay.body.replayed, true);
  await post(
    path,
    { ...input, title: "A different class title" },
    c.teacher.cookie,
  ).expect(409);
  const student = (await get(path, c.owner.cookie).expect(200)).body;
  assert.equal(student.viewer_role, "PAYER");
  assert.equal(student.classes[0].meet_url, undefined);
  const teacher = (await get(path, c.teacher.cookie).expect(200)).body;
  assert.equal(
    teacher.classes[0].meet_url,
    "https://meet.google.com/abc-defg-hij",
  );
  const outsider = await account();
  await get(path, outsider.cookie).expect(404);
  await get(path, c.reviewer.cookie).expect(404);
  const row = (
    await database.pool.query(
      "SELECT encrypted_payload FROM class_invitations WHERE id=$1",
      [created.body.class.id],
    )
  ).rows[0];
  assert.ok(!JSON.stringify(row.encrypted_payload).includes(input.title));
  assert.ok(!JSON.stringify(row.encrypted_payload).includes("meet.google.com"));
  assert.equal(
    decrypt<any>(row.encrypted_payload, config.authSecret).meet_url,
    "https://meet.google.com/abc-defg-hij",
  );
  const audits = (
    await database.pool.query(
      "SELECT metadata FROM audit_events WHERE event_type LIKE 'CLASS_%'",
    )
  ).rows;
  assert.ok(!JSON.stringify(audits).includes("meet.google.com"));
  assert.ok(!JSON.stringify(audits).includes(input.title));
});

test("reschedule and cancellation reject stale edits and Join rechecks the authoritative time window", async () => {
  const c = await connection(),
    input = details(),
    path = classPath(c.id);
  const start = clock.getTime();
  let item = (await post(path, input, c.teacher.cookie).expect(201)).body.class;
  await post(path + "/" + item.id + "/join", {}, c.owner.cookie).expect(409);
  clock = new Date(start + 46 * 60000);
  assert.equal(
    (await post(path + "/" + item.id + "/join", {}, c.owner.cookie).expect(200))
      .body.url,
    "https://meet.google.com/abc-defg-hij",
  );
  const changes = {
    title: input.title,
    meet_url: "https://meet.google.com/xyz-abcd-efg",
    starts_at: new Date(start + 2 * 3600000).toISOString(),
    duration_minutes: 45,
    revision: 1,
  };
  await post(path + "/" + item.id, changes, c.owner.cookie).expect(403);
  item = (
    await post(path + "/" + item.id, changes, c.teacher.cookie).expect(200)
  ).body.class;
  assert.equal(item.revision, 2);
  await post(path + "/" + item.id, changes, c.teacher.cookie).expect(409);
  await post(
    path + "/" + item.id + "/cancellation",
    { revision: 1 },
    c.teacher.cookie,
  ).expect(409);
  await post(path + "/" + item.id + "/join", {}, c.owner.cookie).expect(409);
  clock = new Date(start + 106 * 60000);
  assert.equal(
    (await post(path + "/" + item.id + "/join", {}, c.owner.cookie).expect(200))
      .body.url,
    changes.meet_url,
  );
  const cancelled = (
    await post(
      path + "/" + item.id + "/cancellation",
      { revision: 2 },
      c.teacher.cookie,
    ).expect(200)
  ).body.class;
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.meet_url, undefined);
  await post(path + "/" + item.id + "/join", {}, c.owner.cookie).expect(409);
  await post(
    path + "/" + item.id,
    { ...changes, revision: 3 },
    c.teacher.cookie,
  ).expect(409);
});

test("unsafe meeting URLs, past dates, excess duration and overposting are rejected", async () => {
  const c = await connection(),
    path = classPath(c.id),
    input = details();
  for (const meet_url of [
    "javascript:alert(1)",
    "https://meet.google.com.evil.invalid/abc-defg-hij",
    "https://meet.google.com@evil.invalid/abc-defg-hij",
    "https://user:pass@meet.google.com/abc-defg-hij",
    "http://meet.google.com/abc-defg-hij",
    "https://meet.google.com/lookup/private",
  ])
    await post(path, { ...input, meet_url }, c.teacher.cookie).expect(400);
  for (const extra of [
    { starts_at: clock.toISOString() },
    { starts_at: new Date(clock.getTime() + 367 * 86400000).toISOString() },
    { duration_minutes: 241 },
    { duration_minutes: 0 },
    { recording: true },
  ])
    await post(path, { ...input, ...extra }, c.teacher.cookie).expect(400);
  assert.equal((await get(path, c.owner.cookie)).body.classes.length, 0);
});

test("a current safety block stops reads, edits and meeting link release", async () => {
  const c = await connection(),
    path = classPath(c.id),
    input = details();
  const item = (await post(path, input, c.teacher.cookie).expect(201)).body
    .class;
  await post(
    "/v1/me/connections/" + c.id + "/safety/block",
    { blocked: true },
    c.owner.cookie,
  ).expect(200);
  await get(path, c.owner.cookie).expect(403);
  await get(path, c.teacher.cookie).expect(403);
  await post(path + "/" + item.id + "/join", {}, c.teacher.cookie).expect(403);
  await post(
    path + "/" + item.id + "/cancellation",
    { revision: 1 },
    c.teacher.cookie,
  ).expect(403);
});

test("personal exports include owned invitations while account erasure removes shared meeting content", async () => {
  const c = await connection(),
    path = classPath(c.id);
  const item = (await post(path, details(), c.teacher.cookie).expect(201)).body
    .class;
  const teacher = (
    await database.pool.query("SELECT * FROM users WHERE id=$1", [c.teacher.id])
  ).rows[0];
  const learner = (
    await database.pool.query("SELECT * FROM users WHERE id=$1", [c.owner.id])
  ).rows[0];
  const exported = await database.transaction((client) =>
    personalExport(client, teacher, config, clock),
  );
  assert.equal(
    exported.own_class_invitations[0].details.meet_url,
    "https://meet.google.com/abc-defg-hij",
  );
  const received = await database.transaction((client) =>
    personalExport(client, learner, config, clock),
  );
  assert.equal(received.received_class_invitations.length, 1);
  assert.ok(
    !JSON.stringify(received.received_class_invitations).includes(
      "meet.google.com",
    ),
  );
  const proof = (
    await post(
      "/v1/me/privacy/verifications",
      { password, purpose: "DELETE" },
      c.owner.cookie,
    ).expect(200)
  ).body.proof;
  const job = (
    await post(
      "/v1/me/privacy/requests",
      {
        request_key: randomUUID(),
        kind: "DELETE",
        verification: proof,
        confirmation: "DELETE MY ACCOUNT",
      },
      c.owner.cookie,
    ).expect(202)
  ).body.request;
  const { PrivacyWorker } = await import("../src/privacy-worker.js");
  await new PrivacyWorker(database, config, now).tick();
  assert.equal(
    (
      await database.pool.query(
        "SELECT status FROM privacy_requests WHERE id=$1",
        [job.id],
      )
    ).rows[0].status,
    "COMPLETED",
  );
  const row = (
    await database.pool.query(
      "SELECT status,encrypted_payload FROM class_invitations WHERE id=$1",
      [item.id],
    )
  ).rows[0];
  assert.equal(row.status, "CANCELLED");
  assert.equal(
    decrypt<any>(row.encrypted_payload, config.authSecret).meet_url,
    null,
  );
});
