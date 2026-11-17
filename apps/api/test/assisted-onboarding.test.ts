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
const password = "Assisted-onboarding-321!";
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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/assisted_onboarding_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
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
  const row = (
    await database.pool.query("SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)", [email])
  ).rows[0];
  const url = decrypt<{ verification_url: string }>(row.encrypted_payload, config.authSecret).verification_url;
  await post("/v1/auth/verifications", { token: new URL(url).hash.slice(7) }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(200);
  if (scopes) await assignStaff(database, email, scopes, "Fixture staff bootstrap", "test operator");
  return { email, id: login.body.user.id as string, cookie: login.headers["set-cookie"][0] as string };
}
async function staffMember(scopes: StaffScope[]) {
  const member = await account(scopes);
  const setup = await post("/v1/staff/mfa/enrollments", { password }, member.cookie).expect(200);
  const confirmed = await post("/v1/staff/mfa/confirmations", { code: totp(setup.body.secret, clock) }, member.cookie).expect(200);
  return { ...member, staffCookie: combine(member.cookie, confirmed.headers["set-cookie"][0]) };
}
const help = "/v1/me/tutor/onboarding-help";
const helpInput = () => ({
  request_key: randomUUID(),
  whatsapp_number: "+91 82335 98649",
  note: "Physics for class 10, online",
  adult_confirmed: true,
  team_publication_consent: true,
  photo_public_consent: true,
});
const introduction = {
  display_name: "Fictional Assisted Tutor",
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
  const bytes = await sharp({ create: { width: 160, height: 200, channels: 3, background: "#dd8888" } }).png().toBuffer();
  return {
    media_type: "image/png",
    data: Buffer.concat([bytes, Buffer.from("FICTIONAL-TUTOR-EVIDENCE")]).toString("base64"),
    public_consent: true,
  };
}
const act = (id: string, body: Record<string, unknown>, cookie: string) => post(`/v1/staff/tutor-onboarding/${id}/actions`, body, cookie);

test("Support staff set up and publish a Tutor's profile and ad from the Tutor's consented request", async () => {
  const tutor = await account(),
    admin = await staffMember(["SUPPORT"]),
    trust = await staffMember(["TRUST"]);
  assert.equal((await get(help, tutor.cookie).expect(200)).body.request, null);
  await post(help, { ...helpInput(), team_publication_consent: false }, tutor.cookie).expect(400);
  await post(help, { ...helpInput(), whatsapp_number: "12" }, tutor.cookie).expect(400);
  const input = helpInput();
  const created = (await post(help, input, tutor.cookie).expect(201)).body.request;
  assert.match(created.reference, /^TM-[0-9A-F]{6}$/);
  assert.equal(created.status, "OPEN");
  assert.equal(created.whatsapp_number, "+918233598649");
  // A retry returns the same request; a changed retry or a second request is refused.
  assert.equal((await post(help, input, tutor.cookie).expect(201)).body.request.id, created.id);
  await post(help, { ...input, note: "Something else" }, tutor.cookie).expect(409);
  await post(help, helpInput(), tutor.cookie).expect(409);

  // Only Support staff with MFA see the queue, with the contact the Tutor gave.
  await get("/v1/staff/tutor-onboarding", tutor.cookie).expect(403);
  await get("/v1/staff/tutor-onboarding", trust.staffCookie).expect(403);
  const queued = (await get("/v1/staff/tutor-onboarding", admin.staffCookie).expect(200)).body.requests.find(
    (r: any) => r.id === created.id,
  );
  assert.equal(queued.email, tutor.email);
  assert.equal(queued.whatsapp_number, "+918233598649");
  assert.equal(queued.note, "Physics for class 10, online");

  const as = (path: string) => `/v1/staff/tutor-onboarding/${created.id}/as-tutor${path}`;
  // Nothing happens on the Tutor's behalf until a team member claims the request.
  assert.equal((await post(as("/tutor/introduction"), introduction, admin.staffCookie).expect(409)).body.code, "REQUEST_NOT_IN_PROGRESS");
  const claimed = (await act(created.id, { operation: "CLAIM", revision: created.revision }, admin.staffCookie).expect(200)).body.request;
  assert.equal(claimed.status, "IN_PROGRESS");
  assert.equal(claimed.assigned_to_me, true);
  await post(as("/tutor/introduction"), introduction, trust.staffCookie).expect(403);
  await post(as("/tutor/introduction"), introduction, tutor.cookie).expect(403);
  // Showing the Tutor's email publicly stays the Tutor's own decision.
  assert.equal(
    (await post(as("/tutor/introduction"), { ...introduction, public_email_consent: true }, admin.staffCookie).expect(403)).body.code,
    "TUTOR_CONSENT_REQUIRED",
  );

  // The same services and rules as the Tutor's own wizard.
  const saved = (await post(as("/tutor/introduction"), introduction, admin.staffCookie).expect(200)).body;
  assert.equal(saved.profile.display_name, "Fictional Assisted Tutor");
  assert.equal(saved.profile.identity_verified, false);
  await post(
    as("/tutor/presence"),
    { expected_revision: 0, location: { city: "Kota" }, teaching_modes: ["ONLINE", "IN_PERSON"], accepting_students: true, weekly_slots: [] },
    admin.staffCookie,
  ).expect(200);
  const photo = (await post(as("/tutor/photo"), await portrait(), admin.staffCookie).expect(201)).body.photo;
  assert.equal(photo.self_published, true);
  const preview = await get(as("/tutor/photo/" + photo.id), admin.staffCookie).expect(200);
  assert.equal(preview.headers["content-type"], "image/jpeg");
  const draft = (await post(as("/listings"), offer, admin.staffCookie).expect(201)).body.listing;
  const published = (await post(as("/listings/" + draft.id + "/actions/PUBLISH"), { revision: draft.revision }, admin.staffCookie).expect(200))
    .body.listing;
  assert.equal(published.status, "PUBLISHED");
  await get("/v1/listings/" + draft.id).expect(200);
  assert.equal((await get("/v1/me/listings", tutor.cookie).expect(200)).body.listings[0].status, "PUBLISHED");

  // Every action names the staff member; the Tutor's own records note the assistance.
  const actions = (
    await database.pool.query(
      "SELECT metadata->>'action' AS action FROM audit_events WHERE user_id=$1 AND event_type='TUTOR_ONBOARDING_ASSISTED_ACTION' ORDER BY created_at,id",
      [admin.id],
    )
  ).rows.map((r) => r.action);
  for (const action of ["SAVE_INTRODUCTION", "SAVE_PRESENCE", "UPLOAD_PHOTO", "VIEW_PHOTO", "CREATE_AD", "AD_PUBLISH"])
    assert.ok(actions.includes(action), action);
  const introAudit = (
    await database.pool.query("SELECT metadata FROM audit_events WHERE user_id=$1 AND event_type='TUTOR_INTRODUCTION_SAVED'", [tutor.id])
  ).rows[0].metadata;
  assert.equal(introAudit.assisted_by, admin.id);

  const done = (await act(created.id, { operation: "COMPLETE", revision: claimed.revision }, admin.staffCookie).expect(200)).body.request;
  assert.equal(done.status, "COMPLETED");
  await get(as("/listings"), admin.staffCookie).expect(409);
  assert.equal((await get(help, tutor.cookie).expect(200)).body.request.status, "COMPLETED");
});

