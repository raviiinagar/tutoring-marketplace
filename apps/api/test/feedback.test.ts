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
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let app: INestApplication;
let database: Database;
let config: Config;
let environment: Record<string, string>;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let clock = new Date();
const now = () => clock;
const origin = "http://localhost:3000";
const password = "Feedback-password-321!";
const server = (target?: INestApplication) => (target ?? app).getHttpServer();
const post = (path: string, body: unknown, cookie?: string, target?: INestApplication) => {
  const call = request(server(target)).post(path).set("Origin", origin).send(body);
  return cookie ? call.set("Cookie", cookie) : call;
};
const get = (path: string, cookie?: string, target?: INestApplication) => {
  const call = request(server(target)).get(path);
  return cookie ? call.set("Cookie", cookie) : call;
};
const del = (path: string, cookie: string) =>
  request(server()).delete(path).set("Origin", origin).set("Cookie", cookie).send({});
const combine = (base: string, staff: string) => base.split(";")[0] + "; " + staff.split(";")[0];
before(async () => {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done, fail) => probe.close((error) => (error ? fail(error) : done())));
  const directory = resolve(".local/tests", randomUUID());
  environment = {
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/feedback_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
  };
  config = loadConfig(environment);
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
    await database.pool.query(
      "SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)",
      [email],
    )
  ).rows[0];
  const url = decrypt<{ verification_url: string }>(row.encrypted_payload, config.authSecret).verification_url;
  await post("/v1/auth/verifications", { token: new URL(url).hash.slice(7) }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(200);
  if (scopes) await assignStaff(database, email, scopes, "Fixture staff bootstrap", "test operator");
  return { email, id: login.body.user.id as string, cookie: login.headers["set-cookie"][0] as string };
}
async function staffMember(scopes: StaffScope[] = ["SUPPORT"]) {
  const member = await account(scopes);
  const setup = await post("/v1/staff/mfa/enrollments", { password }, member.cookie).expect(200);
  const confirmed = await post("/v1/staff/mfa/confirmations", { code: totp(setup.body.secret, clock) }, member.cookie).expect(200);
  return { ...member, staffCookie: combine(member.cookie, confirmed.headers["set-cookie"][0]) };
}
// The fictional scanner passes images carrying this marker; re-encoding must strip it.
async function screenshot(marker = "FICTIONAL-TUTOR-EVIDENCE") {
  const pixels = Buffer.alloc(800 * 500 * 3, 120);
  const image = await sharp(pixels, { raw: { width: 800, height: 500, channels: 3 } })
    .withMetadata({ exif: { IFD0: { ImageDescription: marker } } })
    .png()
    .toBuffer();
  return { media_type: "image/png", data: image.toString("base64") };
}
const reason = "Triage fictional beta feedback";

