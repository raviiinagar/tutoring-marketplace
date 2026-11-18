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
import { assignStaff, type StaffScope } from "../src/staff.js";
import { totp } from "../src/totp.js";
import {
  fixtureBiography,
  fixtureDescription,
  fixtureTitle,
} from "./helpers/publication.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let app: INestApplication;
let database: Database;
let config: Config;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let clock = new Date();
const now = () => clock;
const origin = "http://localhost:3000";
const password = "Photo-review-password-321!";
const server = () => app.getHttpServer();
const post = (path: string, body: unknown, cookie?: string) => {
  const call = request(server())
    .post(path)
    .set("Origin", origin)
    .send(body as object);
  return cookie ? call.set("Cookie", cookie) : call;
};
const get = (path: string, cookie?: string) => {
  const call = request(server()).get(path);
  return cookie ? call.set("Cookie", cookie) : call;
};
const combine = (base: string, staff: string) =>
  base.split(";")[0] + "; " + staff.split(";")[0];

before(async () => {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done, fail) =>
    probe.close((error) => (error ? fail(error) : done())),
  );
  const directory = resolve(".local/tests", randomUUID());
  config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/photo_review_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
    PHOTO_REVIEW_REQUIRED: "true",
    DIRECTORY_REQUIRES_AD: "true",
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
  clock = new Date(clock.getTime() + 2 * 86400000);
});
after(async () => {
  await app?.close();
  await database?.close();
  await cluster?.stop();
});

async function account(scopes: StaffScope[] | null = null) {
  const email = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", {
    display_name: "Fictional member",
    email,
    password,
  }).expect(202);
  const row = (
    await database.pool.query(
      "SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)",
      [email],
    )
  ).rows[0];
  const url = decrypt<{ verification_url: string }>(
    row.encrypted_payload,
    config.authSecret,
  ).verification_url;
  await post("/v1/auth/verifications", {
    token: new URL(url).hash.slice(7),
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
    id: login.body.user.id as string,
    cookie: login.headers["set-cookie"][0] as string,
  };
}
async function staffMember(scopes: StaffScope[]) {
  const member = await account(scopes);
  const setup = await post(
    "/v1/staff/mfa/enrollments",
    { password },
    member.cookie,
  ).expect(200);
  const confirmed = await post(
    "/v1/staff/mfa/confirmations",
    { code: totp(setup.body.secret, clock) },
    member.cookie,
  ).expect(200);
  return {
    ...member,
    staffCookie: combine(member.cookie, confirmed.headers["set-cookie"][0]),
  };
}
const introduction = {
  display_name: "Fictional Reviewed Tutor",
  biography: fixtureBiography,
  subject_ids: ["subject-physics"],
  hourly_rate_paise: 50000,
  identity_country: "IN",
  identity_document: "AADHAAR",
  adult_confirmed: true,
  public_email_consent: false,
};
const offer = {
  title: fixtureTitle,
  description: fixtureDescription,
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
async function portrait() {
  const bytes = await sharp({
    create: { width: 160, height: 200, channels: 3, background: "#88aadd" },
  })
    .png()
    .toBuffer();
  return {
    media_type: "image/png",
    data: Buffer.concat([
      bytes,
      Buffer.from("FICTIONAL-TUTOR-EVIDENCE"),
    ]).toString("base64"),
    public_consent: true,
  };
}

test("with photo review on, a new portrait stays private until Trust approves it while the ad can still go online", async () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "test",
        DATABASE_URL: config.databaseUrl,
        AUTH_SECRET: config.authSecret,
        WEB_ORIGIN: origin,
        PHOTO_REVIEW_REQUIRED: "yes",
      }),
    /PHOTO_REVIEW_REQUIRED/,
  );
  const tutor = await account(),
    trust = await staffMember(["TRUST"]);
  const intro = (
    await post("/v1/me/tutor/introduction", introduction, tutor.cookie).expect(
      200,
    )
  ).body.profile;
  const state = (await get("/v1/me/tutor/photo", tutor.cookie).expect(200))
    .body;
  assert.equal(state.policy.auto_publication, false);
  assert.match(state.policy.notice, /checks each photo/);
  const photo = (
    await post("/v1/me/tutor/photo", await portrait(), tutor.cookie).expect(201)
  ).body.photo;
  assert.equal(photo.status, "PENDING");
  assert.equal(photo.self_published, false);
  assert.equal(photo.publishable, true);

  // A clean photo awaiting review is enough to publish; the portrait itself is not public yet.
  const draft = (await post("/v1/me/listings", offer, tutor.cookie).expect(201))
    .body.listing;
  const published = (
    await post(
      "/v1/me/listings/" + draft.id + "/actions/PUBLISH",
      { revision: draft.revision },
      tutor.cookie,
    ).expect(200)
  ).body.listing;
  assert.equal(published.status, "PUBLISHED");
  let profile = (await get("/v1/tutor-profiles/" + intro.public_id).expect(200))
    .body.profile;
  assert.equal(profile.photo_url, null);
  await get(
    "/v1/tutor-profiles/" + intro.public_id + "/photos/" + photo.id,
  ).expect(404);
  assert.ok(
    (
      await get("/v1/staff/tutor-photos", trust.staffCookie).expect(200)
    ).body.photos.some((p: any) => p.id === photo.id),
  );

  await post(
    "/v1/staff/tutor-photos/" + photo.id + "/reviews",
    { outcome: "APPROVE", reason: "Clear fictional portrait approved" },
    trust.staffCookie,
  ).expect(200);
  profile = (await get("/v1/tutor-profiles/" + intro.public_id).expect(200))
    .body.profile;
  assert.ok(profile.photo_url);
  await get(profile.photo_url).expect(200);

  // A rejected replacement never appears, and does not let the Tutor publish on its own.
  const second = (
    await post("/v1/me/tutor/photo", await portrait(), tutor.cookie).expect(201)
  ).body.photo;
  await post(
    "/v1/staff/tutor-photos/" + second.id + "/reviews",
    { outcome: "REJECT", reason: "Fictional logo instead of a portrait" },
    trust.staffCookie,
  ).expect(200);
  const after = (await get("/v1/me/tutor/photo", tutor.cookie).expect(200)).body
    .photo;
  assert.equal(after.publishable, false);
  assert.equal(
    (await get("/v1/tutor-profiles/" + intro.public_id).expect(200)).body
      .profile.photo_url,
    null,
  );
});

