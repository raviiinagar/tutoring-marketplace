import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { cpus, totalmem, platform, release } from "node:os";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { Database, migrate } from "../apps/api/src/database.js";
import { loadConfig } from "../apps/api/src/config.js";
import { createApplication } from "../apps/api/src/app.js";
import { PaymentEvents } from "../apps/api/src/payment-events.js";
import { notificationWorker } from "../apps/api/src/notifications.js";
import { MailWorker } from "../apps/api/src/mail.js";
import { RequestLifecycle } from "../apps/api/src/request-lifecycle.js";
import {
  pilotFixture,
  PilotProvider,
  signedCapture,
  type PilotAccount,
  type PilotPair,
} from "../tests/pilot/fixture.js";
// @ts-expect-error Local JavaScript helper.
import { startDatabase } from "./postgres.mjs";

async function main() {
  const sleep = (ms: number) =>
    new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));
  const seconds = Number(process.env.PILOT_LOAD_SECONDS || 180);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 300)
    throw new Error(
      "PILOT_LOAD_SECONDS must be 60..300 (keeps legitimate retries within payment rate limits)",
    );
  const directory = resolve(".local/pilot-load", randomUUID());
  await mkdir(directory, { recursive: true });
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((r) => probe.close(() => r()));
  // Deliberately ignore DATABASE_URL, AUTH_SECRET and provider credentials from the caller.
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://pilot_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/pilot_load_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: "http://localhost:3100",
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
    GUARDIAN_VERIFICATION_MODE: "test",
    PAYMENT_MODE: "razorpay_test",
    RAZORPAY_KEY_ID: "rzp_test_pilot",
    RAZORPAY_KEY_SECRET: randomBytes(24).toString("hex"),
    RAZORPAY_WEBHOOK_SECRET: randomBytes(24).toString("hex"),
  });
  const cluster = await startDatabase(
    config.databaseUrl,
    join(directory, "postgres"),
    { major: 16 },
  );
  const database = new Database(config.databaseUrl),
    provider = new PilotProvider();
  let app: Awaited<ReturnType<typeof createApplication>> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined,
    workerBusy = false;
  const streams: Array<Awaited<ReturnType<typeof stream>>> = [];
  const report: any = {
    profile: "isolated-local-pilot-v1",
    started_at: new Date().toISOString(),
    seconds,
    target_rps: 20,
    sessions: 100,
    postgres_major: 16,
    host: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      logical_cpus: cpus().length,
      memory_gib: Math.round(totalmem() / 2 ** 30),
    },
    limitations: [
      "Local loopback, co-located generator/API/PostgreSQL; not deployed Mumbai capacity.",
      "Injected payment provider and captured email. No live payment, SMTP, malware service or bank latency.",
      "100 authenticated logical sessions, 20 persistent realtime streams; HTTP requests scheduled open-loop at 20/s.",
    ],
    failures: [],
  };
  const loop = monitorEventLoopDelay({ resolution: 20 });
  let base = "";
  async function stream(pair: PilotPair, after = 15) {
    const abort = new AbortController();
    const response = await fetch(
      base + "/v1/me/connections/" + pair.id + "/events?after=" + after,
      {
        headers: { Cookie: pair.owner.cookie, Origin: config.webOrigin },
        signal: abort.signal,
      },
    );
    assert.equal(response.status, 200, "authorized realtime opens");
    const state = {
      revoked: false,
      sequence: after,
      ended: false,
      error: false,
    };
    const task = (async () => {
      let buffer = "";
      const decoder = new TextDecoder();
      try {
        for await (const part of response.body!) {
          buffer += decoder.decode(part, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (frame.includes("event: access-revoked")) state.revoked = true;
            if (frame.includes("event: reconnect")) state.error = true;
            if (frame.includes("event: state"))
              state.sequence = JSON.parse(
                frame
                  .split("\n")
                  .find((l) => l.startsWith("data: "))!
                  .slice(6),
              ).next_after;
          }
        }
      } catch {
        if (!abort.signal.aborted) state.error = true;
      } finally {
        state.ended = true;
      }
    })();
    return {
      pair,
      state,
      close: async () => {
        abort.abort();
        await task;
      },
    };
  }
  async function until(check: () => boolean, label: string) {
    const deadline = performance.now() + 5000;
    while (!check() && performance.now() < deadline) await sleep(20);
    assert(check(), label);
  }
  try {
    await migrate(database);
    app = await createApplication(
      config,
      database,
      () => new Date(),
      undefined,
      undefined,
      provider,
    );
    await app.listen(0, "127.0.0.1");
    base = "http://127.0.0.1:" + app.getHttpServer().address().port;
    const fixture = await pilotFixture(database, config, base, provider);
    for (const account of fixture.accounts)
      assert.equal((await fixture.call("/v1/me", account)).user.id, account.id);
    console.log(
      "100 independent sessions verified; 30 approved offers, 77 Connections and 1155 historical messages seeded.",
    );
    const blocked = fixture.pairs[0];
    const suspended = fixture.pairs.find(
      (p) => p.teacher.id === fixture.teachers[9].id,
    )!;
    const live = fixture.pairs
      .filter(
        (p) => p.id !== blocked.id && p.teacher.id !== suspended.teacher.id,
      )
      .slice(0, 18);
    for (const pair of [blocked, suspended, ...live])
      streams.push(await stream(pair));
    report.realtime_streams = streams.length;
    // Revoke two already-open streams. Repeated negative probes below run throughout load.
    await fixture.call(
      "/v1/me/connections/" + blocked.id + "/safety/block",
      blocked.owner,
      { blocked: true },
    );
    await fixture.call(
      "/v1/staff/listings/" + suspended.listing.id + "/safety",
      fixture.reviewer,
      {
        revision: suspended.listing.revision,
        action: "SUSPEND",
        reason: "Fictional safety restriction during pilot verification",
      },
    );
    await until(
      () => streams[0].state.revoked && streams[1].state.revoked,
      "live authority revocation observed",
    );
    // Replace revoked streams so 20 remain live during timed work.
    await streams[0].close();
    await streams[1].close();
    streams.splice(0, 2);
    for (const pair of fixture.pairs
      .filter(
        (p) => p.id !== blocked.id && p.teacher.id !== suspended.teacher.id,
      )
      .slice(18, 20))
      streams.push(await stream(pair));
    const positive = fixture.pairs.filter(
      (p) => p.id !== blocked.id && p.teacher.id !== suspended.teacher.id,
    );
    const worker = new PaymentEvents(database, config, provider);
    const notifications = notificationWorker(database, config),
      mail = new MailWorker(database, config),
      deadlines = new RequestLifecycle(database);
    report.background_workers = [
      "payments (injected provider)",
      "notifications (captured email)",
      "verification-email (captured)",
      "request-deadlines",
    ];
    timer = setInterval(() => {
      if (workerBusy) return;
      workerBusy = true;
      void Promise.all([
        worker.tick(),
        notifications.tick(),
        mail.tick(),
        deadlines.tick(),
      ])
        .catch(() => report.failures.push("background worker failed"))
        .finally(() => {
          workerBusy = false;
        });
    }, 100);
    const samples: Record<string, number[]> = {},
      counts: Record<string, number> = {},
      sessionUses = new Map<string, number>();
    const sent: Array<{ pair: PilotPair; client: string; sequence: number }> =
      [];
    let inflight = 0,
      peak = 0,
      maxLag = 0;
    const pending = new Set<Promise<void>>();
    const execute = async (
      kind: string,
      path: string,
      account: PilotAccount | undefined,
      body: unknown,
      expected: number,
      scheduled: number,
      extra: Record<string, string> = {},
    ) => {
      inflight++;
      peak = Math.max(peak, inflight);
      if (account)
        sessionUses.set(account.id, (sessionUses.get(account.id) || 0) + 1);
      try {
        const response = await fetch(base + path, {
          method: body === undefined ? "GET" : "POST",
          signal: AbortSignal.timeout(10000),
          headers: {
            Origin: config.webOrigin,
            "Content-Type": "application/json",
            ...(account ? { Cookie: account.cookie } : {}),
            ...extra,
          },
          ...(body === undefined
            ? {}
            : { body: typeof body === "string" ? body : JSON.stringify(body) }),
        });
        const data = await response.json();
        (samples[kind] ||= []).push(performance.now() - scheduled);
        counts[kind] = (counts[kind] || 0) + 1;
        if (response.status !== expected)
          report.failures.push(
            `${kind}: expected ${expected}, received ${response.status} (${data.code || "unknown"})`,
          );
        if (
          kind === "search" &&
          (!data.offers?.length ||
            data.offers.some(
              (offer: any) =>
                offer.id === suspended.listing.id ||
                offer.offer.subject_id !== "subject-physics",
            ))
        )
          report.failures.push(
            "search returned empty, mismatched or suspended supply",
          );
        return data;
      } catch {
        report.failures.push(kind + ": request failed or timed out");
      } finally {
        inflight--;
      }
    };
    const start = performance.now(),
      cpu = process.cpuUsage();
    loop.enable();
    for (let n = 0; n < seconds * 20; n++) {
      const scheduled = start + n * 50;
      await sleep(scheduled - performance.now());
      maxLag = Math.max(maxLag, performance.now() - scheduled);
      const slot = n % 20,
        second = Math.floor(n / 20),
        account = fixture.accounts[(second * 10 + slot) % 100];
      let job: Promise<unknown>;
      if (slot < 10)
        job = execute(
          "search",
          "/v1/discovery?subject_id=subject-physics&domain_id=school&limit=12",
          account,
          undefined,
          200,
          scheduled,
        );
      else if (slot < 12) {
        const pair = positive[(second * 2 + slot - 10) % positive.length];
        job = execute(
          "history",
          "/v1/me/connections/" + pair.id + "/messages?limit=20",
          pair.owner,
          undefined,
          200,
          scheduled,
        );
      } else if (slot < 14) {
        const pair = positive[(second * 2 + slot - 12) % positive.length],
          client = randomUUID();
        job = execute(
          "chat",
          "/v1/me/connections/" + pair.id + "/messages",
          pair.owner,
          {
            client_message_id: client,
            text: "Fictional measured Physics question " + n,
          },
          201,
          scheduled,
        ).then((data) => {
          if (data?.message)
            sent.push({ pair, client, sequence: data.message.sequence });
        });
      } else if (slot === 14)
        job = execute(
          "preferences-write",
          "/v1/me/notification-preferences",
          account,
          {
            enquiry_email: true,
            chat_email: second % 2 === 0,
            availability_email: false,
            marketing_email: false,
            notice_version: "notification-preferences-v1",
          },
          200,
          scheduled,
        );
      else if (slot === 15) {
        const p = fixture.payments[second % fixture.payments.length];
        job = execute(
          "checkout-retry",
          "/v1/me/purchases",
          p.owner,
          p.checkoutBody,
          200,
          scheduled,
        );
      } else if (slot === 16) {
        const p = fixture.payments[second % fixture.payments.length],
          signed = signedCapture(config, p.body);
        job = execute(
          "payment-callback",
          "/v1/payments/razorpay/webhooks",
          undefined,
          signed.raw,
          202,
          scheduled,
          {
            "x-razorpay-event-id": "evt_pilot_" + second,
            "x-razorpay-signature": signed.signature,
          },
        );
      } else if (slot === 17)
        job = execute(
          "deny-cross-account",
          second % 2
            ? "/v1/me/purchases/" + fixture.payments[0].purchase.id
            : "/v1/me/connections/" + positive[0].id + "/messages",
          fixture.accounts[0],
          undefined,
          404,
          scheduled,
        );
      else if (slot === 18)
        job = execute(
          "deny-blocked",
          "/v1/me/connections/" + blocked.id + "/messages",
          blocked.owner,
          undefined,
          403,
          scheduled,
        );
      else if (second % 2)
        job = execute(
          "deny-suspended",
          "/v1/me/contact-requests",
          suspended.owner,
          {
            request_key: randomUUID(),
            listing_id: suspended.listing.id,
            listing_revision: suspended.listing.revision,
            learner_id: suspended.learner.id,
            subject_id: "subject-physics",
            teaching_mode: "ONLINE",
            learning_requirements:
              "This suspended offer must deny new requests",
            preferred_times: "Tuesday evenings IST",
          },
          404,
          scheduled,
        );
      else
        job = execute(
          "deny-suspended",
          "/v1/discovery/" + suspended.listing.id,
          suspended.owner,
          undefined,
          404,
          scheduled,
        );
      const tracked = job
        .then(() => undefined)
        .finally(() => pending.delete(tracked));
      pending.add(tracked);
    }
    await Promise.all(pending);
    const elapsed = performance.now() - start;
    loop.disable();
    report.elapsed_seconds = elapsed / 1000;
    report.achieved_rps =
      Object.values(counts).reduce((a, b) => a + b, 0) / (elapsed / 1000);
    report.counts = counts;
    report.sessions_exercised = sessionUses.size;
    report.peak_http_inflight = peak;
    report.max_scheduler_lag_ms = maxLag;
    report.latency_ms = Object.fromEntries(
      Object.entries(samples).map(([kind, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return [
          kind,
          {
            count: sorted.length,
            p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
            p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
            max: sorted.at(-1),
          },
        ];
      }),
    );
    report.process = {
      rss_mib: process.memoryUsage().rss / 2 ** 20,
      cpu_ms:
        (process.cpuUsage(cpu).user + process.cpuUsage(cpu).system) / 1000,
      event_loop_p95_ms: loop.percentile(95) / 1e6,
    };
    assert.equal(sessionUses.size, 100, "all sessions used in timed work");
    assert.equal(
      report.failures.length,
      0,
      report.failures.slice(0, 8).join("; "),
    );
    assert(
      report.achieved_rps >= 19.5,
      "generator achieved realistic arrival rate",
    );
    assert(maxLag <= 250, "generator did not hide load by stalling");
    for (const kind of ["search", "preferences-write", "checkout-retry"])
      assert(report.latency_ms[kind].p95 <= 500, kind + " p95 target");
    assert(
      report.latency_ms.chat.p95 <= 300,
      "durable chat acknowledgment p95 target",
    );
    // Reconnect and verify every measured acknowledgement through authorized history.
    for (const pair of positive) {
      const history = await fixture.call(
        "/v1/me/connections/" + pair.id + "/messages?after=15&limit=100",
        pair.teacher,
      );
      for (const message of sent.filter((s) => s.pair.id === pair.id))
        assert(
          history.messages.some(
            (m: any) =>
              m.sequence === message.sequence &&
              m.client_message_id === message.client,
          ),
          "acknowledged message remains durable",
        );
    }
    const replay = await stream(sent[0].pair, sent[0].sequence - 1);
    streams.push(replay);
    await until(
      () => replay.state.sequence >= sent[0].sequence,
      "reconnect catches acknowledged message",
    );
    for (const pair of [blocked, suspended]) {
      for (const suffix of ["/messages", "/contacts", "/events"])
        await fixture.call(
          "/v1/me/connections/" + pair.id + suffix,
          pair.owner,
          undefined,
          403,
        );
      await fixture.call(
        "/v1/me/connections/" + pair.id + "/messages",
        pair.owner,
        { client_message_id: randomUUID(), text: "This must not be delivered" },
        403,
      );
    }
    await until(() => !workerBusy, "payment worker idle");
    while (await worker.tick()) {}
    for (const p of fixture.payments) {
      const paid = (
        await fixture.call("/v1/me/purchases/" + p.purchase.id, p.owner)
      ).purchase;
      assert.equal(paid.status, "CAPTURED");
      assert.equal(paid.journal.length, 1);
      assert.equal(paid.journal[0].amount_paise, "59900");
      assert.equal(paid.access_active, false);
    }
    assert(
      streams.every((s) => !s.state.error),
      "no unexpected realtime reconnect errors",
    );
    report.permissions = {
      live_block_and_suspension_revoke: true,
      denied_under_load:
        counts["deny-cross-account"] +
        counts["deny-blocked"] +
        counts["deny-suspended"],
      reconnect_denied: true,
      acknowledged_messages_recovered: sent.length,
      capture_cycles: 12,
      duplicate_capture_effects: 0,
    };
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.failures.push(
      error instanceof Error
        ? error.message
        : "Unknown pilot verification failure",
    );
    process.exitCode = 1;
  } finally {
    clearInterval(timer);
    loop.disable();
    await Promise.allSettled(streams.map((s) => s.close()));
    while (workerBusy) await sleep(20);
    await app?.close();
    await database.close();
    await cluster.stop();
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    console.log("Evidence: " + join(directory, "report.json"));
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Pilot setup failed");
  process.exitCode = 1;
});
