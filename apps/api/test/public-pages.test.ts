import {grantTutorProFixture} from '../../../scripts/tutor-pro-fixture.js';
import { productionPrivacyFixture } from "./privacy-fixture.js";
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
import { decrypt, encrypt, tokenHash } from "../src/security.js";
import { assignStaff, type StaffScope } from "../src/staff.js";
import { base32, totp } from "../src/totp.js";
import { ClamAvScanner, TestEvidenceScanner } from "../src/evidence-scanner.js";
import { TutorsService, isAdult } from "../src/tutors.js";
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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/staff_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
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
          expires_at: new Date(clock.getTime() + 86400000).toISOString(),
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
test("canonical Tutor pages and category supply disappear immediately when publication pauses", async () => {
  const user = await tutor(),
    row = await publishOffer(user, offer);
  const found = await get("/v1/public/teachers/physics-" + row.id).expect(200);
  assert.equal(found.body.listing.id, row.id);
  assert.equal(
    found.body.seo.canonical,
    origin + "/teachers/physics-" + row.id,
  );
  assert.equal(found.body.seo.indexable, false);
  assert.equal(
    found.body.seo.title,
    "Physics with worked examples | Tutor Marketplace",
  );
  const old = await get("/v1/public/teachers/old-name-" + row.id).expect(200);
  assert.equal(old.body.redirect_to, "/teachers/physics-" + row.id);
  const category = await get(
    "/v1/public/categories/school/subject-physics",
  ).expect(200);
  assert.equal(category.body.offers.length, 1);
  assert.equal(category.body.seo.path, "/learn/school/subject-physics");
  assert.ok(!JSON.stringify(found.body).includes(user.email));
  await post(
    "/v1/me/listings/" + row.id + "/actions/PAUSE",
    { revision: row.revision },
    user.cookie,
  ).expect(200);
  await get("/v1/public/teachers/physics-" + row.id).expect(404);
  const empty = await get(
    "/v1/public/categories/school/subject-physics",
  ).expect(200);
  assert.equal(empty.body.offers.length, 0);
  assert.equal(empty.body.seo.indexable, false);
});

test("production metadata and sitemap include only current approved supply and approved portraits", async () => {
  const teacher = await tutor(),
    listing = await publishOffer(teacher, offer);
  const { default: sharp } = await import("sharp");
  const raw = await sharp({
    create: { width: 128, height: 160, channels: 3, background: "#dd8888" },
  })
    .png()
    .toBuffer();
  const photo = (
    await post(
      "/v1/me/tutor/photo",
      {
        media_type: "image/png",
        data: Buffer.concat([
          raw,
          Buffer.from("FICTIONAL-TUTOR-EVIDENCE"),
        ]).toString("base64"),
        public_consent: true,
      },
      teacher.cookie,
    ).expect(201)
  ).body.photo;
  await post(
    "/v1/staff/tutor-photos/" + photo.id + "/reviews",
    { outcome: "APPROVE", reason: "Fictional portrait is appropriate" },
    teacher.reviewer!.cookie,
  ).expect(200);
  // Explicit simulated production-read fixture, never a live evidence approval.
  await database.pool.query(
    "UPDATE tutor_evidence SET test_only=false WHERE user_id=$1",
    [teacher.id],
  );
  await database.pool.query(
    "UPDATE tutor_photos SET test_only=false WHERE id=$1",
    [photo.id],
  );
  const prod = loadConfig({
      ...productionPrivacyFixture(),
      NODE_ENV: "production",
      DATABASE_URL: config.databaseUrl,
      AUTH_SECRET: config.authSecret,
      WEB_ORIGIN: "https://tutoring.example",
      MAIL_TRANSPORT: "smtp",
      SMTP_HOST: "smtp.example.test",
      SMTP_USER: "fixture",
      SMTP_PASSWORD: "fixture",
      SMTP_FROM: "fixture@example.test",
    }),
    prodApp = await createApplication(prod, database, now);
  const read = (path: string) =>
    request(prodApp.getHttpServer()).get(path).set("Host", "untrusted.example");
  try {
    const page = (
      await read("/v1/public/teachers/physics-" + listing.id).expect(200)
    ).body;
    assert.equal(page.seo.indexable, true);
    assert.equal(
      page.seo.image,
      "https://tutoring.example" + page.listing.tutor.photo_url,
    );
    const sitemap = await read("/v1/public/sitemap").expect(200);
    assert.ok(
      sitemap.text.includes(
        "https://tutoring.example/teachers/physics-" + listing.id,
      ),
    );
    assert.ok(sitemap.text.includes("/learn/school/subject-physics"));
    for (const path of ["/account", "/staff", "/payments", "untrusted.example"])
      assert.ok(!sitemap.text.includes(path));
    const robots = await read("/v1/public/robots").expect(200);
    assert.ok(robots.text.includes("Allow: /v1/discovery/*/photos/"));
    assert.ok(robots.text.includes("Disallow: /staff"));
    await del("/v1/me/tutor/photo/" + photo.id, teacher.cookie).expect(204);
    assert.equal(
      (await read("/v1/public/teachers/physics-" + listing.id).expect(200)).body
        .seo.image,
      undefined,
    );
    await read(page.listing.tutor.photo_url).expect(404);
    await database.pool.query(
      "UPDATE users SET status='DISABLED' WHERE id=$1",
      [teacher.id],
    );
    await read("/v1/public/teachers/old-name-" + listing.id).expect(404);
    assert.ok(!(await read("/v1/public/sitemap")).text.includes(listing.id));
  } finally {
    await prodApp.close();
  }
});
