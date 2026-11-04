import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { Database, migrate } from "../src/database.js";
import { decrypt, encrypt } from "../src/security.js";
import { assignStaff } from "../src/staff.js";
import { totp } from "../src/totp.js";
import { deriveTutorLevel } from "../src/tutor-reputation.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";
let app: INestApplication,
  db: Database,
  config: Config,
  cluster: Awaited<ReturnType<typeof startDatabase>>;
const clock = new Date(),
  now = () => clock,
  origin = "http://localhost:3000",
  password = "Reputation-test-password-321!";
const post = (path: string, body: unknown, cookie?: string) => {
  const r = request(app.getHttpServer())
    .post(path)
    .set("Origin", origin)
    .send(body);
  return cookie ? r.set("Cookie", cookie) : r;
};
const get = (path: string, cookie?: string) => {
  const r = request(app.getHttpServer()).get(path);
  return cookie ? r.set("Cookie", cookie) : r;
};
before(async () => {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (
    server.address() as {
      port: number;
    }
  ).port;
  await new Promise<void>((r) => server.close(() => r()));
  const directory = resolve(".local/tests", randomUUID());
  config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/reputation_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
  });
  cluster = await startDatabase(
    config.databaseUrl,
    join(directory, "postgres"),
  );
  db = new Database(config.databaseUrl);
  await migrate(db);
  app = await createApplication(config, db, now);
});
after(async () => {
  await app?.close();
  await db?.close();
  await cluster?.stop();
});
async function account(tutor = false) {
  const email = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", {
    display_name: "Fictional recommendation tester",
    email,
    password,
  }).expect(202);
  const row = (
    await db.pool.query(
      "SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)",
      [email],
    )
  ).rows[0];
  await post("/v1/auth/verifications", {
    token: new URL(
      decrypt<{
        verification_url: string;
      }>(row.encrypted_payload, config.authSecret).verification_url,
    ).hash.slice(7),
  }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(
      200,
    ),
    cookie = login.headers["set-cookie"][0] as string;
  if (tutor)
    await post("/v1/me/roles", { roles: ["TUTOR"] }, cookie).expect(200);
  return { email, cookie, id: login.body.user.id as string };
}
async function reviewer() {
  const user = await account();
  await assignStaff(
    db,
    user.email,
    ["TRUST"],
    "Fictional staff for isolated tests",
    "test",
  );
  const enrolled = await post(
    "/v1/staff/mfa/enrollments",
    { password },
    user.cookie,
  ).expect(200);
  const confirmed = await post(
    "/v1/staff/mfa/confirmations",
    { code: totp(enrolled.body.secret, clock) },
    user.cookie,
  ).expect(200);
  return {
    ...user,
    cookie:
      user.cookie.split(";")[0] +
      "; " +
      confirmed.headers["set-cookie"][0].split(";")[0],
  };
}
async function tutor() {
  const user = await account(true);
  await post(
    "/v1/me/tutor/introduction",
    {
      display_name: "Fictional Physics teacher",
      biography:
        "Patient Physics explanations with worked examples and structured practice for learners.",
      subject_ids: ["subject-physics"],
      hourly_rate_paise: 50000,
      identity_country: "IN",
      identity_document: "GOVERNMENT_ID",
      adult_confirmed: true,
      public_email_consent: false,
    },
    user.cookie,
  ).expect(200);
  const evidence = randomUUID();
  await db.pool.query(
    "INSERT INTO tutor_evidence(id,user_id,media_type,byte_length,encrypted_payload,test_only,scan_status) VALUES($1,$2,'application/pdf',32,$3,true,'CLEAN')",
    [
      evidence,
      user.id,
      encrypt({ data: "fictional-test-evidence" }, config.authSecret),
    ],
  );
  await db.pool.query(
    "INSERT INTO tutor_claims(id,user_id,profile_revision,kind,description,evidence_id,status,adult_identity_confirmed,expires_at) VALUES($1,$2,1,'IDENTITY','Isolated fictional identity fixture',$3,'APPROVED',true,$4)",
    [
      randomUUID(),
      user.id,
      evidence,
      new Date(clock.getTime() + 200 * 86400000),
    ],
  );
  await db.pool.query(
    "UPDATE tutor_profiles SET status='APPROVED' WHERE user_id=$1",
    [user.id],
  );
  const publicId = (
    await db.pool.query(
      "SELECT public_id FROM tutor_profiles WHERE user_id=$1",
      [user.id],
    )
  ).rows[0].public_id;
  return { ...user, publicId, evidence };
}
// Explicitly fictional isolated quality fixture; no live pass or credential is awarded.
async function addQuality(user: { id: string }) {
  const description =
    "In these Physics classes we explore important concepts through clear explanations, practical examples, thoughtful questions, and structured practice. Learners can discuss difficulties, build confidence, review earlier topics, and prepare their next learning steps at a comfortable pace with patient guidance and constructive feedback.";
  assert.ok(description.split(/\s+/u).length >= 40);
  const coupon = randomUUID(),
    redemption = randomUUID(),
    code = "QUALITY_" + randomBytes(5).toString("hex").toUpperCase();
  await db.pool.query(
    "INSERT INTO access_coupons(id,code,percent_off,starts_at,expires_at,max_uses,test_only,created_at,product) VALUES($1,$2,100,$3,$4,1,true,$3,'TUTOR_PRO')",
    [coupon, code, clock, new Date(clock.getTime() + 86400000)],
  );
  await db.pool.query(
    "INSERT INTO coupon_redemptions(id,coupon_id,payer_id,request_key,payload_hash,policy_version,code,percent_off,base_paise,discount_paise,total_paise,test_only,created_at,product) VALUES($1,$2,$3,$4,'fictional-quality-fixture','tutor-pro-v1',$5,100,60000,60000,0,true,$6,'TUTOR_PRO')",
    [redemption, coupon, user.id, randomUUID(), code, clock],
  );
  await db.pool.query(
    "INSERT INTO tutor_pro_grants(id,payer_id,source,coupon_redemption_id,test_only,starts_at,ends_at,created_at) VALUES($1,$2,'COUPON',$3,true,$4,$5,$4)",
    [
      randomUUID(),
      user.id,
      redemption,
      clock,
      new Date(clock.getTime() + 30 * 86400000),
    ],
  );
  const photo = randomUUID(),
    listing = randomUUID();
  await db.pool.query(
    "INSERT INTO tutor_photos(id,user_id,status,scan_status,test_only,encrypted_payload) VALUES($1,$2,'APPROVED','CLEAN',true,$3)",
    [
      photo,
      user.id,
      encrypt({ data: "fictional-approved-portrait" }, config.authSecret),
    ],
  );
  await db.pool.query(
    "UPDATE tutor_profiles SET biography=$2 WHERE user_id=$1",
    [user.id, description],
  );
  const offer = {
    title:
      "Patient Physics classes with clear examples and guided practice for school learners",
    description,
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
  await db.pool.query(
    "INSERT INTO teaching_listings(id,user_id,payload,profile_revision,status,approved) VALUES($1,$2,$3,1,'PUBLISHED',true)",
    [listing, user.id, offer],
  );
  return { photo, listing, offer };
}
const recommendation = {
  relationship: "FORMER_STUDENT",
  text: "This teacher explains Physics patiently and helped me understand concepts through practical examples.",
  interaction_attested: true,
};
test("badge derivation never infers unsupported higher levels or awards to unpublished profiles", () => {
  assert.equal(
    deriveTutorLevel({
      public_eligible: false,
      recommendations: 99,
      quality_ready: true,
    }),
    null,
  );
  assert.equal(
    deriveTutorLevel({
      public_eligible: true,
      recommendations: 0,
      quality_ready: true,
    }),
    "NEW",
  );
  assert.equal(
    deriveTutorLevel({
      public_eligible: true,
      recommendations: 2,
      quality_ready: true,
    }),
    "EXPERIENCED",
  );
  assert.equal(
    deriveTutorLevel({
      public_eligible: true,
      recommendations: 999,
      quality_ready: true,
    }),
    "EXPERIENCED",
  );
  assert.equal(
    deriveTutorLevel({
      public_eligible: true,
      recommendations: 2,
      quality_ready: false,
    }),
    "NEW",
  );
});
test("recommendations require authenticated distinct authors, moderation, current revisions, and withdraw immediately", async () => {
  const owner = await tutor(),
    a = await account(),
    b = await account(),
    staff = await reviewer();
  const path = "/v1/tutors/" + owner.publicId + "/recommendations";
  await post(path, recommendation).expect(401);
  await post(path, recommendation, owner.cookie).expect(403);
  await post(
    path,
    {
      ...recommendation,
      text: "Call me at person@example.test for further details about this teacher.",
    },
    a.cookie,
  ).expect(400);
  const first = (await post(path, recommendation, a.cookie).expect(201)).body
    .recommendation;
  await post(path, recommendation, a.cookie).expect(409);
  const second = (await post(path, recommendation, b.cookie).expect(201)).body
    .recommendation;
  const staffAuthored = (
    await post(path, recommendation, staff.cookie).expect(201)
  ).body.recommendation;
  await post(
    "/v1/staff/tutor-recommendations/" + staffAuthored.id + "/decisions",
    {
      revision: 1,
      outcome: "PUBLISH",
      reason: "Attempting a prohibited self moderation action",
    },
    staff.cookie,
  ).expect(403);
  let progress = (
    await get("/v1/me/tutor/progression", owner.cookie).expect(200)
  ).body;
  assert.equal(progress.level, "NEW");
  assert.equal(progress.counts.recommendations, 0);
  assert.equal(progress.counts.positive_student_reviews, null);
  assert.equal(progress.counts.ratings_four_or_five, 0);
  const authored = (await get("/v1/me/recommendations", a.cookie).expect(200))
    .body.recommendations[0];
  assert.equal(authored.tutor_public_id, owner.publicId);
  assert.equal(authored.tutor_id, undefined);
  assert.equal(
    JSON.stringify(
      (
        await db.pool.query(
          "SELECT encrypted_text FROM tutor_recommendations WHERE id=$1",
          [first.id],
        )
      ).rows[0],
    ).includes("Physics"),
    false,
  );
  await get(
    "/v1/staff/tutor-recommendations?reason=Review%20submitted%20recommendations",
    owner.cookie,
  ).expect(403);
  const queue = (
    await get(
      "/v1/staff/tutor-recommendations?reason=Review%20submitted%20recommendations",
      staff.cookie,
    ).expect(200)
  ).body;
  assert.ok(
    queue.recommendations.some(
      (r: { id: string; text: string }) =>
        r.id === first.id && r.text === recommendation.text,
    ),
  );
  for (const row of [first, second])
    await post(
      "/v1/staff/tutor-recommendations/" + row.id + "/decisions",
      {
        revision: 1,
        outcome: "PUBLISH",
        reason: "Relevant network endorsement and privacy checked",
      },
      staff.cookie,
    ).expect(200);
  await post(
    "/v1/staff/tutor-recommendations/" + first.id + "/decisions",
    {
      revision: 1,
      outcome: "REJECT",
      reason: "Concurrent stale review must not overwrite current decision",
    },
    staff.cookie,
  ).expect(409);
  progress = (await get("/v1/me/tutor/progression", owner.cookie).expect(200))
    .body;
  assert.equal(progress.counts.recommendations, 2);
  assert.equal(progress.level, "NEW");
  assert.equal(progress.public_eligible, true);
  assert.equal(progress.criteria.profile.status, "NOT_MET");
  assert.equal(progress.criteria.photo.status, "NOT_MET");
  assert.equal(
    (
      await get("/v1/tutor-profiles/" + owner.publicId + "/progression").expect(
        200,
      )
    ).body.badge,
    "NEW",
  );
  const quality = await addQuality(owner);
  progress = (await get("/v1/me/tutor/progression", owner.cookie).expect(200))
    .body;
  assert.equal(progress.criteria.profile.status, "MET");
  assert.equal(progress.criteria.photo.status, "MET");
  assert.equal(progress.level, "EXPERIENCED");
  await db.pool.query(
    "UPDATE teaching_listings SET status='PAUSED' WHERE id=$1",
    [quality.listing],
  );
  assert.equal(
    (await get("/v1/me/tutor/progression", owner.cookie).expect(200)).body
      .level,
    "EXPERIENCED",
  );
  assert.equal(
    (await get("/v1/tutor-profiles/" + owner.publicId).expect(200)).body.profile
      .id,
    owner.publicId,
  );
  await db.pool.query(
    "UPDATE teaching_listings SET status='PUBLISHED' WHERE id=$1",
    [quality.listing],
  );
  assert.equal(
    (await get("/v1/me/tutor/progression", owner.cookie).expect(200)).body
      .level,
    "EXPERIENCED",
  );
  const beforeProExpiry = clock.getTime();
  clock.setTime(clock.getTime() + 31 * 86400000);
  assert.equal(
    (
      await get("/v1/tutor-profiles/" + owner.publicId + "/progression").expect(
        200,
      )
    ).body.badge,
    "EXPERIENCED",
  );
  clock.setTime(beforeProExpiry);
  await db.pool.query(
    "UPDATE teaching_listings SET payload=jsonb_set(payload,'{title}',to_jsonb($2::text)) WHERE id=$1",
    [quality.listing, "Short title"],
  );
  assert.equal(
    (await get("/v1/me/tutor/progression", owner.cookie).expect(200)).body
      .level,
    "NEW",
  );
  await db.pool.query(
    "UPDATE teaching_listings SET payload=jsonb_set(payload,'{title}',to_jsonb($2::text)) WHERE id=$1",
    [quality.listing, quality.offer.title],
  );
  assert.equal(
    (await get("/v1/me/tutor/progression", owner.cookie).expect(200)).body
      .level,
    "EXPERIENCED",
  );
  assert.equal(progress.counts.recommendations, 2);
  assert.equal(
    progress.levels.find((l: { id: string }) => l.id === "AMBASSADOR").awarded,
    false,
  );
  assert.equal(progress.criteria.interview.status, "UNVERIFIED");
  const publicBadge = (
    await get("/v1/tutor-profiles/" + owner.publicId + "/progression").expect(
      200,
    )
  ).body;
  assert.equal(publicBadge.badge, "EXPERIENCED");
  assert.equal(publicBadge.published_recommendations.length, 2);
  assert.equal(
    publicBadge.published_recommendations[0].text,
    recommendation.text,
  );
  assert.deepEqual(
    Object.keys(publicBadge.published_recommendations[0]).sort(),
    ["author_display_name", "id", "relationship", "text"],
  );
  await request(app.getHttpServer())
    .delete("/v1/me/recommendations/" + first.id)
    .set("Origin", origin)
    .set("Cookie", b.cookie)
    .send({})
    .expect(404);
  const concurrent = await Promise.all([
    request(app.getHttpServer())
      .delete("/v1/me/recommendations/" + first.id)
      .set("Origin", origin)
      .set("Cookie", a.cookie)
      .send({}),
    post(
      "/v1/staff/tutor-recommendations/" + first.id + "/decisions",
      {
        revision: 2,
        outcome: "PUBLISH",
        reason: "Concurrent moderation must respect author withdrawal",
      },
      staff.cookie,
    ),
  ]);
  assert.equal(concurrent[0].status, 204);
  assert.ok([200, 409].includes(concurrent[1].status));
  assert.equal(
    (await get("/v1/me/tutor/progression", owner.cookie).expect(200)).body
      .level,
    "NEW",
  );
  assert.equal(
    (
      await get("/v1/tutor-profiles/" + owner.publicId + "/progression").expect(
        200,
      )
    ).body.published_recommendations.length,
    1,
  );
  await db.pool.query(
    "UPDATE tutor_profiles SET status='REVOKED' WHERE user_id=$1",
    [owner.id],
  );
  assert.equal(
    (await get("/v1/me/tutor/progression", owner.cookie).expect(200)).body
      .level,
    null,
  );
  await get("/v1/tutor-profiles/" + owner.publicId + "/progression").expect(
    404,
  );
});
test("diploma progress requires owned clean evidence and never awards an upper badge", async () => {
  const owner = await tutor(),
    other = await tutor();
  await post(
    "/v1/me/tutor/progression/diploma",
    { evidence_id: other.evidence },
    owner.cookie,
  ).expect(409);
  const result = (
    await post(
      "/v1/me/tutor/progression/diploma",
      { evidence_id: owner.evidence },
      owner.cookie,
    ).expect(200)
  ).body;
  assert.equal(result.criteria.diploma.status, "MET");
  assert.equal(result.level, "NEW");
  assert.equal(
    result.levels.find((l: { id: string }) => l.id === "SUPER_TEACHER").awarded,
    false,
  );
  await db.pool.query(
    "UPDATE tutor_evidence SET scan_status='WITHDRAWN',encrypted_payload=NULL WHERE id=$1",
    [owner.evidence],
  );
  const updated = (
    await get("/v1/me/tutor/progression", owner.cookie).expect(200)
  ).body;
  assert.equal(updated.criteria.diploma.status, "NOT_MET");
  assert.equal(updated.level, null);
});
