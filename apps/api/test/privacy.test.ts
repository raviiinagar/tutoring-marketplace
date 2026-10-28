import {grantTutorProFixture} from '../../../scripts/tutor-pro-fixture.js';
import { grantContactFixture } from "../../../scripts/contact-request-fixture.js";
import sharp from "sharp";
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
const retention = {
  id: "fictional-retention-v1",
  test_only: true,
  approved_by: "Fictional test operator",
  approval_reference: "ISOLATED-TEST-ONLY",
  classes: {
    ACCOUNT: {
      days: 0,
      purpose: "Erase fictional account identifiers immediately",
    },
    PHOTO: {
      days: 0,
      purpose: "Erase fictional public portrait bytes immediately",
    },
    EVIDENCE: {
      days: 1,
      purpose: "Fictional evidence review exception for testing",
    },
    SAFETY: {
      days: 1,
      purpose: "Fictional safety appeal exception for testing",
    },
    SUPPORT: {
      days: 1,
      purpose: "Fictional support outcome exception for testing",
    },
    FINANCE: {
      days: 2,
      purpose: "Fictional financial dispute exception for testing",
    },
  },
};
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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/privacy_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    PRIVACY_RETENTION_POLICY: JSON.stringify(retention),
    PRIVACY_TOMBSTONE_DIR: join(directory, "privacy-ledger"),
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

test("verified export contains only owned data and scanned photo assets, with expiring authorized downloads", async () => {
  const owner = await fixture(null),
    stranger = await fixture(null);
  await post(
    "/v1/me/roles",
    { roles: ["LEARNER", "TUTOR"] },
    owner.cookie,
  ).expect(200);
  await post(
    "/v1/me/learners/adult",
    {
      alias: "Private own learner",
      learning_requirements: "Practice my own physics concepts",
      adult_confirmed: true,
    },
    owner.cookie,
  ).expect(201);
  await post(
    "/v1/me/tutor",
    {
      display_name: "Own fictional Tutor",
      biography: "I explain physics through examples and careful practice.",
      birth_date: "1990-01-01",
      adult_confirmed: true,
    },
    owner.cookie,
  ).expect(200);
  const bytes = await sharp({
    create: { width: 128, height: 128, channels: 3, background: "#aabbcc" },
  })
    .png()
    .toBuffer();
  const photo = (
    await post(
      "/v1/me/tutor/photo",
      {
        media_type: "image/png",
        data: Buffer.concat([
          bytes,
          Buffer.from("FICTIONAL-TUTOR-EVIDENCE"),
        ]).toString("base64"),
        public_consent: true,
      },
      owner.cookie,
    ).expect(201)
  ).body.photo;
  await post(
    "/v1/me/privacy/verifications",
    { password: "wrong-password", purpose: "EXPORT" },
    owner.cookie,
  ).expect(401);
  const verify = (
    await post(
      "/v1/me/privacy/verifications",
      { password, purpose: "EXPORT" },
      owner.cookie,
    ).expect(200)
  ).body;
  await post(
    "/v1/me/privacy/requests",
    { request_key: randomUUID(), kind: "EXPORT", verification: verify.proof },
    stranger.cookie,
  ).expect(403);
  const input = {
    request_key: randomUUID(),
    kind: "EXPORT",
    verification: verify.proof,
  };
  const job = (
    await post("/v1/me/privacy/requests", input, owner.cookie).expect(202)
  ).body.request;
  assert.equal(
    (await post("/v1/me/privacy/requests", input, owner.cookie).expect(202))
      .body.request.id,
    job.id,
  );
  const { PrivacyWorker } = await import("../src/privacy-worker.js");
  const worker = new PrivacyWorker(database, config, now);
  await worker.tick();
  const state = (await get("/v1/me/privacy", owner.cookie).expect(200)).body;
  assert.equal(
    state.requests.find((r: any) => r.id === job.id).status,
    "COMPLETED",
  );
  const proof = (
    await post(
      "/v1/me/privacy/verifications",
      { password, purpose: "DOWNLOAD" },
      owner.cookie,
    ).expect(200)
  ).body.proof;
  await post(
    "/v1/me/privacy/requests/" + job.id + "/download",
    { verification: proof },
    stranger.cookie,
  ).expect(404);
  const download = await post(
    "/v1/me/privacy/requests/" + job.id + "/download",
    { verification: proof },
    owner.cookie,
  ).expect(200);
  assert.match(download.headers["content-disposition"], /attachment/);
  const data = download.body;
  assert.equal(data.account.email, owner.email);
  assert.equal(data.learners[0].alias, "Private own learner");
  assert.equal(data.photos[0].id, photo.id);
  assert.ok(data.photos[0].asset_base64.length > 20);
  assert.ok(!JSON.stringify(data).includes(stranger.email));
  assert.ok(!JSON.stringify(data).includes("password_hash"));
  assert.ok(!JSON.stringify(data).includes("token_hash"));
  clock = new Date(clock.getTime() + 25 * 3600000);
  const fresh = (
    await post(
      "/v1/me/privacy/verifications",
      { password, purpose: "DOWNLOAD" },
      owner.cookie,
    ).expect(200)
  ).body.proof;
  await post(
    "/v1/me/privacy/requests/" + job.id + "/download",
    { verification: fresh },
    owner.cookie,
  ).expect(410);
});

