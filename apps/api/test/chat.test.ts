import {grantTutorProFixture} from '../../../scripts/tutor-pro-fixture.js';
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
import { decrypt } from "../src/security.js";
import { assignStaff } from "../src/staff.js";
import { totp } from "../src/totp.js";
import { grantContactFixture } from "../../../scripts/contact-request-fixture.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let app: INestApplication;
let database: Database;
let config: Config;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let base: string;
const origin = "http://localhost:3000";
const password = "Fictional-chat-password-321!";
let clock = new Date();
const now = () => clock;
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
async function openApp() {
  app = await createApplication(config, database, now);
  await app.listen(0, "127.0.0.1");
  base = "http://127.0.0.1:" + app.getHttpServer().address().port;
}
before(async () => {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  const directory = resolve(".local/tests", randomUUID());
  config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/chat_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
    GUARDIAN_VERIFICATION_MODE: "test",
  });
  cluster = await startDatabase(
    config.databaseUrl,
    join(directory, "postgres"),
  );
  database = new Database(config.databaseUrl);
  await migrate(database);
  await openApp();
});
after(async () => {
  await app?.close();
  await database?.close();
  await cluster?.stop();
});
beforeEach(() => {
  clock = new Date(clock.getTime() + 2 * 3600000);
});
async function account() {
  const email = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", {
    display_name: "Fictional adult",
    email,
    password,
  }).expect(202);
  // Fixture setup reads the external mail outbox; feature assertions use public interfaces only.
  const mail = (
    await database.pool.query(
      "SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)",
      [email],
    )
  ).rows[0];
  const link = decrypt<{ verification_url: string }>(
    mail.encrypted_payload,
    config.authSecret,
  ).verification_url;
  await post("/v1/auth/verifications", {
    token: new URL(link).hash.slice(7),
  }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(
    200,
  );
  return {
    email,
    id: login.body.user.id as string,
    cookie: login.headers["set-cookie"][0] as string,
  };
}
async function staff(
  scopes: Array<"TRUST" | "SUPPORT" | "FINANCE"> = ["TRUST"],
) {
  const user = await account();
  await assignStaff(
    database,
    user.email,
    scopes,
    "Fictional chat verification fixture",
    "test operator",
  );
  const enrollment = (
    await post("/v1/staff/mfa/enrollments", { password }, user.cookie).expect(
      200,
    )
  ).body;
  const elevated = await post(
    "/v1/staff/mfa/confirmations",
    { code: totp(enrollment.secret, clock) },
    user.cookie,
  ).expect(200);
  return {
    ...user,
    cookie:
      user.cookie.split(";")[0] +
      "; " +
      (elevated.headers["set-cookie"][0] as string).split(";")[0],
  };
}
async function connection(state: "ACTIVE" | "MATCHING" = "ACTIVE") {
  const owner = await account();
  const teacher = await account();
  const reviewer = await staff();
  const learner = (
    await post(
      "/v1/me/learners/adult",
      {
        alias: "Fictional learner",
        learning_requirements: "Learn Physics using worked examples",
        adult_confirmed: true,
      },
      owner.cookie,
    ).expect(201)
  ).body.profile;
  await post("/v1/me/roles", { roles: ["TUTOR"] }, teacher.cookie).expect(200);
  await post(
    "/v1/me/tutor",
    {
      display_name: "Fictional chat Tutor",
      biography:
        "I explain school Physics through patient worked examples and practice.",
      birth_date: "1990-01-01",
      adult_confirmed: true,
    },
    teacher.cookie,
  ).expect(200);
  for (const kind of ["IDENTITY", "QUALIFICATION"]) {
    const evidence = (
      await post(
        "/v1/me/tutor/evidence",
        {
          media_type: "application/pdf",
          data: Buffer.from(
            "%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n",
          ).toString("base64"),
        },
        teacher.cookie,
      ).expect(201)
    ).body.evidence.id;
    await post(
      "/v1/me/tutor/claims",
      {
        kind,
        description: "Fictional " + kind + " evidence for chat fixture",
        evidence_id: evidence,
        ...(kind === "QUALIFICATION" ? { subject_id: "subject-physics" } : {}),
      },
      teacher.cookie,
    ).expect(201);
  }
  await post("/v1/me/tutor/submissions", {}, teacher.cookie).expect(200);
  const claims = (await get("/v1/me/tutor", teacher.cookie).expect(200)).body
    .claims;
  for (const claim of claims)
    await post(
      "/v1/staff/tutor-claims/" + claim.id + "/reviews",
      {
        outcome: "APPROVE",
        checked_item: "Fictional identity or Physics evidence checked",
        reason: "Approve fictional chat participant evidence",
        adult_identity_confirmed: true,
        expires_at: new Date(clock.getTime() + 86400000).toISOString(),
      },
      reviewer.cookie,
    ).expect(200);
  const offer = {
    title: "Physics for a private chat fixture",
    description:
      "School Physics explained through clear worked examples and structured practice.",
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
  await grantTutorProFixture(database,config,teacher.email,clock);
  let listing = (
    await post("/v1/me/listings", offer, teacher.cookie).expect(201)
  ).body.listing;
  listing = (
    await post(
      "/v1/me/listings/" + listing.id + "/actions/SUBMIT",
      { revision: listing.revision },
      teacher.cookie,
    ).expect(200)
  ).body.listing;
  listing = (
    await post(
      "/v1/staff/listings/" + listing.id + "/reviews",
      {
        revision: listing.revision,
        outcome: "APPROVE",
        reason: "Approve exact fictional chat teaching offer",
      },
      reviewer.cookie,
    ).expect(200)
  ).body.listing;
  await grantContactFixture(database, config, owner.email, state, clock);
  const enquiry = (
    await post(
      "/v1/me/contact-requests",
      {
        request_key: randomUUID(),
        listing_id: listing.id,
        listing_revision: listing.revision,
        learner_id: learner.id,
        subject_id: "subject-physics",
        teaching_mode: "ONLINE",
        learning_requirements: "Explain Physics mechanics with worked examples",
        preferred_times: "Tuesday evenings, IST",
      },
      owner.cookie,
    ).expect(200)
  ).body.request;
  const accepted = (
    await post(
      "/v1/me/tutor-requests/" + enquiry.id + "/decisions",
      { decision: "ACCEPT" },
      teacher.cookie,
    ).expect(200)
  ).body;
  return {
    owner,
    teacher,
    reviewer,
    learner,
    listing,
    id: accepted.connection_id as string,
  };
}
const send = (id: string, body: unknown, cookie?: string) =>
  post("/v1/me/connections/" + id + "/messages", body, cookie);
const history = (
  id: string,
  cookie?: string,
  query: Record<string, number> = {},
) => get("/v1/me/connections/" + id + "/messages", cookie).query(query);

test("an acknowledged message remains visible to both adult participants after API restart", async () => {
  const s = await connection();
  const clientId = randomUUID();
  const sent = (
    await send(
      s.id,
      {
        client_message_id: clientId,
        text: "Can we work through Newton’s laws on Tuesday?",
      },
      s.owner.cookie,
    ).expect(201)
  ).body.message;
  assert.equal(sent.sequence, 1);
  assert.equal(sent.your_message, true);
  assert.equal(sent.sender_role, "PAYER");
  await app.close();
  await openApp();
  const received = (await history(s.id, s.teacher.cookie).expect(200)).body;
  assert.equal(received.messages.length, 1);
  assert.equal(
    received.messages[0].text,
    "Can we work through Newton’s laws on Tuesday?",
  );
  assert.equal(received.messages[0].sequence, 1);
  assert.equal(received.messages[0].your_message, false);
  assert.equal(received.unread_count, 1);
  assert.equal(
    (await history(s.id, s.owner.cookie)).body.messages[0].client_message_id,
    clientId,
  );
});

test("simultaneous retries share one immutable message and another sender can reuse its client ID", async () => {
  const s = await connection();
  const body = {
    client_message_id: randomUUID(),
    text: "Please explain momentum with a worked example.",
  };
  const replies = await Promise.all([
    send(s.id, body, s.owner.cookie).expect(201),
    send(s.id, body, s.owner.cookie).expect(201),
  ]);
  assert.equal(
    replies[0].body.message.sequence,
    replies[1].body.message.sequence,
  );
  assert.equal(replies.filter((reply) => reply.body.replayed).length, 1);
  await send(
    s.id,
    { ...body, text: "A changed message with the same identifier" },
    s.owner.cookie,
  ).expect(409);
  const response = (
    await send(
      s.id,
      { ...body, text: "Yes, let us start with a simple collision." },
      s.teacher.cookie,
    ).expect(201)
  ).body.message;
  assert.equal(response.sequence, 2);
  assert.equal(response.sender_role, "TUTOR");
  const messages = (await history(s.id, s.owner.cookie).expect(200)).body
    .messages;
  assert.deepEqual(
    messages.map((message: { sequence: number }) => message.sequence),
    [1, 2],
  );
  assert.equal(messages[0].text, body.text);
});

test("unread messages exclude your own sends and persisted read positions never move backwards", async () => {
  const s = await connection();
  await send(
    s.id,
    { client_message_id: randomUUID(), text: "First Tutor message" },
    s.teacher.cookie,
  ).expect(201);
  await send(
    s.id,
    { client_message_id: randomUUID(), text: "Learner reply" },
    s.owner.cookie,
  ).expect(201);
  await send(
    s.id,
    { client_message_id: randomUUID(), text: "Second Tutor message" },
    s.teacher.cookie,
  ).expect(201);
  assert.equal((await history(s.id, s.owner.cookie)).body.unread_count, 2);
  assert.equal(
    (await get("/v1/me/connections", s.owner.cookie)).body.connections.find(
      (c: { id: string }) => c.id === s.id,
    ).unread_count,
    2,
  );
  const mark = (sequence: number) =>
    post(
      "/v1/me/connections/" + s.id + "/read-position",
      { sequence },
      s.owner.cookie,
    );
  const first = (await mark(1).expect(200)).body;
  assert.equal(first.read_sequence, 1);
  assert.equal(first.unread_count, 1);
  await mark(3).expect(200);
  assert.equal((await mark(1).expect(200)).body.read_sequence, 3);
  await mark(4).expect(400);
  await app.close();
  await openApp();
  const current = (await history(s.id, s.owner.cookie)).body;
  assert.equal(current.read_sequence, 3);
  assert.equal(current.unread_count, 0);
  const peer = (await history(s.id, s.teacher.cookie)).body;
  assert.equal(peer.peer_read_sequence, 3);
  assert.equal(peer.unread_count, 1);
});

test("bounded history recovers every missing sequence and loads earlier messages in order", async () => {
  const s = await connection();
  for (let n = 1; n <= 7; n++)
    await send(
      s.id,
      { client_message_id: randomUUID(), text: "Worked example " + n },
      n % 2 ? s.owner.cookie : s.teacher.cookie,
    ).expect(201);
  const latest = (await history(s.id, s.owner.cookie, { limit: 3 }).expect(200))
    .body;
  assert.deepEqual(
    latest.messages.map((m: { sequence: number }) => m.sequence),
    [5, 6, 7],
  );
  assert.equal(latest.has_older, true);
  const earlier = (
    await history(s.id, s.owner.cookie, { before: 5, limit: 3 }).expect(200)
  ).body;
  assert.deepEqual(
    earlier.messages.map((m: { sequence: number }) => m.sequence),
    [2, 3, 4],
  );
  const catchup = (
    await history(s.id, s.owner.cookie, { after: 1, limit: 3 }).expect(200)
  ).body;
  assert.deepEqual(
    catchup.messages.map((m: { sequence: number }) => m.sequence),
    [2, 3, 4],
  );
  assert.equal(catchup.has_more, true);
  assert.equal(catchup.next_after, 4);
  const rest = (
    await history(s.id, s.owner.cookie, {
      after: catchup.next_after,
      limit: 3,
    }).expect(200)
  ).body;
  assert.deepEqual(
    rest.messages.map((m: { sequence: number }) => m.sequence),
    [5, 6, 7],
  );
  assert.equal(rest.has_more, false);
  await history(s.id, s.owner.cookie, { after: 8 }).expect(400);
  await history(s.id, s.owner.cookie, { before: 5, after: 1 }).expect(400);
  await history(s.id, s.owner.cookie, { limit: 101 }).expect(400);
});

async function stream(id: string, cookie: string, after = 0) {
  const abort = new AbortController();
  const response = await fetch(
    base + "/v1/me/connections/" + id + "/events?after=" + after,
    { headers: { Cookie: cookie, Origin: origin }, signal: abort.signal },
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") || "",
    /text\/event-stream/,
  );
  const reader = response.body!.getReader();
  let buffer = "";
  const decoder = new TextDecoder();
  async function next(name: string): Promise<any> {
    const timer = setTimeout(() => abort.abort(), 10000);
    try {
      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (frame.includes("event: " + name + "\n"))
            return JSON.parse(
              frame
                .split("\n")
                .find((line) => line.startsWith("data: "))!
                .slice(6),
            );
          continue;
        }
        const part = await reader.read();
        if (part.done) throw new Error("Stream ended before " + name);
        buffer += decoder.decode(part.value, { stream: true });
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return { next, close: () => abort.abort() };
}

test("realtime replays missed committed messages and closes when current Connection authority is revoked", async () => {
  const s = await connection();
  await send(
    s.id,
    { client_message_id: randomUUID(), text: "Before connection" },
    s.teacher.cookie,
  ).expect(201);
  const first = await stream(s.id, s.owner.cookie);
  try {
    const frame = await first.next("state");
    assert.deepEqual(
      frame.messages.map((m: { sequence: number }) => m.sequence),
      [1],
    );
  } finally {
    first.close();
  }
  await send(
    s.id,
    { client_message_id: randomUUID(), text: "Sent while disconnected" },
    s.teacher.cookie,
  ).expect(201);
  const resumed = await stream(s.id, s.owner.cookie, 1);
  try {
    assert.equal(
      (await resumed.next("state")).messages[0].text,
      "Sent while disconnected",
    );
    await send(
      s.id,
      { client_message_id: randomUUID(), text: "Live message" },
      s.teacher.cookie,
    ).expect(201);
    let frame;
    do {
      frame = await resumed.next("state");
    } while (!frame.messages.length);
    assert.deepEqual(
      frame.messages.map((m: { sequence: number }) => m.sequence),
      [3],
    );
    await post(
      "/v1/staff/listings/" + s.listing.id + "/safety",
      {
        revision: s.listing.revision,
        action: "SUSPEND",
        reason: "Restrict fictional chat access for safety review",
      },
      s.reviewer.cookie,
    ).expect(200);
    const revoked = await resumed.next("access-revoked");
    assert.deepEqual(revoked, { code: "ACCESS_UNAVAILABLE" });
    await history(s.id, s.owner.cookie).expect(403);
    await send(
      s.id,
      { client_message_id: randomUUID(), text: "Must not send" },
      s.owner.cookie,
    ).expect(403);
  } finally {
    resumed.close();
  }
});

test("chat is private, text-only, and bounded against repeated new-message submissions", async () => {
  const s = await connection();
  const body = {
    client_message_id: randomUUID(),
    text: "A private worked example",
  };
  await history(s.id).expect(401);
  await history(s.id, s.reviewer.cookie).expect(404);
  await send(s.id, body, s.reviewer.cookie).expect(404);
  await get("/v1/me/connections/" + s.id + "/events", s.reviewer.cookie).expect(
    404,
  );
  await get("/v1/me/connections/" + s.id + "/events", s.owner.cookie)
    .set("Origin", "https://foreign.example")
    .expect(403);
  await send(
    s.id,
    { ...body, attachment: "private.pdf" },
    s.owner.cookie,
  ).expect(400);
  await send(s.id, { ...body, sender_id: s.teacher.id }, s.owner.cookie).expect(
    400,
  );
  for (const text of ["", " ", "x".repeat(2001), "invalid\u0000text"])
    await send(s.id, { ...body, text }, s.owner.cookie).expect(400);
  await send(s.id, body, s.owner.cookie).expect(201);
  for (let n = 1; n < 60; n++)
    await send(
      s.id,
      { client_message_id: randomUUID(), text: "Example " + n },
      s.owner.cookie,
    ).expect(201);
  await send(
    s.id,
    { client_message_id: randomUUID(), text: "Over message limit" },
    s.owner.cookie,
  ).expect(429);
  const replay = (await send(s.id, body, s.owner.cookie).expect(201)).body;
  assert.equal(replay.replayed, true);
  assert.equal(replay.message.sequence, 1);
  assert.equal((await history(s.id, s.teacher.cookie)).body.last_sequence, 60);
  const pending = await connection("MATCHING");
  await history(pending.id, pending.owner.cookie).expect(403);
  await send(pending.id, body, pending.owner.cookie).expect(403);
  await request(app.getHttpServer())
    .delete("/v1/auth/sessions/current")
    .set("Origin", origin)
    .set("Content-Type", "application/json")
    .set("Cookie", s.owner.cookie)
    .send({})
    .expect(204);
  await history(s.id, s.owner.cookie).expect(401);
});

test("participant blocking closes live chat and denies both directions until each owner unblocks", async () => {
  const s = await connection();
  const url = "/v1/me/connections/" + s.id + "/safety";
  await send(
    s.id,
    { client_message_id: randomUUID(), text: "A message before blocking" },
    s.owner.cookie,
  ).expect(201);
  const live = await stream(s.id, s.teacher.cookie);
  try {
    await live.next("state");
    await post(url + "/block", { blocked: true }, s.owner.cookie).expect(200);
    assert.deepEqual(await live.next("access-revoked"), {
      code: "ACCESS_UNAVAILABLE",
    });
    for (const user of [s.owner, s.teacher]) {
      await history(s.id, user.cookie).expect(403);
      await get("/v1/me/connections/" + s.id + "/contacts", user.cookie).expect(
        403,
      );
      await send(
        s.id,
        { client_message_id: randomUUID(), text: "Not deliverable" },
        user.cookie,
      ).expect(403);
    }
    assert.equal(
      (await get(url, s.owner.cookie).expect(200)).body.blocked_by_you,
      true,
    );
    await post(url + "/block", { blocked: true }, s.teacher.cookie).expect(200);
    await post(url + "/block", { blocked: false }, s.owner.cookie).expect(200);
    await history(s.id, s.owner.cookie).expect(403);
    await post(url + "/block", { blocked: false }, s.teacher.cookie).expect(
      200,
    );
    await history(s.id, s.owner.cookie).expect(200);
    await post(url + "/block", { blocked: true }, s.reviewer.cookie).expect(
      404,
    );
    await get(url, s.reviewer.cookie).expect(404);
  } finally {
    live.close();
  }
});

test("reports preserve only selected messages and Trust case access requires scoped MFA and an audited purpose", async () => {
  const s = await connection();
  const support = await staff(["SUPPORT"]);
  await send(
    s.id,
    { client_message_id: randomUUID(), text: "Unreported private discussion" },
    s.teacher.cookie,
  ).expect(201);
  await send(
    s.id,
    {
      client_message_id: randomUUID(),
      text: "Fictional message reported for investigation",
    },
    s.teacher.cookie,
  ).expect(201);
  const url = "/v1/me/connections/" + s.id + "/safety";
  await post(url + "/block", { blocked: true }, s.owner.cookie).expect(200);
  const body = {
    request_key: randomUUID(),
    category: "HARASSMENT",
    description: "Please investigate this fictional communication.",
    message_sequences: [2],
  };
  const replies = await Promise.all([
    post(url + "/reports", body, s.owner.cookie).expect(201),
    post(url + "/reports", body, s.owner.cookie).expect(201),
  ]);
  const id = replies[0].body.case.id;
  assert.equal(replies[1].body.case.id, id);
  await post(
    url + "/reports",
    { ...body, description: "Changed report text for the same identifier" },
    s.owner.cookie,
  ).expect(409);
  await post(
    url + "/reports",
    { ...body, request_key: randomUUID(), message_sequences: [999] },
    s.owner.cookie,
  ).expect(400);
  await post(url + "/reports", body, s.reviewer.cookie).expect(404);
  const inspection = "/v1/staff/safety-cases/" + id + "/inspections";
  const purpose = {
    reason: "Investigate the selected fictional harassment report",
  };
  await post(inspection, purpose).expect(401);
  await post(inspection, purpose, support.cookie).expect(403);
  await post(inspection, purpose, s.owner.cookie).expect(403);
  await post(inspection, {}, s.reviewer.cookie).expect(400);
  const reviewed = (
    await post(inspection, purpose, s.reviewer.cookie).expect(200)
  ).body.case;
  assert.equal(reviewed.evidence.messages.length, 1);
  assert.equal(reviewed.evidence.messages[0].sequence, 2);
  assert.equal(
    reviewed.evidence.messages[0].text,
    "Fictional message reported for investigation",
  );
  assert.ok(
    !JSON.stringify(reviewed).includes("Unreported private discussion"),
  );
  const queue = (
    await get("/v1/staff/safety-cases", s.reviewer.cookie).expect(200)
  ).body;
  assert.ok(!JSON.stringify(queue).includes(body.description));
  assert.ok(!JSON.stringify(queue).includes("reported for investigation"));
  const own = (await get("/v1/me/safety", s.owner.cookie).expect(200)).body;
  assert.equal(
    own.cases.find((c: { id: string }) => c.id === id).status,
    "OPEN",
  );
  const unrelated = (await get("/v1/me/safety", s.teacher.cookie).expect(200))
    .body;
  assert.ok(!unrelated.cases.some((c: { id: string }) => c.id === id));
});

test("case sanctions compose across cases, hide suspended supply and leave safety status inspectable by affected adults", async () => {
  const s = await connection();
  const report = async () =>
    (
      await post(
        "/v1/me/connections/" + s.id + "/safety/reports",
        {
          request_key: randomUUID(),
          category: "FRAUD",
          description: "Review this fictional tutoring safety concern.",
          message_sequences: [],
        },
        s.owner.cookie,
      ).expect(201)
    ).body.case;
  const a = await report(),
    b = await report();
  const act = (id: string, revision: number, operation: string) =>
    post(
      "/v1/staff/safety-cases/" + id + "/actions",
      {
        revision,
        operation,
        reason: "Public fictional safety decision for the affected adult",
      },
      s.reviewer.cookie,
    );
  await act(a.id, 1, "RESTRICT_CONNECTION").expect(200);
  await history(s.id, s.owner.cookie).expect(403);
  await act(b.id, 1, "RESTRICT_CONNECTION").expect(200);
  await act(a.id, 2, "LIFT_CONNECTION").expect(200);
  await history(s.id, s.owner.cookie).expect(403);
  await act(b.id, 2, "LIFT_CONNECTION").expect(200);
  await history(s.id, s.owner.cookie).expect(200);
  await act(a.id, 3, "RESTRICT_LISTING").expect(200);
  await get("/v1/discovery/" + s.listing.id).expect(404);
  await get("/v1/listings/" + s.listing.id).expect(404);
  await history(s.id, s.owner.cookie).expect(403);
  await act(a.id, 4, "LIFT_LISTING").expect(200);
  await get("/v1/discovery/" + s.listing.id).expect(404);
  await history(s.id, s.owner.cookie).expect(200);
  const offer = (await get("/v1/me/listings", s.teacher.cookie).expect(200))
    .body.listings[0];
  assert.equal(offer.status, "PAUSED");
  await post(
    "/v1/me/listings/" + offer.id + "/actions/RESUME",
    { revision: offer.revision },
    s.teacher.cookie,
  ).expect(200);
  await act(a.id, 5, "RESTRICT_ACCOUNT").expect(200);
  await get("/v1/discovery/" + s.listing.id).expect(404);
  await get("/v1/me/listings", s.teacher.cookie).expect(403);
  await history(s.id, s.owner.cookie).expect(403);
  const affected = (await get("/v1/me/safety", s.teacher.cookie).expect(200))
    .body;
  assert.ok(
    affected.cases.some(
      (c: { id: string; relationship: string }) =>
        c.id === a.id && c.relationship === "SUBJECT",
    ),
  );
  assert.ok(
    affected.restrictions.some(
      (r: { target_type: string; lifted_at: string | null }) =>
        r.target_type === "ACCOUNT" && r.lifted_at === null,
    ),
  );
  await act(a.id, 6, "DISMISS").expect(409);
  await act(a.id, 6, "LIFT_ACCOUNT").expect(200);
  await get("/v1/me/listings", s.teacher.cookie).expect(200);
  await act(a.id, 7, "RESOLVE").expect(200);
  await act(a.id, 7, "RESTRICT_ACCOUNT").expect(409);
  await post(
    "/v1/staff/safety-cases/" + a.id + "/actions",
    {
      revision: 8,
      operation: "RESTRICT_ACCOUNT",
      reason: "Invalid arbitrary account target",
      target_id: s.owner.id,
    },
    s.reviewer.cookie,
  ).expect(400);
});

test("restricted adults can lodge an idempotent private appeal without regaining marketplace permission", async () => {
  const s = await connection();
  const report = (
    await post(
      "/v1/me/connections/" + s.id + "/safety/reports",
      {
        request_key: randomUUID(),
        category: "OTHER",
        description: "Fictional case for an appeal entry test.",
        message_sequences: [],
      },
      s.owner.cookie,
    ).expect(201)
  ).body.case;
  const url = "/v1/me/safety-cases/" + report.id + "/appeals";
  const body = {
    request_key: randomUUID(),
    description: "Please reconsider this fictional safety restriction.",
  };
  await post(url, body, s.owner.cookie).expect(409);
  await post(
    "/v1/staff/safety-cases/" + report.id + "/actions",
    {
      revision: 1,
      operation: "RESTRICT_ACCOUNT",
      reason: "Fictional restriction pending review of a report",
    },
    s.reviewer.cookie,
  ).expect(200);
  await get("/v1/me/listings", s.teacher.cookie).expect(403);
  const first = (await post(url, body, s.teacher.cookie).expect(201)).body
    .appeal;
  const retry = (await post(url, body, s.teacher.cookie).expect(201)).body
    .appeal;
  assert.equal(retry.id, first.id);
  assert.equal(retry.status, "PENDING_REVIEW");
  await post(
    url,
    {
      ...body,
      description: "Changed details for a repeated appeal identifier",
    },
    s.teacher.cookie,
  ).expect(409);
  await post(url, body, s.reviewer.cookie).expect(404);
  const own = (await get("/v1/me/safety", s.teacher.cookie).expect(200)).body;
  assert.equal(own.appeals[0].id, first.id);
  assert.ok(
    !JSON.stringify(own).includes("Fictional case for an appeal entry test."),
  );
  const inspected = (
    await post(
      "/v1/staff/safety-cases/" + report.id + "/inspections",
      { reason: "Read the specifically submitted fictional appeal" },
      s.reviewer.cookie,
    ).expect(200)
  ).body.case;
  assert.equal(inspected.appeals[0].description, body.description);
  await history(s.id, s.teacher.cookie).expect(403);
});

test("a safety suspension racing Tutor acceptance denies subsequent contact release and stale-offer requests", async () => {
  const s = await connection();
  const input = {
    request_key: randomUUID(),
    listing_id: s.listing.id,
    listing_revision: s.listing.revision,
    learner_id: s.learner.id,
    subject_id: "subject-physics",
    teaching_mode: "ONLINE",
    learning_requirements:
      "Fictional enquiry used to exercise the safety race.",
    preferred_times: "Saturday mornings, IST",
  };
  const pending = (
    await post("/v1/me/contact-requests", input, s.owner.cookie).expect(200)
  ).body.request;
  const report = (
    await post(
      "/v1/me/contact-requests/" + pending.id + "/safety/reports",
      {
        request_key: randomUUID(),
        category: "OTHER",
        description: "Investigate this specific fictional pending enquiry.",
        message_sequences: [],
      },
      s.teacher.cookie,
    ).expect(201)
  ).body.case;
  const evidence = (
    await post(
      "/v1/staff/safety-cases/" + report.id + "/inspections",
      { reason: "Review this specifically reported pending enquiry" },
      s.reviewer.cookie,
    ).expect(200)
  ).body.case.evidence;
  assert.equal(
    evidence.initial_request.learning_requirements,
    input.learning_requirements,
  );
  const [restricted, accepted] = await Promise.all([
    post(
      "/v1/staff/safety-cases/" + report.id + "/actions",
      {
        revision: 1,
        operation: "RESTRICT_LISTING",
        reason: "Temporarily restrict this offer during investigation",
      },
      s.reviewer.cookie,
    ),
    post(
      "/v1/me/tutor-requests/" + pending.id + "/decisions",
      { decision: "ACCEPT" },
      s.teacher.cookie,
    ),
  ]);
  assert.equal(restricted.status, 200);
  assert.ok([200, 403, 404, 409].includes(accepted.status));
  if (accepted.status === 200) {
    await get(
      "/v1/me/connections/" + accepted.body.connection_id + "/contacts",
      s.owner.cookie,
    ).expect(403);
    await history(accepted.body.connection_id, s.teacher.cookie).expect(403);
  }
  await get("/v1/discovery/" + s.listing.id).expect(404);
  await post(
    "/v1/me/contact-requests",
    { ...input, request_key: randomUUID() },
    s.owner.cookie,
  ).expect(404);
});

test("safety evidence and decisions reject unrelated IDs, self-review and revoked staff MFA", async () => {
  const s = await connection();
  const url = "/v1/me/connections/" + s.id + "/safety/reports";
  const body = {
    request_key: randomUUID(),
    category: "CHILD_SAFETY",
    description: "Fictional safety evidence isolation check.",
    message_sequences: [],
  };
  await post(
    url,
    { ...body, attachment: "private.pdf" },
    s.owner.cookie,
  ).expect(400);
  await post(
    "/v1/me/connections/" + randomUUID() + "/safety/reports",
    body,
    s.owner.cookie,
  ).expect(404);
  const report = (await post(url, body, s.owner.cookie).expect(201)).body.case;
  const path = "/v1/staff/safety-cases/" + report.id;
  const reason = { reason: "Check fictional case permission boundaries" };
  await post(
    path + "/inspections",
    reason,
    s.reviewer.cookie.split(";")[0],
  ).expect(403);
  await assignStaff(
    database,
    s.owner.email,
    ["TRUST"],
    "Fictional self-review fixture",
    "test operator",
  );
  const setup = (
    await post(
      "/v1/staff/mfa/enrollments",
      { password },
      s.owner.cookie,
    ).expect(200)
  ).body;
  const elevated = await post(
    "/v1/staff/mfa/confirmations",
    { code: totp(setup.secret, clock) },
    s.owner.cookie,
  ).expect(200);
  const ownMfa =
    s.owner.cookie.split(";")[0] +
    "; " +
    elevated.headers["set-cookie"][0].split(";")[0];
  await post(path + "/inspections", reason, ownMfa).expect(403);
  await request(app.getHttpServer())
    .delete("/v1/staff/sessions/current")
    .set("Origin", origin)
    .set("Content-Type", "application/json")
    .set("Cookie", s.reviewer.cookie)
    .send({})
    .expect(204);
  await post(path + "/inspections", reason, s.reviewer.cookie).expect(403);
  await post(
    path + "/actions",
    { revision: 1, operation: "RESTRICT_ACCOUNT", reason: reason.reason },
    s.reviewer.cookie,
  ).expect(403);
});
