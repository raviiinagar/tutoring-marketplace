import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { createServer as createHttpServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { Database, migrate } from "../src/database.js";
import { decrypt } from "../src/security.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let app: INestApplication;
let database: Database;
let config: Config;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let clock = new Date();
const now = () => clock;
const origin = "http://localhost:3000";
const password = "Google-sign-in-password-321!";
const clientId = "fictional-client.apps.googleusercontent.com";
const server = () => app.getHttpServer();
const post = (path: string, body: unknown, cookie?: string) => {
  const call = request(server()).post(path).set("Origin", origin).send(body as object);
  return cookie ? call.set("Cookie", cookie) : call;
};
const get = (path: string, cookie?: string) => {
  const call = request(server()).get(path);
  return cookie ? call.set("Cookie", cookie) : call;
};

// A fictional Google token endpoint on loopback; GOOGLE_TOKEN_URL can only be overridden outside production.
let tokenServer: Server;
let tokenReply: () => { status: number; body: unknown } = () => ({ status: 500, body: {} });
const tokenRequests: URLSearchParams[] = [];

before(async () => {
  tokenServer = createHttpServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      tokenRequests.push(new URLSearchParams(raw));
      const reply = tokenReply();
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((done) => tokenServer.listen(0, "127.0.0.1", done));
  const tokenPort = (tokenServer.address() as { port: number }).port;
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done, fail) => probe.close((error) => (error ? fail(error) : done())));
  const directory = resolve(".local/tests", randomUUID());
  config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/google_sign_in_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: "fictional-google-secret",
    GOOGLE_TOKEN_URL: `http://127.0.0.1:${tokenPort}/token`,
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
  tokenServer?.close();
  await app?.close();
  await database?.close();
  await cluster?.stop();
});

async function account() {
  const email = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", { display_name: "Fictional member", email, password }).expect(202);
  const row = (await database.pool.query("SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)", [email])).rows[0];
  const url = decrypt<{ verification_url: string }>(row.encrypted_payload, config.authSecret).verification_url;
  await post("/v1/auth/verifications", { token: new URL(url).hash.slice(7) }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(200);
  return { email, id: login.body.user.id as string };
}

const jwt = (claims: Record<string, unknown>) =>
  [JSON.stringify({ alg: "RS256" }), JSON.stringify(claims), "signature"].map((part) => Buffer.from(part).toString("base64url")).join(".");
type Claims = Record<string, unknown>;
const cookies = (response: request.Response) => (response.headers["set-cookie"] as unknown as string[] | undefined) ?? [];

/** One Google sign-in: start, the fictional token reply, then the callback. */
async function googleSignIn(
  sub: string,
  email: string,
  options: { returnTo?: string; claims?: (base: Claims) => Claims; query?: Record<string, string>; skipBinding?: boolean } = {},
) {
  const start = await get("/v1/auth/google/start" + (options.returnTo ? "?return_to=" + encodeURIComponent(options.returnTo) : "")).expect(302);
  const location = new URL(start.headers.location);
  const binding = cookies(start).find((c) => c.startsWith("tm_google_signin="))!.split(";")[0];
  const base: Claims = {
    iss: "https://accounts.google.com",
    aud: clientId,
    exp: Math.floor(clock.getTime() / 1000) + 3600,
    nonce: location.searchParams.get("nonce"),
    sub,
    email,
    email_verified: true,
    name: "Fictional Google Member",
  };
  tokenReply = () => ({ status: 200, body: { id_token: jwt(options.claims ? options.claims(base) : base) } });
  const params = new URLSearchParams({ state: location.searchParams.get("state")!, code: "fictional-code", ...(options.query ?? {}) });
  const call = request(server()).get("/v1/auth/google/callback?" + params);
  const callback = await (options.skipBinding ? call : call.set("Cookie", binding)).expect(302);
  const session = cookies(callback).find((c) => c.startsWith("tm_session="));
  return { location, redirect: callback.headers.location as string, cookie: session?.split(";")[0], params, binding };
}
const me = async (cookie: string) => (await get("/v1/me", cookie).expect(200)).body.user;

test("a new Google account signs in with PKCE, state and nonce checks, and returns to where it started", async () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "test", DATABASE_URL: config.databaseUrl, AUTH_SECRET: config.authSecret, WEB_ORIGIN: origin, GOOGLE_CLIENT_ID: clientId }),
    /GOOGLE_CLIENT_SECRET/,
  );
  assert.deepEqual((await get("/v1/auth/providers").expect(200)).body, { google: true });
  const email = randomUUID() + "@example.test";
  const first = await googleSignIn("google-sub-new-" + email, email, { returnTo: "/tutors?subject_id=subject-physics" });
  assert.equal(first.location.origin + first.location.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(first.location.searchParams.get("client_id"), clientId);
  assert.equal(first.location.searchParams.get("redirect_uri"), origin + "/v1/auth/google/callback");
  assert.equal(first.location.searchParams.get("code_challenge_method"), "S256");
  assert.equal(first.location.searchParams.get("scope"), "openid email profile");
  // The verifier sent to Google matches the challenge in the consent URL; the secret stays on the server.
  const exchange = tokenRequests.at(-1)!;
  assert.equal(createHash("sha256").update(exchange.get("code_verifier")!).digest("base64url"), first.location.searchParams.get("code_challenge"));
  assert.equal(exchange.get("client_secret"), "fictional-google-secret");
  assert.equal(exchange.get("redirect_uri"), origin + "/v1/auth/google/callback");
  assert.equal(first.redirect, "/tutors?subject_id=subject-physics");
  assert.ok(first.cookie);
  const user = await me(first.cookie!);
  assert.equal(user.email, email);
  assert.equal(user.email_verified, true);
  assert.equal(user.display_name, "Fictional Google Member");
  const registered = (await database.pool.query("SELECT metadata FROM audit_events WHERE user_id=$1 AND event_type='ACCOUNT_REGISTERED'", [user.id])).rows;
  assert.deepEqual(registered.map((r) => r.metadata), [{ method: "GOOGLE" }]);
  // Signing in again finds the same account, and a used state cannot be replayed.
  const again = await googleSignIn("google-sub-new-" + email, email);
  assert.equal((await me(again.cookie!)).id, user.id);
  assert.equal(again.redirect, "/account");
  const replay = await request(server()).get("/v1/auth/google/callback?" + again.params).set("Cookie", again.binding).expect(302);
  assert.equal(replay.headers.location, "/auth/signin?google=failed");
});