test("the Tutor can withdraw at any time and staff cannot set up their own profile", async () => {
  const tutor = await account(),
    admin = await staffMember(["SUPPORT"]),
    other = await staffMember(["SUPPORT", "TRUST"]);
  let request = (await post(help, helpInput(), tutor.cookie).expect(201)).body.request;
  const as = (path: string) => `/v1/staff/tutor-onboarding/${request.id}/as-tutor${path}`;
  await act(request.id, { operation: "CLAIM", revision: request.revision + 1 }, admin.staffCookie).expect(409);
  request = (await act(request.id, { operation: "CLAIM", revision: request.revision }, admin.staffCookie).expect(200)).body.request;
  // Another team member can take over a claimed request.
  request = (await act(request.id, { operation: "CLAIM", revision: request.revision }, other.staffCookie).expect(200)).body.request;
  assert.equal(request.assigned_to, other.id);
  request = (await act(request.id, { operation: "RELEASE", revision: request.revision }, other.staffCookie).expect(200)).body.request;
  assert.equal(request.status, "OPEN");
  await get(as("/tutor"), admin.staffCookie).expect(409);
  request = (await act(request.id, { operation: "CLAIM", revision: request.revision }, admin.staffCookie).expect(200)).body.request;
  await post(as("/tutor/introduction"), introduction, admin.staffCookie).expect(200);

  // Withdrawing ends staff access straight away.
  assert.equal((await del(help, tutor.cookie).expect(200)).body.request.cancelled_by, "TUTOR");
  await post(as("/tutor/introduction"), introduction, admin.staffCookie).expect(409);
  await del(help, tutor.cookie).expect(404);

  // A new request can be cancelled by staff, but only with a reason.
  request = (await post(help, helpInput(), tutor.cookie).expect(201)).body.request;
  await act(request.id, { operation: "CANCEL", revision: request.revision }, admin.staffCookie).expect(400);
  request = (
    await act(request.id, { operation: "CANCEL", revision: request.revision, reason: "Tutor asked us by WhatsApp to stop" }, admin.staffCookie).expect(200)
  ).body.request;
  assert.equal(request.status, "CANCELLED");
  await act(request.id, { operation: "CLAIM", revision: request.revision }, admin.staffCookie).expect(409);

  // Staff cannot work on their own request.
  const own = (await post(help, helpInput(), admin.cookie).expect(201)).body.request;
  assert.equal((await act(own.id, { operation: "CLAIM", revision: own.revision }, admin.staffCookie).expect(403)).body.code, "SELF_ASSIST");
  await act(own.id, { operation: "CLAIM", revision: own.revision }, other.staffCookie).expect(200);
});
