import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { open, stat, appendFile, unlink } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { PoolClient } from "pg";
import { z } from "zod";
import { Database, migrate } from "./database.js";
import type { Config } from "./config.js";
import {
  privacyTombstones,
  validateIndependentPrivacyLedger,
} from "./privacy-ledger.js";
import { reapplyPrivacyTombstones } from "./privacy-worker.js";
import { assertPrivateDatabase, assertDeploymentReady } from "./deployment.js";

const magic = Buffer.from("TMPBACK1");
const tableDigest = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  rows: z.string().regex(/^\d+$/),
  digest: z.string().regex(/^[a-f0-9]{32}$/),
});
const headerSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  environment: z.string().regex(/^[a-z][a-z0-9-]{2,39}$/),
  release: z.string().regex(/^[a-zA-Z0-9._-]{4,100}$/),
  snapshot_at: z.iso.datetime(),
  source_major: z.number().int().min(16),
  ledger_ids: z.array(z.uuid()),
  tables: z.array(tableDigest),
  migrations: z.array(
    z.strictObject({
      version: z.string(),
      checksum: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});
type Header = z.infer<typeof headerSchema>;
type Common = { key: Buffer; tools: string; environment: string };
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
function toolPath(tools: string, name: string) {
  if (!tools || !resolve(tools)) throw new Error("POSTGRES_TOOLS_REQUIRED");
  return join(
    resolve(tools),
    name + (process.platform === "win32" ? ".exe" : ""),
  );
}
function postgresEnvironment(urlString: string) {
  const url = new URL(urlString),
    ssl = url.searchParams.get("sslmode");
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HOME: process.env.HOME,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGCONNECT_TIMEOUT: "10",
    PGAPPNAME: "tutoring-recovery",
    PGOPTIONS: "-c timezone=UTC",
  };
  if (ssl) env.PGSSLMODE = ssl;
  if (url.searchParams.has("sslrootcert"))
    env.PGSSLROOTCERT = url.searchParams.get("sslrootcert")!;
  return env;
}
async function toolMajor(tools: string, name: string) {
  const { stdout } = await promisify(execFile)(
    toolPath(tools, name),
    ["--version"],
    { windowsHide: true, timeout: 10000 },
  );
  const major = Number(stdout.match(/PostgreSQL\)?\s+(\d+)/)?.[1]);
  if (!major) throw new Error("INVALID_POSTGRES_TOOL");
  return major;
}
async function serverMajor(db: Database) {
  return Math.floor(
    Number(
      (await db.pool.query("SHOW server_version_num")).rows[0]
        .server_version_num,
    ) / 10000,
  );
}
async function inventory(client: PoolClient) {
  await client.query("SET TIME ZONE 'UTC'");
  const names = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE \"C\"",
    )
  ).rows;
  const tables: Header["tables"] = [];
  for (const { tablename: name } of names) {
    if (!/^[a-z][a-z0-9_]*$/.test(name))
      throw new Error("UNSUPPORTED_TABLE_NAME");
    const { rows } = await client.query(
      `SELECT count(*)::text AS rows,md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text) COLLATE "C"),'')) AS digest FROM public.${quote(name)} t`,
    );
    tables.push({ name, ...rows[0] });
  }
  return tables;
}
function postgresChild(
  tools: string,
  name: string,
  args: string[],
  url: string,
) {
  const child = spawn(toolPath(tools, name), args, {
    env: postgresEnvironment(url),
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stderr.resume();
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error("POSTGRES_TOOL_UNAVAILABLE")));
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error("POSTGRES_TOOL_FAILED")),
    );
  });
  void done.catch(() => {});
  const timeout = setTimeout(() => child.kill(), 20 * 60 * 1000);
  void done.finally(() => clearTimeout(timeout)).catch(() => {});
  return { child, done };
}
function validateKey(key: Buffer) {
  if (key.length !== 32)
    throw new Error("INDEPENDENT_32_BYTE_BACKUP_KEY_REQUIRED");
}
export async function createRecoveryExport(
  config: Config,
  input: Common & { output: string; release: string },
) {
  validateKey(input.key);
  const db = new Database(config.databaseUrl),
    client = await db.pool.connect();
  let created = false;
  try {
    const readiness = await assertDeploymentReady(config, db);
    if (readiness.recoveryPending)
      throw new Error("RECOVERY_NOT_READY_FOR_BACKUP");
    const major = await serverMajor(db);
    if ((await toolMajor(input.tools, "pg_dump")) !== major)
      throw new Error("POSTGRES_MAJOR_MISMATCH");
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshotAt = new Date().toISOString();
    const snapshot = (
      await client.query("SELECT pg_export_snapshot() AS snapshot")
    ).rows[0].snapshot;
    const entries = await privacyTombstones(config);
    if (config.recoveryStore) await validateIndependentPrivacyLedger(config);
    const header = headerSchema.parse({
      version: 1,
      id: randomUUID(),
      environment: input.environment,
      release: input.release,
      snapshot_at: snapshotAt,
      source_major: major,
      ledger_ids: entries.map((e) => e.id).sort(),
      tables: await inventory(client),
      migrations: (
        await client.query(
          "SELECT version,checksum FROM schema_migrations ORDER BY version",
        )
      ).rows,
    });
    const metadata = Buffer.from(JSON.stringify(header)),
      length = Buffer.alloc(4);
    length.writeUInt32BE(metadata.length);
    if (metadata.length > 1024 * 1024)
      throw new Error("BACKUP_MANIFEST_TOO_LARGE");
    const iv = randomBytes(12),
      prefix = Buffer.concat([magic, length, metadata, iv]);
    const handle = await open(input.output, "wx", 0o600);
    created = true;
    try {
      await handle.writeFile(prefix);
    } finally {
      await handle.close();
    }
    const cipher = createCipheriv("aes-256-gcm", input.key, iv);
    cipher.setAAD(prefix);
    const { child, done } = postgresChild(
      input.tools,
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--exclude-schema=recovery_guard",
        "--snapshot=" + snapshot,
      ],
      config.databaseUrl,
    );
    child.stdin.end();
    try {
      await pipeline(
        child.stdout,
        cipher,
        createWriteStream(input.output, { flags: "a", mode: 0o600 }),
      );
      await done;
    } catch {
      child.kill();
      await done.catch(() => {});
      throw new Error("BACKUP_EXPORT_FAILED");
    }
    await appendFile(input.output, cipher.getAuthTag());
    const durable = await open(input.output, "r+");
    try {
      await durable.sync();
    } finally {
      await durable.close();
    }
    await client.query("COMMIT");
    return {
      ...header,
      completed_at: new Date().toISOString(),
      archive_sha256: await archiveHash(input.output),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (created) await unlink(input.output).catch(() => {});
    throw error;
  } finally {
    client.release();
    await db.close();
  }
}
async function archiveHash(path: string) {
  const hash = createHash("sha256");
  await pipeline(
    createReadStream(path),
    new Writable({
      write(chunk, _encoding, done) {
        hash.update(chunk);
        done();
      },
    }),
  );
  return hash.digest("hex");
}
async function readArchive(path: string, key: Buffer) {
  validateKey(key);
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 41)
      throw new Error("INVALID_BACKUP_ARCHIVE");
    const lead = Buffer.alloc(12);
    await handle.read(lead, 0, 12, 0);
    if (!lead.subarray(0, 8).equals(magic))
      throw new Error("INVALID_BACKUP_ARCHIVE");
    const length = lead.readUInt32BE(8);
    if (length > 1024 * 1024 || info.size < length + 41)
      throw new Error("INVALID_BACKUP_ARCHIVE");
    const prefix = Buffer.alloc(24 + length);
    await handle.read(prefix, 0, prefix.length, 0);
    const tag = Buffer.alloc(16);
    await handle.read(tag, 0, 16, info.size - 16);
    const header = headerSchema.parse(
      JSON.parse(prefix.subarray(12, 12 + length).toString("utf8")),
    );
    const decrypt = () => {
      const stream = createDecipheriv("aes-256-gcm", key, prefix.subarray(-12));
      stream.setAAD(prefix);
      stream.setAuthTag(tag);
      return stream;
    };
    const content = () =>
      createReadStream(path, {
        fd: handle.fd,
        autoClose: false,
        start: prefix.length,
        end: info.size - 17,
      });
    // Authenticate the entire archive before opening a target connection. No
    // plaintext dump is written to disk, even during verification.
    try {
      await pipeline(
        content(),
        decrypt(),
        new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
        }),
      );
    } catch {
      throw new Error("BACKUP_AUTHENTICATION_FAILED");
    }
    return { header, content, decrypt, close: () => handle.close() };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
