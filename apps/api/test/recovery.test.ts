import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Database, migrate } from "../src/database.js";
// @ts-expect-error Local JavaScript helper.
import { startDatabase } from "../../../scripts/postgres.mjs";
import { loadConfig } from "../src/config.js";
import {
  initializePrivacyLedger,
  publishPrivacyLedger,
  fetchIndependentPrivacyLedger,
} from "../src/privacy-ledger.js";
import { createApplication } from "../src/app.js";
import { decrypt } from "../src/security.js";
import { PrivacyWorker } from "../src/privacy-worker.js";
import { checkoutOpen } from "../src/operations.js";
import request from "supertest";
import sharp from "sharp";
import { recoveryStorageFixture } from "./helpers/recovery-storage.js";
let db: Database, cluster: Awaited<ReturnType<typeof startDatabase>>;
let baseUrl: string;
const directory = resolve(".local/tests", randomUUID());
before(async () => {
  const listener = createServer();
  await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((r) => listener.close(() => r()));
  const url = `postgres://recovery_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/recovery_test`;
  baseUrl = url;
  cluster = await startDatabase(url, join(directory, "postgres"), {
    major: 16,
  });
  db = new Database(url);
});
test("an authenticated encrypted export restores all data on PG16 into an empty isolated database and pauses checkout", async () => {
  const { createRecoveryExport, restoreRecoveryExport } =
    await import("../src/recovery.js");
  await cluster.createDatabase("source_test");
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: baseUrl.replace("/recovery_test", "/source_test"),
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: "http://localhost:3000",
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
  });
  const policy = {
    id: "fictional-recovery-v1",
    test_only: true,
    approved_by: "Fictional operator",
    approval_reference: "TEST-RECOVERY",
    classes: Object.fromEntries(
      ["ACCOUNT", "PHOTO", "EVIDENCE", "SAFETY", "SUPPORT", "FINANCE"].map(
        (k) => [
          k,
          { days: 0, purpose: "Fictional isolated recovery retention test" },
        ],
      ),
    ),
  };
  config.privacy = { policy, tombstoneDir: join(directory, "ledger") };
  await initializePrivacyLedger(config);
  const storage = await recoveryStorageFixture();
  config.recoveryStore = storage.store;
  await publishPrivacyLedger(config);
  const targetListener = createServer();
  await new Promise<void>((r) => targetListener.listen(0, "127.0.0.1", r));
  const targetPort = (targetListener.address() as { port: number }).port;
  await new Promise<void>((r) => targetListener.close(() => r()));
  const targetUrl = new URL(baseUrl);
  targetUrl.port = String(targetPort);
  targetUrl.password = randomBytes(24).toString("hex");
  targetUrl.pathname = "/restored_test";
  const source = new Database(config.databaseUrl),
    targetConfig = {
      ...config,
      databaseUrl: targetUrl.href,
      privacy: {
        ...config.privacy!,
        tombstoneDir: join(directory, "restored-ledger"),
      },
    },
    target = new Database(targetConfig.databaseUrl);
  let targetCluster: Awaited<ReturnType<typeof startDatabase>> | undefined;
  let app: Awaited<ReturnType<typeof createApplication>> | undefined,
    restoredApp: typeof app;
  try {
    await migrate(source);
    await source.pool.query(
      "CREATE TABLE recovery_fictional_assets(id integer PRIMARY KEY,payload bytea NOT NULL)",
    );
    await source.pool.query(
      "INSERT INTO recovery_fictional_assets VALUES(1,$1)",
      [Buffer.from("FICTIONAL-PRIVATE-ASSET-59900")],
    );
    const entry = randomUUID();
    await source.transaction(async (client) => {
      await client.query(
        "INSERT INTO financial_entries(id,source_type,source_id,provider_key_id,test_only,currency,created_at) VALUES($1,'FICTIONAL_RECOVERY','TEST-RECOVERY-59900','rzp_test_recovery',true,'INR',now())",
        [entry],
      );
      await client.query(
        "INSERT INTO financial_postings VALUES($1,'GATEWAY_CONTROL','DEBIT',59900),($1,'FEE_LIABILITY','CREDIT',59900)",
        [entry],
      );
    });
    app = await createApplication(config, source);
    const email = randomUUID() + "@example.test",
      password = "Fictional-recovery-password-123";
    const post = (path: string, body: unknown, cookie?: string) => {
      const r = request(app!.getHttpServer())
        .post(path)
        .set("Origin", config.webOrigin)
        .send(body);
      return cookie ? r.set("Cookie", cookie) : r;
    };
    await post("/v1/auth/registrations", {
      email,
      password,
      display_name: "Fictional recovery Tutor",
    }).expect(202);
    const mail = (
      await source.pool.query(
        "SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)",
        [email],
      )
    ).rows[0];
    await post("/v1/auth/verifications", {
      token: new URL(
        decrypt<{ verification_url: string }>(
          mail.encrypted_payload,
          config.authSecret,
        ).verification_url,
      ).hash.slice(7),
    }).expect(200);
    const login = await post("/v1/auth/sessions", { email, password }).expect(
        200,
      ),
      cookie = login.headers["set-cookie"][0].split(";")[0];
    await post("/v1/me/roles", { roles: ["TUTOR"] }, cookie).expect(200);
    await post(
      "/v1/me/tutor",
      {
        display_name: "Fictional restore Tutor",
        biography: "I explain concepts with examples and patient practice.",
        birth_date: "1990-01-01",
        adult_confirmed: true,
      },
      cookie,
    ).expect(200);
    await post(
      "/v1/me/tutor/evidence",
      {
        media_type: "application/pdf",
        data: Buffer.from(
          "%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n",
        ).toString("base64"),
      },
      cookie,
    ).expect(201);
    const pixels = await sharp({
      create: { width: 128, height: 128, channels: 3, background: "#bf728e" },
    })
      .jpeg()
      .toBuffer();
    const photo = (
      await post(
        "/v1/me/tutor/photo",
        {
          media_type: "image/jpeg",
          data: Buffer.concat([
            pixels,
            Buffer.from("FICTIONAL-TUTOR-EVIDENCE"),
          ]).toString("base64"),
          public_consent: true,
        },
        cookie,
      ).expect(201)
    ).body.photo;
    const preview = (
      await request(app.getHttpServer())
        .get("/v1/me/tutor/photo/" + photo.id)
        .set("Cookie", cookie)
        .expect(200)
    ).body;
    const deleteEmail = randomUUID() + "@example.test";
    await post("/v1/auth/registrations", {
      email: deleteEmail,
      password,
      display_name: "Fictional erased account",
    }).expect(202);
    const deleteMail = (
      await source.pool.query(
        "SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)",
        [deleteEmail],
      )
    ).rows[0];
    await post("/v1/auth/verifications", {
      token: new URL(
        decrypt<{ verification_url: string }>(
          deleteMail.encrypted_payload,
          config.authSecret,
        ).verification_url,
      ).hash.slice(7),
    }).expect(200);
    const deleteLogin = await post("/v1/auth/sessions", {
        email: deleteEmail,
        password,
      }).expect(200),
      deleteCookie = deleteLogin.headers["set-cookie"][0].split(";")[0];
    const key = randomBytes(32),
      output = join(directory, "export.enc"),
      tools =
        process.env.PG_RECOVERY_BIN || resolve(".local/tools/pg16/pgsql/bin");
    const archive = await createRecoveryExport(config, {
      output,
      key,
      tools,
      environment: "test-pilot",
      release: "test-release",
    });
    const remote = await storage.store.putArchive(
        "exports/" + archive.id + ".enc",
        output,
      ),
      download = join(directory, "download.enc");
    await storage.store.downloadArchive(
      "exports/" + archive.id + ".enc",
      remote.version,
      download,
    );
    assert.equal(archive.source_major, 16);
    assert.ok(
      !(await readFile(output)).includes(
        Buffer.from("FICTIONAL-PRIVATE-ASSET"),
      ),
    );
    const restore = {
      archive: output,
      key,
      tools,
      environment: "test-pilot",
      trafficStopped: true,
      latestLedgerVerified: true,
    };
    await assert.rejects(
      restoreRecoveryExport(targetConfig, { ...restore, key: randomBytes(32) }),
      /BACKUP_AUTHENTICATION_FAILED/,
    );
    await assert.rejects(
      restoreRecoveryExport(targetConfig, {
        ...restore,
        environment: "another-stage",
      }),
      /BACKUP_ENVIRONMENT_MISMATCH/,
    );
    const damaged = await readFile(output);
    damaged[damaged.length - 30] ^= 1;
    const corrupt = join(directory, "corrupt.enc");
    await writeFile(corrupt, damaged);
    await assert.rejects(
      restoreRecoveryExport(targetConfig, { ...restore, archive: corrupt }),
      /BACKUP_AUTHENTICATION_FAILED/,
    );
    const proof = await post(
        "/v1/me/privacy/verifications",
        { password, purpose: "DELETE" },
        deleteCookie,
      ).expect(200),
      receipt = proof.headers["set-cookie"][0].split(";")[0];
    const deletion = await post(
      "/v1/me/privacy/requests",
      {
        request_key: randomUUID(),
        kind: "DELETE",
        verification: proof.body.proof,
        confirmation: "DELETE MY ACCOUNT",
      },
      deleteCookie,
    ).expect(202);
    storage.unavailable = true;
    await new PrivacyWorker(source, config).tick();
    const failed = (
      await request(app.getHttpServer())
        .get("/v1/me/privacy")
        .set("Cookie", receipt)
        .expect(200)
    ).body.requests.find((r: any) => r.id === deletion.body.request.id);
    assert.equal(
      failed.status,
      "RETRYING",
      "independent storage failure cannot acknowledge completed erasure",
    );
    storage.unavailable = false;
    await new PrivacyWorker(
      source,
      config,
      () => new Date(Date.now() + 120000),
    ).tick();
    const recoveryStarted = Date.now();
    targetCluster = await startDatabase(
      targetConfig.databaseUrl,
      join(directory, "restored-postgres"),
      { major: 16 },
    );
    await fetchIndependentPrivacyLedger(targetConfig);
    assert.equal(
      (
        await target.pool.query(
          "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'",
        )
      ).rows[0].n,
      0,
    );
    const report = await restoreRecoveryExport(targetConfig, {
      archive: download,
      key,
      tools,
      environment: "test-pilot",
      trafficStopped: true,
      latestLedgerVerified: true,
    });
    assert.equal(report.checkout_paused, true);
    assert.equal(report.tombstones_reapplied, 1);
    const { assertDeploymentReady } = await import("../src/deployment.js");
    assert.equal(
      (await assertDeploymentReady(targetConfig, target)).recoveryPending,
      true,
      "entrypoints must recognize a restored environment in every mode",
    );
    assert.ok(report.duration_ms > 0);
    assert.deepEqual(
      (
        await target.pool.query(
          "SELECT direction,amount_paise FROM financial_postings ORDER BY direction",
        )
      ).rows,
      [
        { direction: "CREDIT", amount_paise: "59900" },
        { direction: "DEBIT", amount_paise: "59900" },
      ],
    );
    await assert.rejects(
      target.pool.query("UPDATE financial_postings SET amount_paise=60000"),
      /immutable/,
    );
    assert.deepEqual(
      (await target.pool.query("SELECT payload FROM recovery_fictional_assets"))
        .rows[0].payload,
      Buffer.from("FICTIONAL-PRIVATE-ASSET-59900"),
    );
    restoredApp = await createApplication(targetConfig, target);
    await request(restoredApp.getHttpServer())
      .post("/v1/auth/sessions")
      .set("Origin", config.webOrigin)
      .send({ email: deleteEmail, password })
      .expect(401);
    await request(restoredApp.getHttpServer())
      .get("/v1/me")
      .set("Cookie", cookie)
      .expect(401);
    const renewed = await request(restoredApp.getHttpServer())
      .post("/v1/auth/sessions")
      .set("Origin", config.webOrigin)
      .send({ email, password })
      .expect(200);
    const recoveredPhoto = await request(restoredApp.getHttpServer())
      .get("/v1/me/tutor/photo/" + photo.id)
      .set("Cookie", renewed.headers["set-cookie"][0].split(";")[0])
      .expect(200);
    assert.deepEqual(
      recoveredPhoto.body,
      preview,
      "the original normalized portrait decrypts after complete fresh-cluster recovery",
    );
    await target.pool.query(
      "UPDATE operations_checkout SET paused=false WHERE singleton",
    );
    assert.equal(
      await checkoutOpen(target.pool),
      false,
      "ordinary checkout control cannot bypass pending external-money recovery review",
    );
    await assert.rejects(
      restoreRecoveryExport(targetConfig, {
        archive: output,
        key,
        tools,
        environment: "test-pilot",
        trafficStopped: true,
        latestLedgerVerified: true,
      }),
      /EMPTY_TARGET_REQUIRED/,
    );
    await writeFile(
      resolve(".local/task26-local-drill.json"),
      JSON.stringify(
        {
          scope: "LOCAL_FICTIONAL_PG16_AND_S3_PROTOCOL_FIXTURE_ONLY",
          ...report,
          fresh_cluster_local_recovery_ms: Date.now() - recoveryStarted,
          archive_sha256: archive.archive_sha256,
          tables_verified: archive.tables.length,
          financial_postings: 2,
          original_portrait_verified: true,
          warning:
            "Not a deployed regional RPO/RTO result. No real AWS storage or external money provider was used.",
        },
        null,
        2,
      ),
    );
  } finally {
    await app?.close();
    await restoredApp?.close();
    await source.close();
    await target.close();
    await targetCluster?.stop();
    await storage.close();
  }
});
after(async () => {
  await db?.close();
  await cluster?.stop();
});
test("cross-host migration verification accepts only LF/CRLF equivalents without rewriting recorded checksums", async () => {
  const migrations = join(directory, "migrations");
  await mkdir(migrations, { recursive: true });
  const path = join(migrations, "001-portable.sql"),
    sql =
      "CREATE TABLE recovered_value(amount integer NOT NULL);\nINSERT INTO recovered_value VALUES(59900);\n";
  await writeFile(path, sql.replaceAll("\n", "\r\n"));
  await migrate(db, { directory: migrations });
  const first = await migrate(db, { directory: migrations });
  await writeFile(path, sql);
  const next = await migrate(db, { directory: migrations });
  assert.equal(
    next.verified[0].recorded_checksum,
    first.verified[0].recorded_checksum,
  );
  assert.equal(next.verified[0].newline_compatible, true);
  assert.equal(next.applied.length, 0);
  await writeFile(path, sql.replace("59900", "60000"));
  await assert.rejects(
    migrate(db, { directory: migrations }),
    /applied migration was modified/i,
  );
});
test("production entrypoints reject plaintext database launches", async () => {
  const { assertDeploymentReady } = await import("../src/deployment.js");
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: baseUrl,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    MAIL_TRANSPORT: "capture",
  });
  await assert.rejects(
    assertDeploymentReady({ ...config, mode: "production" }, db, {
      APP_ENVIRONMENT: "production",
      RELEASE_ID: "test-release",
    }),
    /VERIFIED_DATABASE_TLS_REQUIRED/,
  );
});
test("an environment still under recovery cannot publish a newer-looking backup", async () => {
  const { createRecoveryExport } = await import("../src/recovery.js");
  await cluster.createDatabase("incomplete_restore_test");
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: baseUrl.replace("/recovery_test", "/incomplete_restore_test"),
    AUTH_SECRET: randomBytes(48).toString("hex"),
    PRIVACY_RETENTION_POLICY_FILE: "config/privacy-retention.example.json",
    PRIVACY_TOMBSTONE_DIR: join(directory, "incomplete-ledger"),
    MAIL_TRANSPORT: "capture",
  });
  await initializePrivacyLedger(config);
  const partial = new Database(config.databaseUrl);
  try {
    await migrate(partial);
    await partial.pool.query(
      "INSERT INTO deployment_recoveries(id,archive_id,source_snapshot_at,release_id,state,started_at,privacy_reapplied_at) VALUES($1,$2,now(),'fixture-release','MONEY_REVIEW',now(),now())",
      [randomUUID(), randomUUID()],
    );
    await assert.rejects(
      createRecoveryExport(config, {
        key: randomBytes(32),
        tools:
          process.env.PG_RECOVERY_BIN || resolve(".local/tools/pg16/pgsql/bin"),
        output: join(directory, "not-ready.enc"),
        environment: "test-pilot",
        release: "test-release",
      }),
      /RECOVERY_NOT_READY_FOR_BACKUP/,
    );
  } finally {
    await partial.close();
  }
});
test("compatible application rollback checks preserve money and reject unsupported or unapplied migrations", async () => {
  await cluster.createDatabase("rollback_test");
  const rollback = new Database(
    baseUrl.replace("/recovery_test", "/rollback_test"),
  );
  const old = join(directory, "old-release"),
    future = join(directory, "future-release");
  await mkdir(old, { recursive: true });
  await mkdir(future, { recursive: true });
  try {
    await migrate(rollback);
    const entry = randomUUID();
    await rollback.transaction(async (client) => {
      await client.query(
        "INSERT INTO financial_entries(id,source_type,source_id,provider_key_id,test_only,currency,created_at) VALUES($1,'FICTIONAL_ROLLBACK','TEST-ROLLBACK-59900','rzp_test_recovery',true,'INR',now())",
        [entry],
      );
      await client.query(
        "INSERT INTO financial_postings VALUES($1,'GATEWAY_CONTROL','DEBIT',59900),($1,'FEE_LIABILITY','CREDIT',59900)",
        [entry],
      );
    });
    for (const file of (await readdir(resolve("apps/api/migrations"))).filter(
      (name) => name.endsWith(".sql"),
    )) {
      const bytes = await readFile(resolve("apps/api/migrations", file));
      if (!file.startsWith("028")) await writeFile(join(old, file), bytes);
      await writeFile(join(future, file), bytes);
    }
    await assert.rejects(
      migrate(rollback, { directory: old, verifyOnly: true }),
      /candidate.*support/i,
    );
    const compatible = await migrate(rollback, { verifyOnly: true });
    assert.equal(compatible.applied.length, 0);
    assert.equal(compatible.verified.length, 28);
    await writeFile(
      join(future, "029-unapplied.sql"),
      "CREATE TABLE rollback_should_never_exist(id integer);",
    );
    await assert.rejects(
      migrate(rollback, { directory: future, verifyOnly: true }),
      /required migration is not applied/i,
    );
    assert.equal(
      (
        await rollback.pool.query(
          "SELECT to_regclass('public.rollback_should_never_exist') AS name",
        )
      ).rows[0].name,
      null,
    );
    assert.deepEqual(
      (
        await rollback.pool.query(
          "SELECT direction,amount_paise FROM financial_postings ORDER BY direction",
        )
      ).rows,
      [
        { direction: "CREDIT", amount_paise: "59900" },
        { direction: "DEBIT", amount_paise: "59900" },
      ],
    );
  } finally {
    await rollback.close();
  }
});