test("deletion revokes activity, clears personal assets, reports retention and reapplies durable tombstones after restore", async () => {
  const owner = await fixture(null),
    stranger = await fixture(null);
  await post(
    "/v1/me/roles",
    { roles: ["LEARNER", "TUTOR"] },
    owner.cookie,
  ).expect(200);
  await post(
    "/v1/me/tutor",
    {
      display_name: "Delete fictional Tutor",
      biography: "I explain physics through examples and careful practice.",
      birth_date: "1990-01-01",
      adult_confirmed: true,
    },
    owner.cookie,
  ).expect(200);
  await post(
    "/v1/me/tutor/evidence",
    {
      media_type: "application/pdf",
      data: Buffer.from(
        "%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n",
      ).toString("base64"),
    },
    owner.cookie,
  ).expect(201);
  const identity = await post(
    "/v1/me/privacy/verifications",
    { password, purpose: "DELETE" },
    owner.cookie,
  ).expect(200);
  const receipt = identity.headers["set-cookie"][0].split(";")[0];
  const input = {
    request_key: randomUUID(),
    kind: "DELETE",
    verification: identity.body.proof,
    confirmation: "DELETE MY ACCOUNT",
  };
  const job = (
    await post("/v1/me/privacy/requests", input, owner.cookie).expect(202)
  ).body.request;
  await get("/v1/me", owner.cookie).expect(401);
  await post("/v1/auth/sessions", { email: owner.email, password }).expect(401);
  const { PrivacyWorker, reapplyPrivacyTombstones } =
    await import("../src/privacy-worker.js");
  const worker = new PrivacyWorker(database, config, now);
  await worker.tick();
  const state = (await get("/v1/me/privacy", receipt).expect(200)).body;
  const result = state.requests.find((r: any) => r.id === job.id);
  assert.equal(state.authenticated, false);
  assert.equal(result.status, "COMPLETED");
  assert.ok(result.result.retained.some((r: any) => r.class === "EVIDENCE"));
  assert.ok(!JSON.stringify(state).includes(owner.email));
  assert.ok(
    !(
      await get("/v1/me/privacy", stranger.cookie).expect(200)
    ).body.requests.some((r: any) => r.id === job.id),
  );
  const support = await fixture(["SUPPORT"]),
    sm = await enroll(support.cookie);
  await post(
    "/v1/staff/privacy/retained/" +
      result.result.retained.find((r: any) => r.class === "EVIDENCE").id +
      "/inspections",
    { reason: "Investigate fictional retained evidence" },
    sm.cookie,
  ).expect(403);
  const trust = await fixture(["TRUST"]),
    tm = await enroll(trust.cookie);
  const ref = result.result.retained.find(
    (r: any) => r.class === "EVIDENCE",
  ).id;
  const archive = (
    await post(
      "/v1/staff/privacy/retained/" + ref + "/inspections",
      { reason: "Investigate fictional retained evidence" },
      tm.cookie,
    ).expect(200)
  ).body;
  assert.ok(archive.record);
  // Fixture simulates restoring personal rows and session authority from a pre-erasure backup.
  await database.pool.query("DELETE FROM privacy_tombstones WHERE user_id=$1", [
    owner.id,
  ]);
  await database.pool.query(
    "UPDATE users SET email=$2,display_name='Restored fictional identity',status='ACTIVE',email_verified_at=now() WHERE id=$1",
    [owner.id, owner.email],
  );
  await database.pool.query(
    "UPDATE sessions SET revoked_at=NULL WHERE user_id=$1",
    [owner.id],
  );
  await get("/v1/me", owner.cookie).expect(200);
  await reapplyPrivacyTombstones(database, config, now);
  await get("/v1/me", owner.cookie).expect(401);
  const held = (
    await post(
      "/v1/staff/privacy/retained/" + ref + "/holds",
      {
        operation: "HOLD",
        reference: "Fictional legal case reference",
        reason: "Preserve fictional evidence during the legal review",
      },
      tm.cookie,
    ).expect(200)
  ).body.hold;
  clock = new Date(clock.getTime() + 2 * 86400000);
  await worker.tick();
  const relogin = await post("/v1/auth/sessions", {
    email: trust.email,
    password,
  }).expect(200);
  trust.cookie = relogin.headers["set-cookie"][0];
  // The old MFA session is expired; use a fresh one for the expiry denial.
  const mfa = await post(
    "/v1/staff/sessions",
    { password, code: totp(tm.secret, clock) },
    trust.cookie,
  ).expect(200);
  const freshMfa = combine(trust.cookie, mfa.headers["set-cookie"][0]);
  await post(
    "/v1/staff/privacy/retained/" + ref + "/inspections",
    { reason: "Inspect the held fictional evidence" },
    freshMfa,
  ).expect(200);
  await post(
    "/v1/staff/privacy/retained/" + ref + "/holds",
    {
      operation: "RELEASE",
      hold_id: held.id,
      reason: "The fictional legal review is complete",
    },
    freshMfa,
  ).expect(200);
  await worker.tick();
  await post(
    "/v1/staff/privacy/retained/" + ref + "/inspections",
    { reason: "Check expiry of fictional retained evidence" },
    freshMfa,
  ).expect(410);
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
const connectionCount = async (id: string) =>
  Number(
    (
      await database.pool.query(
        "SELECT count(*) FROM connections WHERE request_id=$1",
        [id],
      )
    ).rows[0].count,
  );

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

test("Guardian withdrawal erases the selected child context, revokes old grants and respects fresh later consent", async () => {
  const owner = await fixture(null),
    teacher = await tutor(),
    listing = await publish(teacher);
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
        alias: "Private child nickname",
        learning_requirements: "Practice Physics concepts with examples",
        age_band: "13_15",
        consent,
      },
      owner.cookie,
    ).expect(201)
  ).body.profile;
  const privacyChildren = (
    await get("/v1/me/privacy", owner.cookie).expect(200)
  ).body.child_profiles;
  assert.deepEqual(privacyChildren, [{ id: child.id, alias: child.alias }]);
  assert.deepEqual(
    (await get("/v1/me/privacy", teacher.cookie).expect(200)).body
      .child_profiles,
    [],
  );
  await grant(owner.email);
  const pending = (
    await submit(enquiry(child.id, listing), owner.cookie).expect(200)
  ).body.request;
  const connection = (
    await decide(pending.id, "ACCEPT", teacher.cookie).expect(200)
  ).body.connection_id;
  await post(
    "/v1/me/connections/" + connection + "/messages",
    {
      client_message_id: randomUUID(),
      text: "A fictional message about the child learning context.",
    },
    owner.cookie,
  ).expect(201);
  const verification = (
    await post(
      "/v1/me/privacy/verifications",
      { password, purpose: "WITHDRAW" },
      owner.cookie,
    ).expect(200)
  ).body.proof;
  const job = (
    await post(
      "/v1/me/privacy/requests",
      {
        request_key: randomUUID(),
        kind: "WITHDRAW",
        profile_id: child.id,
        verification,
      },
      owner.cookie,
    ).expect(202)
  ).body.request;
  await get(
    "/v1/me/connections/" + connection + "/contacts",
    teacher.cookie,
  ).expect(403);
  const { PrivacyWorker, reapplyPrivacyTombstones } =
    await import("../src/privacy-worker.js");
  await new PrivacyWorker(database, config, now).tick();
  const state = (await get("/v1/me/privacy", owner.cookie).expect(200)).body;
  assert.equal(
    state.requests.find((r: any) => r.id === job.id).status,
    "COMPLETED",
  );
  let learner = (
    await get("/v1/me/learners", owner.cookie).expect(200)
  ).body.profiles.find((r: any) => r.id === child.id);
  assert.equal(learner.alias, "Withdrawn learner");
  assert.equal(learner.status, "WITHDRAWN");
  const exportedProof = (
    await post(
      "/v1/me/privacy/verifications",
      { password, purpose: "EXPORT" },
      owner.cookie,
    ).expect(200)
  ).body.proof;
  const exported = (
    await post(
      "/v1/me/privacy/requests",
      {
        request_key: randomUUID(),
        kind: "EXPORT",
        verification: exportedProof,
      },
      owner.cookie,
    ).expect(202)
  ).body.request;
  await new PrivacyWorker(database, config, now).tick();
  const proof = (
    await post(
      "/v1/me/privacy/verifications",
      { password, purpose: "DOWNLOAD" },
      owner.cookie,
    ).expect(200)
  ).body.proof;
  const data = (
    await post(
      "/v1/me/privacy/requests/" + exported.id + "/download",
      { verification: proof },
      owner.cookie,
    ).expect(200)
  ).body;
  assert.ok(
    !JSON.stringify(data).includes(
      "A fictional message about the child learning context.",
    ),
  );
  // A new explicit consent may authorize new processing; it must not restore old messages/grants.
  clock = new Date(clock.getTime() + 1000);
  await post(
    "/v1/me/learners/" + child.id + "/consents",
    consent,
    owner.cookie,
  ).expect(200);
  await post(
    "/v1/me/learners/" + child.id,
    {
      alias: "Fresh fictional alias",
      learning_requirements: "Newly consented learning requirements",
    },
    owner.cookie,
  ).expect(200);
  await reapplyPrivacyTombstones(database, config, now);
  learner = (
    await get("/v1/me/learners", owner.cookie).expect(200)
  ).body.profiles.find((r: any) => r.id === child.id);
  assert.equal(learner.alias, "Fresh fictional alias");
  assert.equal(learner.usable, true);
  await get(
    "/v1/me/connections/" + connection + "/contacts",
    teacher.cookie,
  ).expect(403);
});

