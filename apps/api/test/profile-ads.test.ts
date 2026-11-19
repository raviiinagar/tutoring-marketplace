import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import request from "supertest";
import sharp from "sharp";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { Database, migrate } from "../src/database.js";
import { decrypt } from "../src/security.js";
import { assignStaff } from "../src/staff.js";
import { ListingsService } from "../src/listings.js";
import { applyProfileAds, planProfileAds } from "../src/profile-ads.js";
import { fixtureBiography } from "./helpers/publication.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let app: INestApplication;
let database: Database;
let config: Config;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let clock = new Date();
const now = () => clock;
const origin = "http://localhost:3000";
const password = "Profile-ads-password-321!";
const server = () => app.getHttpServer();
const post = (path: string, body: unknown, cookie?: string) => {
  const call = request(server()).post(path).set("Origin", origin).send(body as object);
  return cookie ? call.set("Cookie", cookie) : call;
};
const get = (path: string, cookie?: string) => {
  const call = request(server()).get(path);
  return cookie ? call.set("Cookie", cookie) : call;
};

before(async () => {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done, fail) => probe.close((error) => (error ? fail(error) : done())));
  const directory = resolve(".local/tests", randomUUID());
  config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/profile_ads_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
    PHOTO_REVIEW_REQUIRED: "false",
    DIRECTORY_REQUIRES_AD: "true",
  });
  cluster = await startDatabase(config.databaseUrl, join(directory, "postgres"));
  database = new Database(config.databaseUrl);
  await migrate(database);
  app = await createApplication(config, database, now);
});
beforeEach(() => {
  clock = new Date(clock.getTime() + 2 * 86400000);
});
after(async () => {
  await app?.close();
  await database?.close();
  await cluster?.stop();
});

