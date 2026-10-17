import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { S3Client } from "@aws-sdk/client-s3";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("independent storage verifies every encrypted upload by downloading it and rejects corrupt remote bytes", async () => {
  const { S3RecoveryStore } = await import("../src/recovery-storage.js");
  const objects = new Map<string, Buffer>();
  let encrypted = false,
    corrupt = false;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    if (req.method === "PUT") {
      encrypted = req.headers["x-amz-server-side-encryption"] === "AES256";
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      objects.set(path, Buffer.concat(chunks));
      res.setHeader("ETag", '"fixture-etag"');
      res.setHeader("x-amz-version-id", "fictional-version");
      res.end();
      return;
    }
    const data = objects.get(path);
    if (!data) {
      res.statusCode = 404;
      res.end("<Error><Code>NoSuchKey</Code></Error>");
      return;
    }
    res.setHeader("ETag", '"fixture-etag"');
    res.setHeader("x-amz-version-id", "fictional-version");
    res.end(corrupt ? Buffer.from("corrupted") : data);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const client = new S3Client({
    region: "ap-southeast-1",
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: "fictional",
      secretAccessKey: "fictional-secret",
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  try {
    const store = new S3RecoveryStore(
      {
        bucket: "fictional-recovery-bucket",
        region: "ap-southeast-1",
        environment: "test-pilot",
      },
      client,
    );
    const ack = await store.put(
      "ledger/index.json",
      Buffer.from("fictional signed index"),
    );
    assert.equal(encrypted, true);
    assert.equal(ack.version, "fictional-version");
    assert.equal(
      (await store.read("ledger/index.json")).bytes.toString(),
      "fictional signed index",
    );
    corrupt = true;
    await assert.rejects(
      store.put("ledger/next.json", Buffer.from("fictional bytes")),
      /INDEPENDENT_COPY_VERIFICATION_FAILED/,
    );
  } finally {
    client.destroy();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("the independent watchdog measures loss from the database snapshot rather than a recent upload timestamp", async () => {
  const { inspectIndependentHealth } =
    await import("../src/recovery-watchdog.js");
  const now = new Date("2026-10-18T06:00:00Z");
  const store = {
    latestBackup: async () => ({
      id: "fictional",
      snapshot_at: "2026-10-17T11:00:00Z",
      verified_at: "2026-10-18T05:55:00Z",
    }),
  };
  const result = await inspectIndependentHealth(
    { store, origin: "https://fictional.example" },
    now,
    async () => Response.json({ status: "ok" }),
  );
  assert.deepEqual(result.conditions, ["BACKUP_STALE"]);
  assert.equal(result.healthy, false);
  assert.equal(result.snapshot_age_seconds, 19 * 3600);
});
test("the recovery operator refuses a production identity under a development or test runtime", async () => {
  await assert.rejects(
    promisify(execFile)(
      process.execPath,
      [
        "node_modules/tsx/dist/cli.mjs",
        "--tsconfig",
        "apps/api/tsconfig.json",
        "apps/api/src/recovery-operator.ts",
        "export",
        "production",
        ".local/never-created-production-export.enc",
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: "test",
          APP_ENVIRONMENT: "production",
          DATABASE_URL: "postgres://fixture:fictional@127.0.0.1:9/not_used",
          AUTH_SECRET: "x".repeat(64),
          MAIL_TRANSPORT: "capture",
          RECOVERY_BUCKET: undefined,
          BACKUP_KEY_FILE: undefined,
        },
        windowsHide: true,
      },
    ),
    (error) => {
      assert.match(
        (error as Error & { stderr: string }).stderr,
        /RECOVERY_RUNTIME_ENVIRONMENT_MISMATCH/,
      );
      return true;
    },
  );
});