export async function inspectRecoveryExport(path: string, key: Buffer) {
  const archive = await readArchive(path, key);
  try {
    return archive.header;
  } finally {
    await archive.close();
  }
}
export async function restoreRecoveryExport(
  config: Config,
  input: Common & {
    archive: string;
    trafficStopped: boolean;
    latestLedgerVerified: boolean;
  },
) {
  const started = Date.now();
  if (!input.trafficStopped || !input.latestLedgerVerified)
    throw new Error("OFFLINE_AND_LATEST_INDEPENDENT_LEDGER_REQUIRED");
  const archive = await readArchive(input.archive, input.key),
    db = new Database(config.databaseUrl);
  try {
    const header = archive.header;
    await assertPrivateDatabase(config, db);
    if (header.environment !== input.environment)
      throw new Error("BACKUP_ENVIRONMENT_MISMATCH");
    const entries = await privacyTombstones(config);
    if (config.recoveryStore) await validateIndependentPrivacyLedger(config);
    if (header.ledger_ids.some((id) => !entries.some((e) => e.id === id)))
      throw new Error("RECOVERY_LEDGER_INCOMPLETE");
    if (
      (await serverMajor(db)) !== header.source_major ||
      (await toolMajor(input.tools, "pg_restore")) !== header.source_major
    )
      throw new Error("POSTGRES_MAJOR_MISMATCH");
    if (
      (
        await db.pool.query(
          "SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%' UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m','f') LIMIT 1",
        )
      ).rowCount
    )
      throw new Error("EMPTY_TARGET_REQUIRED");
    await db.pool.query(
      "CREATE SCHEMA recovery_guard; CREATE TABLE recovery_guard.attempt(singleton boolean PRIMARY KEY CHECK(singleton),state text NOT NULL); INSERT INTO recovery_guard.attempt VALUES(true,'RESTORING')",
    );
    const { child, done } = postgresChild(
      input.tools,
      "pg_restore",
      [
        "--dbname=" +
          decodeURIComponent(new URL(config.databaseUrl).pathname.slice(1)),
        "--single-transaction",
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
      ],
      config.databaseUrl,
    );
    child.stdout.resume();
    try {
      await pipeline(archive.content(), archive.decrypt(), child.stdin);
      await done;
    } catch {
      child.kill();
      await done.catch(() => {});
      throw new Error("BACKUP_RESTORE_FAILED_KEEP_OFFLINE");
    }
    const client = await db.pool.connect();
    let recovered: Header["tables"];
    try {
      recovered = await inventory(client);
    } finally {
      client.release();
    }
    if (JSON.stringify(recovered) !== JSON.stringify(header.tables))
      throw new Error("RESTORED_DATA_MISMATCH_KEEP_OFFLINE");
    await migrate(db, { verifyOnly: true });
    await db.transaction(async (client) => {
      await client.query(
        "UPDATE operations_checkout SET paused=true,revision=revision+1,updated_at=now() WHERE singleton",
      );
      await client.query(
        "INSERT INTO deployment_recoveries(id,archive_id,source_snapshot_at,release_id,state,started_at) VALUES($1,$2,$3,$4,'MONEY_REVIEW',$5)",
        [
          randomUUID(),
          header.id,
          header.snapshot_at,
          header.release,
          new Date(started),
        ],
      );
      // Previously issued cookies must not become valid again after rollback in time.
      await client.query(
        "UPDATE sessions SET revoked_at=COALESCE(revoked_at,now())",
      );
      await client.query(
        "UPDATE staff_sessions SET revoked_at=COALESCE(revoked_at,now())",
      );
    });
    const deletion = await reapplyPrivacyTombstones(db, config);
    await db.pool.query(
      "UPDATE deployment_recoveries SET privacy_reapplied_at=now() WHERE archive_id=$1",
      [header.id],
    );
    await db.pool.query(
      "UPDATE recovery_guard.attempt SET state='PRIVACY_REAPPLIED' WHERE singleton",
    );
    return {
      archive_id: header.id,
      source_snapshot_at: header.snapshot_at,
      restored_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      tombstones_reapplied: deletion.applied,
      checkout_paused: true,
      money_reconciliation_required: true,
      release: header.release,
    };
  } finally {
    await archive.close();
    await db.close();
  }
}
