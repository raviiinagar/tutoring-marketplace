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
import { fixtureBiography, fixtureDescription, fixtureTitle } from "./helpers/publication.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let app: INestApplication;
let database: Database;
let config: Config;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let clock = new Date();
const now = () => clock;
const origin = "http://localhost:3000";
const password = "Tutor-journey-password-321!";
const server = () => app.getHttpServer();
const post = (path: string, body: unknown, cookie?: string) => {
  const call = request(server()).post(path).set("Origin", origin).send(body as object);
  return cookie ? call.set("Cookie", cookie) : call;
};
const get = (path: string, cookie?: string) => {
  const call = request(server()).get(path);
  return cookie ? call.set("Cookie", cookie) : call;
};
const del = (path: string, cookie: string) => request(server()).delete(path).set("Origin", origin).set("Cookie", cookie).send({});
const combine = (base: string, staff: string) => base.split(";")[0] + "; " + staff.split(";")[0];

before(async () => {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done, fail) => probe.close((error) => (error ? fail(error) : done())));
  const directory = resolve(".local/tests", randomUUID());
  config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/tutor_journey_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
    PHOTO_REVIEW_REQUIRED: "false",
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

async function account(scopes: StaffScope[] | null = null) {
  const email = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", { display_name: "Fictional member", email, password }).expect(202);
  const row = (await database.pool.query("SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)", [email])).rows[0];
  const url = decrypt<{ verification_url: string }>(row.encrypted_payload, config.authSecret).verification_url;
  await post("/v1/auth/verifications", { token: new URL(url).hash.slice(7) }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(200);
  if (scopes) await assignStaff(database, email, scopes, "Fixture staff bootstrap", "test operator");
  return { email, id: login.body.user.id as string, cookie: login.headers["set-cookie"][0] as string, user: login.body.user };
}
async function staffMember(scopes: StaffScope[]) {
  const member = await account(scopes);
  const setup = await post("/v1/staff/mfa/enrollments", { password }, member.cookie).expect(200);
  const confirmed = await post("/v1/staff/mfa/confirmations", { code: totp(setup.body.secret, clock) }, member.cookie).expect(200);
  return { ...member, staffCookie: combine(member.cookie, confirmed.headers["set-cookie"][0]) };
}
async function portrait(colour = "#88aadd") {
  const bytes = await sharp({ create: { width: 160, height: 200, channels: 3, background: colour } }).png().toBuffer();
  return { media_type: "image/png", data: Buffer.concat([bytes, Buffer.from("FICTIONAL-TUTOR-EVIDENCE")]).toString("base64"), public_consent: true };
}
const introduction = {
  display_name: "Fictional Journey Tutor",
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

test("a new account is asked once whether it learns, teaches or both", async () => {
  const member = await account();
  assert.equal(member.user.roles_chosen, false);
  assert.equal((await get("/v1/me", member.cookie).expect(200)).body.user.roles_chosen, false);
  const both = (await post("/v1/me/roles", { roles: ["LEARNER", "TUTOR"] }, member.cookie).expect(200)).body.user;
  assert.deepEqual(both.roles, ["LEARNER", "TUTOR"]);
  assert.equal(both.roles_chosen, true);
  // Choosing again keeps it settled; choosing the same roles still counts as an answer.
  const teach = (await post("/v1/me/roles", { roles: ["TUTOR"] }, member.cookie).expect(200)).body.user;
  assert.equal(teach.roles_chosen, true);
  const other = await account();
  assert.equal((await post("/v1/me/roles", { roles: ["LEARNER"] }, other.cookie).expect(200)).body.user.roles_chosen, true);
});

test("a Learner manages a profile photo in My Account without a Tutor profile, and it stays private", async () => {
  const learner = await account();
  const photo = (await post("/v1/me/tutor/photo", await portrait(), learner.cookie).expect(201)).body.photo;
  assert.equal(photo.scan_status, "CLEAN");
  assert.equal((await get("/v1/me/tutor/photo", learner.cookie).expect(200)).body.photo.id, photo.id);
  assert.equal((await get("/v1/me/tutor/photo/" + photo.id, learner.cookie).expect(200)).headers["content-type"], "image/jpeg");
  // Not a published Tutor, so nothing public shows the photo.
  assert.ok(!(await get("/v1/tutor-profiles").expect(200)).body.profiles.some((p: any) => p.display_name === "Fictional member" && p.photo_url));
  await del("/v1/me/tutor/photo/" + photo.id, learner.cookie).expect(204);
  assert.equal((await get("/v1/me/tutor/photo", learner.cookie).expect(200)).body.photo, null);
});

test("signed-in visitors report a published Tutor's photo once; staff see the count", async () => {
  const tutor = await account(),
    learner = await account(),
    other = await account(),
    trust = await staffMember(["TRUST"]);
  const intro = (await post("/v1/me/tutor/introduction", introduction, tutor.cookie).expect(200)).body.profile;
  const photo = (await post("/v1/me/tutor/photo", await portrait("#aa8866"), tutor.cookie).expect(201)).body.photo;
  const draft = (await post("/v1/me/listings", offer, tutor.cookie).expect(201)).body.listing;
  await post("/v1/me/listings/" + draft.id + "/actions/PUBLISH", { revision: draft.revision }, tutor.cookie).expect(200);
  // With photo review off the photo is public straight away.
  assert.ok((await get("/v1/tutor-profiles/" + intro.public_id).expect(200)).body.profile.photo_url);
  const path = "/v1/tutor-profiles/" + intro.public_id + "/photo-reports";
  await post(path, { reason: "NOT_A_PORTRAIT" }).expect(401);
  await post(path, { reason: "SPAM" }, learner.cookie).expect(400);
  await post(path, { reason: "NOT_A_PORTRAIT" }, learner.cookie).expect(200);
  await post(path, { reason: "INAPPROPRIATE" }, learner.cookie).expect(200);
  await post(path, { reason: "NOT_THE_TUTOR" }, other.cookie).expect(200);
  assert.equal((await post(path, { reason: "OTHER" }, tutor.cookie).expect(409)).body.code, "OWN_PHOTO");
  await post("/v1/tutor-profiles/" + randomUUID() + "/photo-reports", { reason: "OTHER" }, learner.cookie).expect(404);
  const queued = (await get("/v1/staff/tutor-photos", trust.staffCookie).expect(200)).body.photos;
  assert.equal(queued[0].id, photo.id, "the reported photo comes first");
  assert.equal(queued[0].report_count, 2);
  // Staff can still remove it from Portrait reviews.
  await post("/v1/staff/tutor-photos/" + photo.id + "/reviews", { outcome: "REJECT", reason: "Reported as not a portrait" }, trust.staffCookie).expect(200);
  assert.equal((await get("/v1/tutor-profiles/" + intro.public_id).expect(200)).body.profile.photo_url, null);
});
