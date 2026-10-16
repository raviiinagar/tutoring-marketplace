import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { Database, migrate } from "../src/database.js";
import { decrypt, encrypt, tokenHash } from "../src/security.js";
import { assignStaff, type StaffScope } from "../src/staff.js";
import { base32, totp } from "../src/totp.js";
import { ClamAvScanner, TestEvidenceScanner } from "../src/evidence-scanner.js";
import { TutorsService, isAdult } from "../src/tutors.js";
import { grantContactFixture } from "../../../scripts/contact-request-fixture.js";
import { AuthService } from "../src/auth.js";
import { StaffService } from "../src/staff.js";
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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/reviews_test`,
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
test("only the connected adult payer may attest and submit once at the exact seven-day boundary", async () => {
  const s = await accepted();
  await get(reviewPath(s.connection)).expect(401);
  const stranger = await fixture(null);
  await get(reviewPath(s.connection), stranger.cookie).expect(404);
  await post(reviewPath(s.connection), reviewBody, s.teacher.cookie).expect(
    403,
  );
  await post(reviewPath(s.connection), reviewBody, s.owner.cookie).expect(409);
  await mature(s, week - 1);
  await post(reviewPath(s.connection), reviewBody, s.owner.cookie).expect(409);
  clock = new Date(clock.getTime() + 1);
  await post(
    reviewPath(s.connection),
    { ...reviewBody, interaction_attested: false },
    s.owner.cookie,
  ).expect(400);
  await post(
    reviewPath(s.connection),
    { ...reviewBody, rating: 6 },
    s.owner.cookie,
  ).expect(400);
  await post(
    reviewPath(s.connection),
    {
      ...reviewBody,
      text: "Contact me via private@example.test for this review",
    },
    s.owner.cookie,
  ).expect(400);
  const r = (
    await post(reviewPath(s.connection), reviewBody, s.owner.cookie).expect(201)
  ).body.review;
  assert.equal(r.status, "PENDING");
  assert.equal(r.rating, 2);
  const duplicate = await post(
    reviewPath(s.connection),
    reviewBody,
    s.owner.cookie,
  ).expect(201);
  assert.equal(duplicate.body.review.id, r.id);
  await post(
    reviewPath(s.connection),
    { ...reviewBody, request_key: randomUUID() },
    s.owner.cookie,
  ).expect(409);
  const own = (await get("/v1/me/reviews", s.owner.cookie).expect(200)).body
    .reviews;
  assert.equal(own.length, 1);
  assert.equal(
    (await get("/v1/discovery/" + s.listing.id + "/reviews").expect(200)).body
      .summary.count,
    0,
  );
});

test("Trust moderation treats negative and positive feedback equally; withdrawal and removal update every public aggregate and reject stale publication", async () => {
  const s = await accepted();
  const second = await learner();
  await grant(second.email);
  const pending = (
    await submit(enquiry(second.profile.id, s.listing), second.cookie)
  ).body.request;
  const connection = (await decide(pending.id, "ACCEPT", s.teacher.cookie)).body
    .connection_id;
  await mature(s);
  await login(second);
  const a = (
    await post(
      reviewPath(s.connection),
      { ...reviewBody, request_key: randomUUID(), rating: 1 },
      s.owner.cookie,
    ).expect(201)
  ).body.review;
  const b = (
    await post(
      reviewPath(connection),
      {
        ...reviewBody,
        request_key: randomUUID(),
        rating: 5,
        text: "The explanations were clear and the examples helped me understand the topic.",
      },
      second.cookie,
    ).expect(201)
  ).body.review;
  const support = await fixture(["SUPPORT"]);
  const supportMfa = await enroll(support.cookie);
  const trust = await fixture(["TRUST"]);
  const mfa = await enroll(trust.cookie);
  const queue =
    "/v1/staff/reviews?reason=Moderate%20connection%20feedback%20fairly";
  await get(queue, supportMfa.cookie).expect(403);
  await get(queue, trust.cookie).expect(403);
  const listed = (await get(queue, mfa.cookie).expect(200)).body.reviews;
  assert.ok(!JSON.stringify(listed).includes(reviewBody.text));
  for (const row of [a, b]) {
    await post(
      "/v1/staff/reviews/" + row.id + "/inspections",
      { reason: "Read selected feedback for policy moderation" },
      mfa.cookie,
    ).expect(200);
    await post(
      "/v1/staff/reviews/" + row.id + "/decisions",
      {
        revision: 1,
        outcome: "PUBLISH",
        policy_code: "POLICY_COMPLIANT",
        reason: "Relevant interaction feedback; no private data or abuse",
      },
      mfa.cookie,
    ).expect(200);
  }
  let page = (
    await get("/v1/discovery/" + s.listing.id + "/reviews").expect(200)
  ).body;
  assert.equal(page.summary.count, 2);
  assert.equal(page.summary.average, 3);
  assert.ok(page.reviews.some((r: any) => r.rating === 1));
  assert.ok(page.disclaimer.includes("not independently verified"));
  const publicText = JSON.stringify(page);
  for (const secret of [
    s.owner.email,
    second.email,
    s.owner.profile.id,
    s.connection,
  ])
    assert.ok(!publicText.includes(secret));
  const detail = (await get("/v1/discovery/" + s.listing.id)).body.listing;
  assert.equal(detail.review_summary.count, 2);
  const search = (await find()).body.offers.find(
    (r: any) => r.id === s.listing.id,
  );
  assert.equal(search.review_summary.average, 3);
  await post(
    "/v1/me/reviews/" + a.id + "/withdrawals",
    { revision: 2 },
    second.cookie,
  ).expect(404);
  await post(
    "/v1/me/reviews/" + a.id + "/withdrawals",
    { revision: 2 },
    s.owner.cookie,
  ).expect(200);
  page = (await get("/v1/discovery/" + s.listing.id + "/reviews")).body;
  assert.equal(page.summary.count, 1);
  assert.equal(page.summary.average, 5);
  await post(
    "/v1/staff/reviews/" + a.id + "/decisions",
    {
      revision: 2,
      outcome: "PUBLISH",
      policy_code: "POLICY_COMPLIANT",
      reason: "Stale request must not restore withdrawn feedback",
    },
    mfa.cookie,
  ).expect(409);
  await post(
    "/v1/staff/reviews/" + b.id + "/decisions",
    {
      revision: 2,
      outcome: "REMOVE",
      policy_code: "PERSONAL_DATA",
      reason: "Later policy finding requires removal of this feedback",
    },
    mfa.cookie,
  ).expect(200);
  assert.equal(
    (await get("/v1/discovery/" + s.listing.id + "/reviews")).body.summary
      .count,
    0,
  );
  await post(
    "/v1/staff/reviews/" + b.id + "/decisions",
    {
      revision: 3,
      outcome: "PUBLISH",
      policy_code: "POLICY_COMPLIANT",
      reason: "Removed feedback cannot be silently republished",
    },
    mfa.cookie,
  ).expect(409);
  const own = (await get("/v1/me/reviews", s.owner.cookie)).body.reviews.find(
    (r: any) => r.id === a.id,
  );
  assert.equal(own.status, "WITHDRAWN");
  assert.equal(own.decisions.length, 2);
});

test("moderation appeals are private, revision-linked and idempotent for the two adults only", async () => {
  const s = await accepted();
  await mature(s);
  const row = (
    await post(
      reviewPath(s.connection),
      { ...reviewBody, request_key: randomUUID() },
      s.owner.cookie,
    )
  ).body.review;
  const trust = await fixture(["TRUST"]);
  const mfa = await enroll(trust.cookie);
  await post(
    "/v1/staff/reviews/" + row.id + "/decisions",
    {
      revision: 1,
      outcome: "REJECT",
      policy_code: "IRRELEVANT",
      reason: "Feedback needs a review of its relevance to this interaction",
    },
    mfa.cookie,
  ).expect(200);
  const appeal = {
    request_key: randomUUID(),
    revision: 2,
    description:
      "Please reconsider the decision because this describes my actual interaction.",
  };
  const stranger = await fixture(null);
  await post(
    "/v1/me/reviews/" + row.id + "/appeals",
    appeal,
    stranger.cookie,
  ).expect(404);
  const a = (
    await post(
      "/v1/me/reviews/" + row.id + "/appeals",
      appeal,
      s.owner.cookie,
    ).expect(201)
  ).body.appeal;
  assert.equal(a.status, "PENDING");
  assert.equal(a.review_revision, 2);
  assert.equal(
    (
      await post(
        "/v1/me/reviews/" + row.id + "/appeals",
        appeal,
        s.owner.cookie,
      )
    ).body.appeal.id,
    a.id,
  );
  await post(
    "/v1/me/reviews/" + row.id + "/appeals",
    { ...appeal, request_key: randomUUID(), revision: 1 },
    s.owner.cookie,
  ).expect(409);
  const own = (await get("/v1/me/reviews", s.owner.cookie)).body.reviews.find(
    (r: any) => r.id === row.id,
  );
  assert.equal(own.appeals[0].id, a.id);
  assert.ok(
    !JSON.stringify(
      (await get("/v1/me/reviews", s.teacher.cookie)).body,
    ).includes(appeal.description),
  );
});

test("Guardian consent withdrawal removes public feedback immediately and cannot be bypassed by stale moderation", async () => {
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
    )
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
    )
  ).body.profile;
  await grant(owner.email);
  const pending = (await submit(enquiry(child.id, listing), owner.cookie)).body
    .request;
  const connection = (await decide(pending.id, "ACCEPT", teacher.cookie)).body
    .connection_id;
  clock = new Date(clock.getTime() + week);
  await login(owner);
  await login(teacher);
  const review = (
    await post(
      reviewPath(connection),
      { ...reviewBody, request_key: randomUUID() },
      owner.cookie,
    ).expect(201)
  ).body.review;
  const trust = await fixture(["TRUST"]);
  const mfa = await enroll(trust.cookie);
  await post(
    "/v1/staff/reviews/" + review.id + "/decisions",
    {
      revision: 1,
      outcome: "PUBLISH",
      policy_code: "POLICY_COMPLIANT",
      reason:
        "Relevant Guardian interaction feedback with no child identifiers",
    },
    mfa.cookie,
  ).expect(200);
  let page = (await get("/v1/discovery/" + listing.id + "/reviews")).body;
  assert.equal(page.summary.count, 1);
  assert.equal(page.reviews[0].reviewer, "Guardian");
  assert.ok(!JSON.stringify(page).includes(child.alias));
  await post(
    "/v1/me/learners/" + child.id + "/consent-withdrawals",
    {},
    owner.cookie,
  ).expect(200);
  page = (await get("/v1/discovery/" + listing.id + "/reviews")).body;
  assert.equal(page.summary.count, 0);
  await post(
    "/v1/staff/reviews/" + review.id + "/decisions",
    {
      revision: 1,
      outcome: "PUBLISH",
      policy_code: "POLICY_COMPLIANT",
      reason: "Consent withdrawal cannot be bypassed by stale publication",
    },
    mfa.cookie,
  ).expect(409);
  await post(
    "/v1/me/reviews/" + review.id + "/withdrawals",
    { revision: 2 },
    owner.cookie,
  ).expect(200);
});
test("peer blocks cannot suppress honest reviews; self-moderation and stale restricted publication are denied", async () => {
  const s = await accepted();
  await mature(s);
  await post(
    "/v1/me/connections/" + s.connection + "/safety/block",
    { blocked: true },
    s.teacher.cookie,
  ).expect(200);
  await contacts(s.connection, s.owner.cookie).expect(403);
  const row = (
    await post(
      reviewPath(s.connection),
      { ...reviewBody, request_key: randomUUID() },
      s.owner.cookie,
    ).expect(201)
  ).body.review;
  await assignStaff(
    database,
    s.teacher.email,
    ["TRUST"],
    "Fictional independent moderation role test",
    "test operator",
  );
  const self = await enroll(s.teacher.cookie);
  await post(
    "/v1/staff/reviews/" + row.id + "/inspections",
    { reason: "Self moderation must remain forbidden" },
    self.cookie,
  ).expect(403);
  const trust = await fixture(["TRUST"]);
  const mfa = await enroll(trust.cookie);
  await post(
    "/v1/staff/reviews/" + row.id + "/decisions",
    {
      revision: 1,
      outcome: "PUBLISH",
      policy_code: "POLICY_COMPLIANT",
      reason: "Negative feedback is relevant despite a participant block",
    },
    mfa.cookie,
  ).expect(200);
  assert.equal(
    (await get("/v1/discovery/" + s.listing.id + "/reviews")).body.summary
      .count,
    1,
  );
  await post(
    "/v1/staff/listings/" + s.listing.id + "/safety",
    {
      revision: s.listing.revision,
      action: "SUSPEND",
      reason: "Restrict this fictional offer for a current safety review",
    },
    mfa.cookie,
  ).expect(200);
  await get("/v1/discovery/" + s.listing.id + "/reviews").expect(404);
  await post(
    "/v1/staff/reviews/" + row.id + "/decisions",
    {
      revision: 1,
      outcome: "PUBLISH",
      policy_code: "POLICY_COMPLIANT",
      reason: "Stale moderation cannot bypass a current safety suspension",
    },
    mfa.cookie,
  ).expect(409);
});

test("production public reviews exclude imported fixture Connections even if a copied review flag is incorrect", async () => {
  const s = await accepted();
  await mature(s);
  const row = (
    await post(
      reviewPath(s.connection),
      { ...reviewBody, request_key: randomUUID() },
      s.owner.cookie,
    )
  ).body.review;
  const trust = await fixture(["TRUST"]);
  const mfa = await enroll(trust.cookie);
  await post(
    "/v1/staff/reviews/" + row.id + "/decisions",
    {
      revision: 1,
      outcome: "PUBLISH",
      policy_code: "POLICY_COMPLIANT",
      reason: "Publish fictional feedback for isolation verification",
    },
    mfa.cookie,
  ).expect(200);
  // Simulate copied/inconsistently labelled fixture data; verify via the public interface.
  await database.pool.query(
    "UPDATE tutor_evidence SET test_only=false WHERE user_id=$1",
    [s.teacher.id],
  );
  await database.pool.query(
    "UPDATE connection_reviews SET test_only=false WHERE id=$1",
    [row.id],
  );
  const production = await createApplication(
    {
      ...config,
      mode: "production",
      mailTransport: "smtp",
      evidenceScanner: "disabled",
      guardianMode: "disabled",
    },
    database,
    now,
  );
  try {
    const page = (
      await request(production.getHttpServer())
        .get("/v1/discovery/" + s.listing.id + "/reviews")
        .expect(200)
    ).body;
    assert.equal(page.summary.count, 0);
    assert.equal(page.reviews.length, 0);
  } finally {
    await production.close();
  }
});
