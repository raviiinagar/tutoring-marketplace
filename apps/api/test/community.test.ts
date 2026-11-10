import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";
import http from "node:http";
import { join, resolve } from "node:path";
import request from "supertest";
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
const password = "Community-password-321!";
const general = "3a7c9a3e-6d1b-4c55-9a0e-0f5d2b1c0002";
const announcements = "3a7c9a3e-6d1b-4c55-9a0e-0f5d2b1c0001";
const bugs = "3a7c9a3e-6d1b-4c55-9a0e-0f5d2b1c0003";
const server = (target?: INestApplication) => (target ?? app).getHttpServer();
const post = (path: string, body: unknown, cookie?: string, target?: INestApplication) => {
  const call = request(server(target)).post(path).set("Origin", origin).send(body);
  return cookie ? call.set("Cookie", cookie) : call;
};
const get = (path: string, cookie?: string, target?: INestApplication) => {
  const call = request(server(target)).get(path);
  return cookie ? call.set("Cookie", cookie) : call;
};
const del = (path: string, cookie: string, body: unknown = {}) =>
  request(server()).delete(path).set("Origin", origin).set("Cookie", cookie).send(body);
const combine = (base: string, staff: string) => base.split(";")[0] + "; " + staff.split(";")[0];
before(async () => {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((done, fail) => probe.close((error) => (error ? fail(error) : done())));
  const directory = resolve(".local/tests", randomUUID());
  environment = {
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/community_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
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
  await post("/v1/auth/registrations", { display_name: "Fictional Real Name", email, password }).expect(202);
  const row = (
    await database.pool.query("SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)", [email])
  ).rows[0];
  const url = decrypt<{ verification_url: string }>(row.encrypted_payload, config.authSecret).verification_url;
  await post("/v1/auth/verifications", { token: new URL(url).hash.slice(7) }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(200);
  if (scopes) await assignStaff(database, email, scopes, "Fixture staff bootstrap", "test operator");
  return { email, id: login.body.user.id as string, cookie: login.headers["set-cookie"][0] as string };
}
async function member(nickname = "Member " + randomBytes(3).toString("hex"), scopes: StaffScope[] | null = null) {
  const user = await account(scopes);
  await post("/v1/community/membership", { nickname, adult_confirmed: true, rules_accepted: true }, user.cookie).expect(200);
  return { ...user, nickname };
}
async function staffMember(scopes: StaffScope[] = ["TRUST"]) {
  const user = await member("Helper " + randomBytes(3).toString("hex"), scopes);
  const setup = await post("/v1/staff/mfa/enrollments", { password }, user.cookie).expect(200);
  const confirmed = await post("/v1/staff/mfa/confirmations", { code: totp(setup.body.secret, clock) }, user.cookie).expect(200);
  return { ...user, staffCookie: combine(user.cookie, confirmed.headers["set-cookie"][0]) };
}
const say = (channel: string, body: string, cookie: string, extra: Record<string, unknown> = {}) =>
  post(`/v1/community/channels/${channel}/messages`, { request_key: randomUUID(), body, ...extra }, cookie);
const reason = "Moderate fictional community content";

test("members must join with an 18+ confirmation and a nickname that hides their real name", async () => {
  const user = await account();
  const overview = (await get("/v1/community", user.cookie).expect(200)).body;
  assert.equal(overview.member, null);
  assert.deepEqual(overview.channels, []);
  assert.equal(overview.policy.rules.length, 6);
  await get("/v1/community").expect(401);
  assert.equal((await get(`/v1/community/channels/${general}/messages`, user.cookie).expect(403)).body.code, "COMMUNITY_JOIN_REQUIRED");
  await say(general, "Hello before joining", user.cookie).expect(403);
  const joinBody = { nickname: "Asha", adult_confirmed: true, rules_accepted: true };
  await post("/v1/community/membership", { ...joinBody, adult_confirmed: false }, user.cookie).expect(400);
  await post("/v1/community/membership", { ...joinBody, rules_accepted: false }, user.cookie).expect(400);
  await post("/v1/community/membership", { ...joinBody, nickname: "Team Asha" }, user.cookie).expect(400);
  await post("/v1/community/membership", { ...joinBody, nickname: "asha@example.test" }, user.cookie).expect(400);
  await post("/v1/community/membership", { ...joinBody, nickname: "9876543210 call" }, user.cookie).expect(400);
  await post("/v1/community/membership", joinBody, user.cookie).expect(200);
  const joined = (await get("/v1/community", user.cookie).expect(200)).body;
  assert.equal(joined.member.nickname, "Asha");
  assert.deepEqual(
    joined.channels.map((c: any) => [c.slug, c.can_post]),
    [
      ["announcements", false],
      ["general", true],
      ["bug-reports", true],
      ["feature-ideas", true],
      ["help-and-support", true],
    ],
  );
  const sent = (await say(general, "Hello everyone!", user.cookie).expect(201)).body.message;
  assert.equal(sent.author.nickname, "Asha");
  assert.ok(!JSON.stringify(sent).includes("Fictional Real Name"));
  assert.ok(!JSON.stringify(sent).includes(user.id));
  await del("/v1/community/membership", user.cookie).expect(200);
  await get(`/v1/community/channels/${general}/messages`, user.cookie).expect(403);
});

test("messages support replies, reactions, idempotent retries, author deletion and cursor sync", async () => {
  const asha = await member("Asha K"),
    ravi = await member("Ravi M");
  await say(general, "Call me on +91 98765 43210", asha.cookie).expect(400);
  await say(general, "See www.example.test", asha.cookie).expect(400);
  await say(general, "Ping me on whatsapp: anything", asha.cookie).expect(400);
  await say(general, "", asha.cookie).expect(400);
  const start = (await get(`/v1/community/channels/${general}/messages`, ravi.cookie).expect(200)).body.cursor;
  const key = randomUUID();
  const first = (await post(`/v1/community/channels/${general}/messages`, { request_key: key, body: "Is search fast for you?" }, asha.cookie).expect(201)).body;
  assert.equal(first.replayed, false);
  assert.equal(
    (await post(`/v1/community/channels/${general}/messages`, { request_key: key, body: "Is search fast for you?" }, asha.cookie).expect(201)).body.replayed,
    true,
  );
  await post(`/v1/community/channels/${general}/messages`, { request_key: key, body: "Something else" }, asha.cookie).expect(409);
  const parent = first.message.id;
  await say(bugs, "Wrong channel reply", ravi.cookie, { reply_to: parent }).expect(404);
  const reply = (await say(general, "Yes, very fast now.", ravi.cookie, { reply_to: parent }).expect(201)).body.message;
  assert.deepEqual(reply.reply_to, { id: parent, nickname: "Asha K", excerpt: "Is search fast for you?" });

  await post(`/v1/community/messages/${parent}/reactions`, { emoji: "THUMBS_UP" }, ravi.cookie).expect(200);
  await post(`/v1/community/messages/${parent}/reactions`, { emoji: "THUMBS_UP" }, ravi.cookie).expect(200);
  const reacted = (await post(`/v1/community/messages/${parent}/reactions`, { emoji: "THUMBS_UP" }, asha.cookie).expect(200)).body.message;
  assert.deepEqual(reacted.reactions, [{ emoji: "THUMBS_UP", count: 2, mine: true }]);
  await post(`/v1/community/messages/${parent}/reactions`, { emoji: "SKULL" }, asha.cookie).expect(400);
  const unreacted = (await del(`/v1/community/messages/${parent}/reactions`, ravi.cookie, { emoji: "THUMBS_UP" }).expect(200)).body.message;
  assert.deepEqual(unreacted.reactions, [{ emoji: "THUMBS_UP", count: 1, mine: false }]);

  await del(`/v1/community/messages/${parent}`, ravi.cookie).expect(404);
  await del(`/v1/community/messages/${parent}`, asha.cookie).expect(200);
  const changes = (await get(`/v1/community/channels/${general}/messages?after=${start}`, ravi.cookie).expect(200)).body;
  const ids = changes.messages.map((m: any) => m.id);
  assert.deepEqual(new Set(ids), new Set([parent, reply.id]));
  const deleted = changes.messages.find((m: any) => m.id === parent);
  assert.equal(deleted.status, "DELETED_BY_AUTHOR");
  assert.equal(deleted.body, null);
  assert.deepEqual(deleted.reactions, []);
  assert.equal(changes.messages.find((m: any) => m.id === reply.id).reply_to.excerpt, null);
  assert.deepEqual((await get(`/v1/community/channels/${general}/messages?after=${changes.cursor}`, ravi.cookie).expect(200)).body.messages, []);
  await get(`/v1/community/channels/${general}/messages?after=1&before=${parent}`, ravi.cookie).expect(400);

  // Rate limit: eight posts a minute.
  clock = new Date(clock.getTime() + 120000);
  for (let n = 0; n < 8; n++) await say(bugs, `Rate test ${n}`, ravi.cookie).expect(201);
  await say(bugs, "One too many", ravi.cookie).expect(429);
});

test("history pages backwards through older messages", async () => {
  const user = await member();
  const channel = (
    await post(
      "/v1/staff/community/channels",
      { name: "Paging " + randomBytes(3).toString("hex"), description: "", staff_only_posting: false, position: 90, reason },
      (await staffMember()).staffCookie,
    ).expect(201)
  ).body.channel.id;
  for (let n = 0; n < 55; n++) {
    if (n % 8 === 0) clock = new Date(clock.getTime() + 61000);
    await say(channel, `Message ${n}`, user.cookie).expect(201);
  }
  const latest = (await get(`/v1/community/channels/${channel}/messages`, user.cookie).expect(200)).body;
  assert.equal(latest.messages.length, 50);
  assert.equal(latest.has_older, true);
  assert.equal(latest.messages[0].body, "Message 5");
  assert.equal(latest.messages.at(-1).body, "Message 54");
  const older = (await get(`/v1/community/channels/${channel}/messages?before=${latest.messages[0].id}`, user.cookie).expect(200)).body;
  assert.deepEqual(
    older.messages.map((m: any) => m.body),
    ["Message 0", "Message 1", "Message 2", "Message 3", "Message 4"],
  );
  assert.equal(older.has_older, false);
});

test("only verified team members post announcements, shown with a team badge", async () => {
  const user = await member();
  assert.equal((await say(announcements, "Fake announcement", user.cookie).expect(403)).body.code, "TEAM_ONLY_CHANNEL");
  const helper = await staffMember(["SUPPORT"]);
  await say(announcements, "Without MFA", helper.cookie).expect(403);
  const message = (await say(announcements, "Version 2 is live.", helper.staffCookie).expect(201)).body.message;
  assert.equal(message.author.team, true);
  const seen = (await get(`/v1/community/channels/${announcements}/messages`, user.cookie).expect(200)).body.messages.find((m: any) => m.id === message.id);
  assert.equal(seen.author.team, true);
  assert.equal(seen.author.own, false);
  assert.equal((await get("/v1/community", helper.cookie).expect(200)).body.channels.find((c: any) => c.id === announcements).can_post, true);
});

test("Trust staff review reports, remove and restore, pin, mute and manage channels", async () => {
  const author = await member("Loud Poster"),
    reporter = await member("Careful Reader");
  const message = (await say(general, "Buy my course, cheap!", author.cookie).expect(201)).body.message;
  await post(`/v1/community/messages/${message.id}/reports`, { category: "SPAM" }, author.cookie).expect(409);
  await post(`/v1/community/messages/${message.id}/reports`, { category: "SPAM", note: "Advertising" }, reporter.cookie).expect(200);
  await post(`/v1/community/messages/${message.id}/reports`, { category: "SPAM", note: "Again" }, reporter.cookie).expect(200);

  const support = await staffMember(["SUPPORT"]);
  await get(`/v1/staff/community/reports?reason=${encodeURIComponent(reason)}`, support.staffCookie).expect(403);
  const trust = await staffMember();
  await get(`/v1/staff/community/reports?reason=${encodeURIComponent(reason)}`, trust.cookie).expect(403);
  const queue = (await get(`/v1/staff/community/reports?reason=${encodeURIComponent(reason)}`, trust.staffCookie).expect(200)).body.reported;
  const item = queue.find((r: any) => r.message.id === message.id);
  assert.equal(item.message.author_id, author.id);
  assert.equal(item.channel_name, "General");
  assert.deepEqual(item.reports.map((r: any) => [r.category, r.note]), [["SPAM", "Advertising"]]);

  const act = (id: string, operation: string, status = 200) =>
    post(`/v1/staff/community/messages/${id}/actions`, { operation, reason }, trust.staffCookie).expect(status);
  await act(message.id, "REMOVE");
  await act(message.id, "REMOVE", 409);
  await act(message.id, "PIN", 409);
  const removed = (await get(`/v1/community/channels/${general}/messages`, reporter.cookie).expect(200)).body.messages.find((m: any) => m.id === message.id);
  assert.equal(removed.status, "REMOVED_BY_STAFF");
  assert.equal(removed.body, null);
  assert.equal((await database.pool.query("SELECT status FROM community_reports WHERE message_id=$1", [message.id])).rows[0].status, "ACTIONED");
  assert.ok(!(await get(`/v1/staff/community/reports?reason=${encodeURIComponent(reason)}`, trust.staffCookie).expect(200)).body.reported.some((r: any) => r.message.id === message.id));
  await act(message.id, "RESTORE");
  await act(message.id, "PIN");
  assert.deepEqual(
    (await get(`/v1/community/channels/${general}/pins`, reporter.cookie).expect(200)).body.messages.map((m: any) => m.id),
    [message.id],
  );
  await act(message.id, "DISMISS_REPORTS", 409);

  await post("/v1/staff/community/mutes", { user_id: trust.id, hours: 1, reason }, trust.staffCookie).expect(403);
  await post("/v1/staff/community/mutes", { user_id: author.id, hours: 24, reason }, trust.staffCookie).expect(200);
  const muted = await say(general, "Am I muted?", author.cookie).expect(403);
  assert.equal(muted.body.code, "MUTED");
  await post(`/v1/community/messages/${message.id}/reactions`, { emoji: "HEART" }, author.cookie).expect(403);
  assert.ok((await get("/v1/community", author.cookie).expect(200)).body.member.muted_until);
  assert.ok((await get("/v1/staff/community/mutes", trust.staffCookie).expect(200)).body.mutes.some((m: any) => m.user_id === author.id));
  // Expire the mute without advancing the clock past the staff MFA session.
  await database.pool.query("UPDATE community_mutes SET muted_until=$2 WHERE user_id=$1", [author.id, new Date(clock.getTime() - 1000)]);
  await say(general, "Mute has expired", author.cookie).expect(201);
  await post("/v1/staff/community/mutes", { user_id: author.id, hours: 2, reason }, trust.staffCookie).expect(200);
  await post("/v1/staff/community/mutes", { user_id: author.id, hours: 0, reason }, trust.staffCookie).expect(200);
  await say(general, "Unmuted again", author.cookie).expect(201);

  const created = (
    await post("/v1/staff/community/channels", { name: "Study Tips", description: "Share study tips.", staff_only_posting: false, position: 60, reason }, trust.staffCookie).expect(201)
  ).body.channel;
  assert.equal(created.slug, "study-tips");
  await post("/v1/staff/community/channels", { name: "Study tips!", description: "", staff_only_posting: false, position: 61, reason }, trust.staffCookie).expect(409);
  await post("/v1/staff/community/channels", { name: "Hidden", description: "", staff_only_posting: false, position: 1, reason }, support.staffCookie).expect(403);
  await say(created.id, "First tip: practise daily.", reporter.cookie).expect(201);
  await post(`/v1/staff/community/channels/${created.id}`, { archived: true, reason }, trust.staffCookie).expect(200);
  await get(`/v1/community/channels/${created.id}/messages`, reporter.cookie).expect(404);
  assert.ok(!(await get("/v1/community", reporter.cookie).expect(200)).body.channels.some((c: any) => c.id === created.id));
  const audits = (await database.pool.query("SELECT event_type FROM audit_events WHERE user_id=$1", [trust.id])).rows.map((r) => r.event_type);
  for (const event of ["COMMUNITY_REPORTS_VIEWED", "COMMUNITY_MESSAGE_REMOVE", "COMMUNITY_MESSAGE_RESTORE", "COMMUNITY_MESSAGE_PIN", "COMMUNITY_MEMBER_MUTED", "COMMUNITY_MEMBER_UNMUTED", "COMMUNITY_CHANNEL_CREATED", "COMMUNITY_CHANNEL_UPDATED"])
    assert.ok(audits.includes(event), event);
});

test("the live stream delivers new messages and closes when membership ends", async () => {
  const listener = await member("Listener"),
    speaker = await member("Speaker");
  const httpServer = server();
  await new Promise<void>((done) => httpServer.listen(0, "127.0.0.1", done));
  const port = (httpServer.address() as AddressInfo).port;
  try {
    const cursor = (await get(`/v1/community/channels/${bugs}/messages`, listener.cookie).expect(200)).body.cursor;
    let received = "";
    const response = await new Promise<http.IncomingMessage>((done, fail) =>
      http
        .get({ host: "127.0.0.1", port, path: `/v1/community/channels/${bugs}/events?after=${cursor}`, headers: { Cookie: listener.cookie.split(";")[0] } }, done)
        .on("error", fail),
    );
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"]), /text\/event-stream/);
    const wait = (text: string) =>
      new Promise<void>((done, fail) => {
        const timer = setTimeout(() => fail(new Error("Timed out waiting for " + text + " in " + received)), 4000);
        const check = () => {
          if (received.includes(text)) {
            clearTimeout(timer);
            response.off("data", onData);
            done();
          }
        };
        const onData = (chunk: Buffer) => {
          received += chunk.toString();
          check();
        };
        response.on("data", onData);
        check();
      });
    await wait("event: changes");
    // Delivered by NOTIFY well within the 5 s fallback interval.
    await say(bugs, "Live hello from the stream test", speaker.cookie).expect(201);
    await wait("Live hello from the stream test");
    await del("/v1/community/membership", listener.cookie).expect(200);
    await say(bugs, "Wake the stream after leaving", speaker.cookie).expect(201);
    await wait("event: access-revoked");
    await new Promise<void>((done) => (response.complete ? done() : response.on("end", () => done())));
  } finally {
    // Drop any still-open event stream so a failed assertion can't hang the close.
    (httpServer as http.Server).closeAllConnections();
    await new Promise<void>((done) => httpServer.close(() => done()));
  }
  const outsider = await account();
  await get(`/v1/community/channels/${bugs}/events?after=0`, outsider.cookie).expect(403);
});

test("the beta switch turns the community off", async () => {
  const user = await member();
  const disabled = await createApplication(loadConfig({ ...environment, BETA_COMMUNITY_ENABLED: "false" }), database, now);
  try {
    assert.equal((await get("/v1/community-policy", undefined, disabled).expect(200)).body.enabled, false);
    assert.equal((await get("/v1/community", user.cookie, disabled).expect(404)).body.code, "FEATURE_DISABLED");
    await post(`/v1/community/channels/${general}/messages`, { request_key: randomUUID(), body: "Hello" }, user.cookie, disabled).expect(404);
  } finally {
    await disabled.close();
  }
  assert.throws(() => loadConfig({ ...environment, BETA_COMMUNITY_ENABLED: "on" }), /BETA_COMMUNITY_ENABLED/);
});