test("with the directory switch on, only Tutors with an available ad are listed or have a public page", async () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "test",
        DATABASE_URL: config.databaseUrl,
        AUTH_SECRET: config.authSecret,
        WEB_ORIGIN: origin,
        DIRECTORY_REQUIRES_AD: "yes",
      }),
    /DIRECTORY_REQUIRES_AD/,
  );
  const tutor = await account();
  const intro = (
    await post("/v1/me/tutor/introduction", introduction, tutor.cookie).expect(
      200,
    )
  ).body.profile;
  await post("/v1/me/tutor/photo", await portrait(), tutor.cookie).expect(201);
  const published = (
    await post(
      "/v1/me/tutor/publication",
      { expected_public_revision: intro.public_revision, action: "PUBLISH" },
      tutor.cookie,
    ).expect(200)
  ).body.profile;
  assert.equal(published.publication_status, "PUBLISHED");
  const listed = async () =>
    (await get("/v1/tutor-profiles").expect(200)).body.profiles.some(
      (p: any) => p.id === intro.public_id,
    );
  assert.equal(await listed(), false);
  // ADR0021: no ad, no public page, so a visitor never lands on a Tutor they cannot contact.
  await get("/v1/tutor-profiles/" + intro.public_id).expect(404);
  const draft = (await post("/v1/me/listings", offer, tutor.cookie).expect(201))
    .body.listing;
  await post(
    "/v1/me/listings/" + draft.id + "/actions/PUBLISH",
    { revision: draft.revision },
    tutor.cookie,
  ).expect(200);
  assert.equal(await listed(), true);
  await get("/v1/tutor-profiles/" + intro.public_id).expect(200);
});