test("Google links to an existing account with the same email, and password sign-in keeps working", async () => {
  const existing = await account();
  const linked = await googleSignIn("google-sub-link-" + existing.email, existing.email);
  assert.equal((await me(linked.cookie!)).id, existing.id);
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM user_identities WHERE user_id=$1", [existing.id])).rows[0].n, 1);
  await post("/v1/auth/sessions", { email: existing.email, password }).expect(200);
  // A different Google account cannot take over an account that is already linked.
  const other = await googleSignIn("google-sub-other-" + existing.email, existing.email);
  assert.equal(other.redirect, "/auth/signin?google=account");
  assert.equal(other.cookie, undefined);
  // An unverified registration becomes verified through Google's confirmed address.
  const pendingEmail = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", { display_name: "Fictional pending member", email: pendingEmail, password }).expect(202);
  const pending = await googleSignIn("google-sub-pending-" + pendingEmail, pendingEmail);
  assert.equal((await me(pending.cookie!)).email_verified, true);
});

test("forged, foreign, unverified, cancelled and disabled sign-ins are refused without a session", async () => {
  const email = randomUUID() + "@example.test";
  const refused = (outcome: Awaited<ReturnType<typeof googleSignIn>>, reason: string) => {
    assert.equal(outcome.redirect, "/auth/signin?google=" + reason);
    assert.equal(outcome.cookie, undefined);
  };
  refused(await googleSignIn("sub-a-" + email, email, { skipBinding: true }), "failed");
  refused(await googleSignIn("sub-a-" + email, email, { claims: (c) => ({ ...c, nonce: "another-nonce" }) }), "failed");
  refused(await googleSignIn("sub-a-" + email, email, { claims: (c) => ({ ...c, aud: "someone-else.apps.googleusercontent.com" }) }), "failed");
  refused(await googleSignIn("sub-a-" + email, email, { claims: (c) => ({ ...c, iss: "https://evil.example" }) }), "failed");
  refused(await googleSignIn("sub-a-" + email, email, { claims: (c) => ({ ...c, exp: Math.floor(clock.getTime() / 1000) - 10 }) }), "failed");
  refused(await googleSignIn("sub-a-" + email, email, { claims: (c) => ({ ...c, email_verified: false }) }), "account");
  refused(await googleSignIn("sub-a-" + email, email, { query: { error: "access_denied" } }), "cancelled");
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM users WHERE email=$1", [email])).rows[0].n, 0);
  // Other origins, API paths and sign-in pages are never used as the return address.
  for (const target of ["//evil.example/path", "https://evil.example", "/v1/me", "/auth/signin"]) {
    const outcome = await googleSignIn("sub-return-" + email, email, { returnTo: target });
    assert.equal(outcome.redirect, "/account");
  }
  const disabled = await account();
  await database.pool.query("UPDATE users SET status='DISABLED' WHERE id=$1", [disabled.id]);
  refused(await googleSignIn("sub-disabled-" + disabled.email, disabled.email), "account");
});