test("restore fails closed when the independent privacy ledger is unavailable", async () => {
  const { reapplyPrivacyTombstones } = await import("../src/privacy-worker.js");
  await assert.rejects(
    () =>
      reapplyPrivacyTombstones(
        database,
        {
          ...config,
          privacy: {
            ...config.privacy!,
            tombstoneDir: join(config.privacy!.tombstoneDir, "missing-ledger"),
          },
        },
        now,
      ),
    /PRIVACY_LEDGER_UNAVAILABLE/,
  );
});

test("approved evidence retention purges expired unreferenced uploads while current teaching evidence remains available", async () => {
  const teacher = await tutor(),
    owner = await fixture(null);
  await post("/v1/me/roles", { roles: ["TUTOR"] }, owner.cookie).expect(200);
  await post("/v1/me/tutor", profile, owner.cookie).expect(200);
  const evidence = (
    await post(
      "/v1/me/tutor/evidence",
      {
        media_type: "application/pdf",
        data: Buffer.from(
          "%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n",
        ).toString("base64"),
      },
      owner.cookie,
    ).expect(201)
  ).body.evidence;
  // A backlog of held uploads must not starve later expired evidence. Seed
  // realistic existing storage directly; exercise the public worker and owner API.
  await database.pool.query(
    "INSERT INTO tutor_evidence(id,user_id,media_type,byte_length,encrypted_payload,scan_status,test_only,created_at) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,e.user_id,e.media_type,e.byte_length,e.encrypted_payload,e.scan_status,e.test_only,e.created_at FROM (SELECT * FROM tutor_evidence WHERE user_id=$1 LIMIT 1) e CROSS JOIN generate_series(1,100) n",
    [teacher.id],
  );
  await database.pool.query(
    "INSERT INTO privacy_holds(id,user_id,class,scope,reference,reason,created_by,created_at) VALUES($1,$2,'EVIDENCE','TRUST',$3,$4,$5,$6)",
    [
      randomUUID(),
      teacher.id,
      "FICTIONAL-SOURCE-EVIDENCE-HOLD",
      "Preserve fictional source evidence for a test case",
      owner.id,
      clock,
    ],
  );
  clock = new Date(clock.getTime() + 2 * 86400000);
  const { PrivacyWorker } = await import("../src/privacy-worker.js");
  await new PrivacyWorker(database, config, now).tick();
  const own = (await get("/v1/me/tutor", owner.cookie).expect(200)).body;
  assert.ok(!own.evidence.some((e: any) => e.id === evidence.id));
  const current = (await get("/v1/me/tutor", teacher.cookie).expect(200)).body;
  assert.equal(current.evidence.length, 102);
  assert.equal(current.profile.eligible, true);
});