test("a private bug report with a screenshot is visible only to its author and Support staff", async () => {
  const author = await account(),
    stranger = await account();
  assert.equal((await get("/v1/feedback-policy").expect(200)).body.screenshots_enabled, true);
  await post(
    "/v1/me/feedback",
    { request_key: randomUUID(), category: "BUG", title: "Broken", description: "Too short" },
    author.cookie,
  ).expect(400);
  const input = {
    request_key: randomUUID(),
    category: "BUG",
    title: "Search button does nothing",
    description: "On the tutors page the search button does not respond on my phone.",
    screenshot: await screenshot(),
  };
  const created = (await post("/v1/me/feedback", input, author.cookie).expect(201)).body;
  assert.equal(created.replayed, false);
  const id = created.feedback.id;
  assert.equal(created.feedback.status, "NEW");
  assert.equal(created.feedback.public, false);
  assert.equal(created.feedback.has_screenshot, true);
  assert.equal((await post("/v1/me/feedback", input, author.cookie).expect(201)).body.replayed, true);
  await post("/v1/me/feedback", { ...input, title: "A different title here" }, author.cookie).expect(409);
  const image = (await get(`/v1/me/feedback/${id}/screenshot`, author.cookie).expect(200)).body as Buffer;
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.exif, undefined);
  assert.ok(!image.toString("latin1").includes("FICTIONAL-TUTOR-EVIDENCE"));
  await get(`/v1/me/feedback/${id}`, stranger.cookie).expect(404);
  await get(`/v1/me/feedback/${id}/screenshot`, stranger.cookie).expect(404);
  assert.ok(!(await get("/v1/feedback/board", stranger.cookie).expect(200)).body.suggestions.some((f: any) => f.id === id));
  assert.deepEqual((await get("/v1/me/feedback", stranger.cookie).expect(200)).body.feedback, []);

  const trust = await staffMember(["TRUST"]);
  await get(`/v1/staff/feedback?reason=${encodeURIComponent(reason)}`, trust.staffCookie).expect(403);
  const support = await staffMember();
  await get(`/v1/staff/feedback?reason=${encodeURIComponent(reason)}`, support.cookie).expect(403);
  const queue = (await get(`/v1/staff/feedback?reason=${encodeURIComponent(reason)}&category=BUG`, support.staffCookie).expect(200)).body
    .feedback;
  const listed = queue.find((f: any) => f.id === id);
  assert.equal(listed.title, input.title);
  assert.equal(listed.description, undefined);
  const inspected = (await post(`/v1/staff/feedback/${id}/inspections`, { reason }, support.staffCookie).expect(200)).body.feedback;
  assert.equal(inspected.description, input.description);
  assert.equal(inspected.owner_id, author.id);
  const staffImage = await post(`/v1/staff/feedback/${id}/screenshot-inspections`, { reason }, support.staffCookie).expect(200);
  assert.equal(staffImage.headers["cache-control"], "no-store");

  let revision = inspected.revision;
  const act = (body: Record<string, unknown>, status = 200) =>
    post(`/v1/staff/feedback/${id}/actions`, { revision, reason, ...body }, support.staffCookie).expect(status);
  revision = (await act({ operation: "SET_PRIORITY", priority: "HIGH" })).body.feedback.revision;
  revision = (await act({ operation: "NOTE", message: "Internal: reproduced on a fictional Android device." })).body.feedback.revision;
  revision = (await act({ operation: "REPLY", message: "Thanks, we can reproduce this and are fixing it." })).body.feedback.revision;
  await post(`/v1/staff/feedback/${id}/actions`, { revision: revision - 1, reason, operation: "SET_STATUS", status: "IN_PROGRESS" }, support.staffCookie).expect(409);
  await act({ operation: "HIDE" }, 409);
  revision = (await act({ operation: "SET_STATUS", status: "IN_PROGRESS" })).body.feedback.revision;

  const own = (await get(`/v1/me/feedback/${id}`, author.cookie).expect(200)).body.feedback;
  assert.equal(own.status, "IN_PROGRESS");
  assert.equal(own.priority, undefined);
  assert.deepEqual(
    own.events.map((e: any) => e.outcome),
    ["CREATED", "REPLIED", "STATUS_CHANGED"],
  );
  assert.ok(!JSON.stringify(own).includes("Internal: reproduced"));
  assert.ok(!JSON.stringify(own).includes(reason));
  assert.ok(own.events.every((e: any) => e.actor_id === undefined));

  const resolved = (await act({ operation: "SET_STATUS", status: "RESOLVED", message: "Fixed in the latest release." })).body.feedback;
  assert.equal(resolved.has_screenshot, false);
  assert.equal(resolved.screenshot_status, "REMOVED");
  await get(`/v1/me/feedback/${id}/screenshot`, author.cookie).expect(404);
  assert.equal((await database.pool.query("SELECT encrypted_screenshot FROM feedback_items WHERE id=$1", [id])).rows[0].encrypted_screenshot, null);
  const audits = (await database.pool.query("SELECT event_type FROM audit_events WHERE metadata->>'target'=$1", [id])).rows.map((r) => r.event_type);
  for (const event of ["FEEDBACK_CREATED", "FEEDBACK_INSPECTED", "FEEDBACK_SCREENSHOT_INSPECTED", "FEEDBACK_REPLIED", "FEEDBACK_NOTE_ADDED", "FEEDBACK_STATUS_CHANGED"])
    assert.ok(audits.includes(event), event);
});

