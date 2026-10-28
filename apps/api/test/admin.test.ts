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
import { decrypt, tokenHash } from "../src/security.js";
import { assignStaff, type StaffScope } from "../src/staff.js";
import { base32, totp } from "../src/totp.js";
import { AuthService } from "../src/auth.js";
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
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/admin_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
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
  clock = new Date(clock.getTime() + 20 * 60_000);
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
test("overview requires active staff MFA and exposes finance only to Finance", async () => {
  const ordinary = await fixture(null);
  await get("/v1/staff/admin/overview").expect(401);
  await get("/v1/staff/admin/overview", ordinary.cookie).expect(403);
  const support = await fixture(["SUPPORT"]);
  await get("/v1/staff/admin/overview", support.cookie).expect(403);
  const s = await enroll(support.cookie);
  const report = (
    await get("/v1/staff/admin/overview?days=7", s.cookie).expect(200)
  ).body;
  assert.equal(report.days, 7);
  assert.equal(report.timezone, "Asia/Kolkata");
  assert.equal(report.test_only, true);
  assert.equal(report.finance, null);
  assert.ok(report.audience.accounts_total >= 2);
  assert.equal(report.audience.visits, null);
  assert.equal(report.trend.length, 7);
  assert.ok(report.trend.every((r: any) => r.visits === null));
  assert.ok(!JSON.stringify(report).includes("@example.test"));
  const finance = await fixture(["FINANCE"]);
  const f = await enroll(finance.cookie);
  const money = (
    await get("/v1/staff/admin/overview?days=30", f.cookie).expect(200)
  ).body;
  assert.equal(money.finance.captured_paise, 0);
  assert.equal(money.finance.free_passes, 0);
  const trust = await fixture(["TRUST"]);
  const trusted = await enroll(trust.cookie);
  const review = (
    await get("/v1/staff/admin/overview", trusted.cookie).expect(200)
  ).body;
  assert.equal(review.finance, null);
  assert.ok(review.queues.some((q: { key: string }) => q.key === "claims"));
  assert.ok(review.queues.some((q: { key: string }) => q.key === "photos"));
  await post("/v1/staff/admin/accounts/search", { query: "" }, f.cookie).expect(
    403,
  );
  await get("/v1/staff/admin/overview?days=365", s.cookie).expect(400);
  clock = new Date(clock.getTime() + 31 * 60000);
  await get("/v1/staff/admin/overview", s.cookie).expect(403);
});
test("account directory paging uses a stable cursor and does not repeat rows", async () => {
  const support = await fixture(["SUPPORT"]);
  const mfa = await enroll(support.cookie);
  for (let i = 0; i < 27; i++)
    await database.pool.query(
      "INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES($1,$2,$3,'fictional-disabled-hash',$4)",
      [
        randomUUID(),
        `directory-${randomUUID()}@example.invalid`,
        "Directory Fixture " + i,
        clock,
      ],
    );
  const first = (
    await post(
      "/v1/staff/admin/accounts/search",
      { query: "Directory Fixture" },
      mfa.cookie,
    ).expect(200)
  ).body;
  assert.equal(first.accounts.length, 25);
  assert.ok(first.next_cursor);
  const next = (
    await post(
      "/v1/staff/admin/accounts/search",
      { query: "Directory Fixture", cursor: first.next_cursor },
      mfa.cookie,
    ).expect(200)
  ).body;
  assert.equal(next.accounts.length, 2);
  assert.equal(next.next_cursor, null);
  assert.equal(
    new Set([...first.accounts, ...next.accounts].map((a) => a.id)).size,
    27,
  );
});
test("anonymous public traffic deduplicates concurrent retries and tab visits without storing supplied identifiers or private payloads", async () => {
  const session = randomUUID(),
    event = randomUUID(),
    input = { session_id: session, event_id: event, page: "HOME" };
  const responses = await Promise.all([
    post("/v1/public/traffic", input).expect(200),
    post("/v1/public/traffic", input).expect(200),
  ]);
  assert.equal(responses.filter((r) => r.body.replayed).length, 1);
  await post("/v1/public/traffic", {
    ...input,
    event_id: randomUUID(),
    page: "BROWSE",
  }).expect(200);
  await post("/v1/public/traffic", { ...input, page: "TUTOR" }).expect(409);
  await post("/v1/public/traffic", {
    ...input,
    event_id: randomUUID(),
    page: "CHILD_PROFILE",
  }).expect(400);
  await post("/v1/public/traffic", {
    ...input,
    event_id: randomUUID(),
    email: "child@example.test",
  }).expect(400);
  const receipts = (
    await database.pool.query("SELECT * FROM admin_traffic_receipts")
  ).rows;
  assert.ok(!JSON.stringify(receipts).includes(session));
  assert.ok(!JSON.stringify(receipts).includes(event));
  const staff = await fixture(["SUPPORT"]);
  const mfa = await enroll(staff.cookie);
  const report = (
    await get("/v1/staff/admin/overview?days=7", mfa.cookie).expect(200)
  ).body;
  assert.equal(report.audience.visits, 1);
  assert.equal(report.audience.page_views, 2);
  assert.ok(report.audience.tracking_started_at);
  assert.equal(report.trend.filter((r: any) => r.visits === null).length, 6);
});
test("IST midnight separates daily visits and lazy retention drops only old hashed receipts", async () => {
  clock = new Date("2026-11-01T18:29:59.000Z");
  const session = randomUUID();
  await post("/v1/public/traffic", {
    session_id: session,
    event_id: randomUUID(),
    page: "HOME",
  }).expect(200);
  clock = new Date("2026-11-01T18:30:00.000Z");
  await post("/v1/public/traffic", {
    session_id: session,
    event_id: randomUUID(),
    page: "HOME",
  }).expect(200);
  const rows = (
    await database.pool.query(
      "SELECT to_char(day,'YYYY-MM-DD') AS day,visits FROM admin_visit_daily WHERE day BETWEEN '2026-11-01' AND '2026-11-02' ORDER BY day",
    )
  ).rows;
  assert.deepEqual(rows, [
    { day: "2026-11-01", visits: 1 },
    { day: "2026-11-02", visits: 1 },
  ]);
  clock = new Date("2026-11-06T06:00:00.000Z");
  await post("/v1/public/traffic", {
    session_id: randomUUID(),
    event_id: randomUUID(),
    page: "SIGN_IN",
  }).expect(200);
  assert.equal(
    (
      await database.pool.query(
        "SELECT count(*) FROM admin_traffic_receipts WHERE day<'2026-11-04'",
      )
    ).rows[0].count,
    "0",
  );
  assert.equal(
    (
      await database.pool.query(
        "SELECT count(*) FROM admin_visit_daily WHERE day='2026-11-01'",
      )
    ).rows[0].count,
    "1",
  );
});
test("Support directory searches accounts without leaking credentials and revoked assignments cannot reuse a report session", async () => {
  const target = await fixture(null),
    support = await fixture(["SUPPORT"]);
  const mfa = await enroll(support.cookie);
  const result = (
    await post(
      "/v1/staff/admin/accounts/search",
      { query: target.email },
      mfa.cookie,
    ).expect(200)
  ).body;
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].id, target.id);
  assert.ok(result.accounts[0].last_sign_in_at);
  assert.ok(!JSON.stringify(result).includes("password_hash"));
  assert.ok(!JSON.stringify(result).includes("token_hash"));
  const audits = (
    await database.pool.query(
      "SELECT metadata FROM audit_events WHERE event_type='ADMIN_ACCOUNTS_INSPECTED'",
    )
  ).rows;
  assert.ok(!JSON.stringify(audits).includes(target.email));
  await post(
    "/v1/staff/admin/accounts/search",
    { query: "", status: "ACTIVE" },
    mfa.cookie,
  ).expect(400);
  await assignStaff(
    database,
    support.email,
    null,
    "Revoke fictional staff assignment",
    "test operator",
  );
  await get("/v1/staff/admin/overview", mfa.cookie).expect(403);
  await post(
    "/v1/staff/admin/accounts/search",
    { query: "" },
    mfa.cookie,
  ).expect(403);
});