test("production refuses missing, fictional or unapproved retention and recovery configuration", () => {
  const base = {
    NODE_ENV: "production",
    DATABASE_URL: config.databaseUrl,
    AUTH_SECRET: config.authSecret,
    WEB_ORIGIN: "https://example.test",
    MAIL_TRANSPORT: "smtp",
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "fixture",
    SMTP_PASSWORD: "fixture",
    SMTP_FROM: "fixture@example.test",
  };
  assert.throws(() => loadConfig(base), /approved privacy retention/);
  assert.throws(
    () =>
      loadConfig({
        ...base,
        PRIVACY_RETENTION_POLICY: JSON.stringify(retention),
        PRIVACY_TOMBSTONE_DIR: config.privacy!.tombstoneDir,
        PRIVACY_POLICY_APPROVED: "true",
        PRIVACY_LEDGER_DURABILITY_CONFIRMED: "true",
      }),
    /approved live privacy/,
  );
  const live = { ...retention, test_only: false };
  assert.throws(
    () =>
      loadConfig({
        ...base,
        PRIVACY_RETENTION_POLICY: JSON.stringify(live),
        PRIVACY_TOMBSTONE_DIR: config.privacy!.tombstoneDir,
        PRIVACY_POLICY_APPROVED: "true",
      }),
    /durable tombstone/,
  );
});