test("suggestions go on the board without the author, take one vote per member and can be hidden", async () => {
  const author = await account(),
    voter = await account(),
    other = await account();
  await post(
    "/v1/me/feedback",
    { request_key: randomUUID(), category: "SUGGESTION", title: "Share my number", description: "Call me on +91 98765 43210 to discuss." },
    author.cookie,
  ).expect(400);
  await post(
    "/v1/me/feedback",
    { request_key: randomUUID(), category: "FEATURE_REQUEST", title: "Instagram link", description: "Follow www.example.test for ideas please." },
    author.cookie,
  ).expect(400);
  const id = (
    await post(
      "/v1/me/feedback",
      { request_key: randomUUID(), category: "SUGGESTION", title: "Saved searches", description: "Let me save a search and get told about new Tutors." },
      author.cookie,
    ).expect(201)
  ).body.feedback.id;
  const listed = (await get("/v1/feedback/board?sort=new", voter.cookie).expect(200)).body.suggestions.find((f: any) => f.id === id);
  assert.deepEqual(Object.keys(listed).sort(), ["category", "created_at", "description", "id", "own", "status", "title", "vote_count", "voted"]);
  assert.equal(listed.own, false);
  assert.equal(JSON.stringify(listed).includes(author.id), false);
  await get("/v1/feedback/board").expect(401);
  await get("/v1/feedback/board?sort=popular", voter.cookie).expect(400);

  assert.deepEqual((await post(`/v1/feedback/board/${id}/votes`, {}, voter.cookie).expect(200)).body, { vote_count: 1, voted: true });
  assert.deepEqual((await post(`/v1/feedback/board/${id}/votes`, {}, voter.cookie).expect(200)).body, { vote_count: 1, voted: true });
  assert.equal((await post(`/v1/feedback/board/${id}/votes`, {}, other.cookie).expect(200)).body.vote_count, 2);
  assert.deepEqual((await del(`/v1/feedback/board/${id}/votes`, voter.cookie).expect(200)).body, { vote_count: 1, voted: false });
  assert.deepEqual((await del(`/v1/feedback/board/${id}/votes`, voter.cookie).expect(200)).body, { vote_count: 1, voted: false });
  const mine = (await get("/v1/feedback/board", other.cookie).expect(200)).body.suggestions.find((f: any) => f.id === id);
  assert.equal(mine.voted, true);
  assert.equal(mine.vote_count, 1);

  const support = await staffMember();
  const revision = (await post(`/v1/staff/feedback/${id}/inspections`, { reason }, support.staffCookie).expect(200)).body.feedback.revision;
  await post(`/v1/staff/feedback/${id}/actions`, { revision, reason, operation: "HIDE", message: "Duplicate of an existing suggestion." }, support.staffCookie).expect(200);
  assert.ok(!(await get("/v1/feedback/board", voter.cookie).expect(200)).body.suggestions.some((f: any) => f.id === id));
  await post(`/v1/feedback/board/${id}/votes`, {}, voter.cookie).expect(404);
  const own = (await get(`/v1/me/feedback/${id}`, author.cookie).expect(200)).body.feedback;
  assert.equal(own.hidden, true);
  assert.equal(own.events.at(-1).message, "Duplicate of an existing suggestion.");
});

test("unsafe or malformed screenshots are refused without creating feedback", async () => {
  const author = await account();
  const base = { category: "UI_UX", title: "Overlapping buttons", description: "The menu buttons overlap on a small phone screen." };
  await post("/v1/me/feedback", { ...base, request_key: randomUUID(), screenshot: await screenshot("MALICIOUS-FIXTURE") }, author.cookie).expect(400);
  await post("/v1/me/feedback", { ...base, request_key: randomUUID(), screenshot: { media_type: "image/jpeg", data: (await screenshot()).data } }, author.cookie).expect(400);
  await post("/v1/me/feedback", { ...base, request_key: randomUUID(), screenshot: { media_type: "image/png", data: "not-base64!" } }, author.cookie).expect(400);
  assert.deepEqual((await get("/v1/me/feedback", author.cookie).expect(200)).body.feedback, []);
});

test("the beta switch turns every feedback route off", async () => {
  const author = await account();
  const disabled = await createApplication(loadConfig({ ...environment, BETA_FEEDBACK_ENABLED: "false" }), database, now);
  try {
    const policy = (await get("/v1/feedback-policy", undefined, disabled).expect(200)).body;
    assert.equal(policy.enabled, false);
    assert.equal(policy.screenshots_enabled, false);
    const refused = await post(
      "/v1/me/feedback",
      { request_key: randomUUID(), category: "BUG", title: "Anything at all", description: "This should be refused while disabled." },
      author.cookie,
      disabled,
    ).expect(404);
    assert.equal(refused.body.code, "FEATURE_DISABLED");
    await get("/v1/me/feedback", author.cookie, disabled).expect(404);
    await get("/v1/feedback/board", author.cookie, disabled).expect(404);
  } finally {
    await disabled.close();
  }
  assert.throws(() => loadConfig({ ...environment, BETA_FEEDBACK_ENABLED: "yes" }), /BETA_FEEDBACK_ENABLED/);
  assert.equal(config.betaFeedback, true);
});