async function account(name: string) {
  const email = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", { display_name: name, email, password }).expect(202);
  const row = (await database.pool.query("SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)", [email])).rows[0];
  const url = decrypt<{ verification_url: string }>(row.encrypted_payload, config.authSecret).verification_url;
  await post("/v1/auth/verifications", { token: new URL(url).hash.slice(7) }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(200);
  return { email, id: login.body.user.id as string, cookie: login.headers["set-cookie"][0] as string };
}
async function portrait() {
  const bytes = await sharp({ create: { width: 160, height: 200, channels: 3, background: "#88aadd" } }).png().toBuffer();
  return { media_type: "image/png", data: Buffer.concat([bytes, Buffer.from("FICTIONAL-TUTOR-EVIDENCE")]).toString("base64"), public_consent: true };
}
/** A Tutor who published a profile before ADR0021 and never had an ad. */
async function profileWithoutAd(name: string, subject: string, withPhoto = true) {
  const tutor = await account(name);
  const intro = (
    await post(
      "/v1/me/tutor/introduction",
      {
        display_name: name,
        biography: fixtureBiography,
        subject_ids: [subject],
        hourly_rate_paise: 200000,
        identity_country: "IN",
        identity_document: "AADHAAR",
        adult_confirmed: true,
        public_email_consent: false,
      },
      tutor.cookie,
    ).expect(200)
  ).body.profile;
  if (withPhoto) await post("/v1/me/tutor/photo", await portrait(), tutor.cookie).expect(201);
  await post("/v1/me/tutor/publication", { expected_public_revision: intro.public_revision, action: "PUBLISH" }, tutor.cookie).expect(200);
  return { ...tutor, publicId: intro.public_id as string };
}

test("the plan lists published profiles without an ad and proposes their first ad, read-only", async () => {
  const tutor = await profileWithoutAd("Fictional Maths Tutor", "subject-mathematics");
  const before = (await database.pool.query("SELECT count(*)::int AS n FROM teaching_listings")).rows[0].n;
  const plan = await planProfileAds(database);
  const found = plan.candidates.find((c) => c.public_id === tutor.publicId)!;
  assert.ok(found, "the profile without an ad is a candidate");
  assert.equal(found.proposed.subject_id, "subject-mathematics");
  assert.equal(found.proposed.rate_paise, 200000);
  assert.equal(found.proposed.rate_unit, "HOUR");
  assert.deepEqual(found.proposed.language_ids, ["language-hindi", "language-english"]);
  assert.equal(found.proposed.description, fixtureBiography);
  assert.ok(String(found.proposed.title).split(/\s+/).length >= 12);
  assert.ok(found.missing.includes("level_id"), "the owner must supply the level");
  assert.ok(plan.template.some((t) => t.public_id === tutor.publicId && t.level_id === ""));
  // Planning writes nothing.
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM teaching_listings")).rows[0].n, before);
});

test("apply publishes each first ad as the Tutor, audited under the operator, and is safe to re-run", async () => {
  const operator = await account("Fictional operator");
  await assignStaff(database, operator.email, ["SUPPORT"], "Fixture operator", "test operator");
  const maths = await profileWithoutAd("Fictional Algebra Tutor", "subject-mathematics");
  const noPhoto = await profileWithoutAd("Fictional Photoless Tutor", "subject-physics", false);
  await get("/v1/tutor-profiles/" + maths.publicId).expect(404);
  const listings = app.get(ListingsService);
  const reason = "Owner confirmed these Tutors consented to the team publishing their first ad";
  await assert.rejects(applyProfileAds(database, listings, [], "nobody@example.test", reason), /enabled staff account/);

  const results = await applyProfileAds(
    database,
    listings,
    [
      { public_id: maths.publicId, domain_id: "school", level_id: "level-class-10", curriculum_id: "curriculum-cbse" },
      { public_id: noPhoto.publicId, domain_id: "school", level_id: "level-class-10", curriculum_id: "curriculum-cbse" },
      { public_id: randomUUID(), level_id: "level-class-10" },
    ],
    operator.email,
    reason,
  );
  const byId = Object.fromEntries(results.map((r) => [r.public_id, r]));
  assert.equal(byId[maths.publicId]!.outcome, "PUBLISHED");
  // The normal ad rules still apply: no photo, no publication, and nothing is left behind.
  assert.equal(byId[noPhoto.publicId]!.outcome, "FAILED");
  assert.equal(
    (await database.pool.query("SELECT count(*)::int AS n FROM teaching_listings WHERE user_id=$1 AND archived_at IS NULL", [noPhoto.id])).rows[0].n,
    0,
  );
  assert.equal(results.find((r) => r.public_id !== maths.publicId && r.public_id !== noPhoto.publicId)!.outcome, "SKIPPED");

  // The Tutor is now listed and has a public page, and owns the ad like any other.
  const ad = (await get("/v1/me/listings", maths.cookie).expect(200)).body.listings[0];
  assert.equal(ad.status, "PUBLISHED");
  assert.equal(ad.offer.level_id, "level-class-10");
  assert.deepEqual(ad.offer.language_ids, ["language-hindi", "language-english"]);
  await get("/v1/tutor-profiles/" + maths.publicId).expect(200);
  assert.ok((await get("/v1/tutor-profiles").expect(200)).body.profiles.some((p: { id: string }) => p.id === maths.publicId));
  const audit = (
    await database.pool.query("SELECT metadata FROM audit_events WHERE user_id=$1 AND event_type='TUTOR_FIRST_AD_BY_OPERATOR'", [operator.id])
  ).rows.map((r) => r.metadata);
  assert.ok(audit.some((m) => m.tutor === maths.id && m.reason === reason));

  // Re-running does not create a second ad.
  const again = await applyProfileAds(
    database,
    listings,
    [{ public_id: maths.publicId, domain_id: "school", level_id: "level-class-10", curriculum_id: "curriculum-cbse" }],
    operator.email,
    reason,
  );
  assert.equal(again[0]!.outcome, "SKIPPED");
  assert.equal((await get("/v1/me/listings", maths.cookie).expect(200)).body.listings.length, 1);
});