test("SMTP erasure remains in external review until scoped staff confirms provider handling", async () => {
  const owner = await fixture(null),
    operator = await fixture(["SUPPORT"]),
    mfa = await enroll(operator.cookie);
  const smtpConfig: Config = {
    ...config,
    mailTransport: "smtp",
    smtp: {
      host: "smtp.example.test",
      port: 587,
      user: "fixture",
      password: "not-live",
      from: "fixture@example.test",
    },
  };
  const smtpApp = await createApplication(smtpConfig, database, now);
  try {
    const send = (path: string, body: unknown, cookie: string) =>
      request(smtpApp.getHttpServer())
        .post(path)
        .set("Origin", origin)
        .set("Cookie", cookie)
        .send(body);
    const verified = await send(
      "/v1/me/privacy/verifications",
      { password, purpose: "DELETE" },
      owner.cookie,
    ).expect(200);
    const receipt = verified.headers["set-cookie"][0];
    const created = await send(
      "/v1/me/privacy/requests",
      {
        request_key: randomUUID(),
        kind: "DELETE",
        verification: verified.body.proof,
        confirmation: "DELETE MY ACCOUNT",
      },
      owner.cookie,
    ).expect(202);
    const { PrivacyWorker } = await import("../src/privacy-worker.js");
    await new PrivacyWorker(database, smtpConfig, now).tick();
    const read = () =>
      request(smtpApp.getHttpServer())
        .get("/v1/me/privacy")
        .set("Cookie", receipt)
        .expect(200);
    let state = (await read()).body.requests.find(
      (r: any) => r.id === created.body.request.id,
    );
    assert.equal(state.status, "EXTERNAL_REVIEW");
    assert.equal(state.completed_at, null);
    await send(
      "/v1/staff/privacy/requests/" + state.id + "/external-completions",
      {
        reason: "Provider retention verified for the fictional request",
        reference: "FICTIONAL-PROVIDER-REFERENCE",
      },
      operator.cookie,
    ).expect(403);
    await send(
      "/v1/staff/privacy/requests/" + state.id + "/external-completions",
      {
        reason: "Provider retention verified for the fictional request",
        reference: "FICTIONAL-PROVIDER-REFERENCE",
      },
      mfa.cookie,
    ).expect(200);
    state = (await read()).body.requests.find(
      (r: any) => r.id === created.body.request.id,
    );
    assert.equal(state.status, "COMPLETED");
    assert.ok(state.completed_at);
  } finally {
    await smtpApp.close();
  }
});
