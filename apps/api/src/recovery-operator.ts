import { readFile, writeFile, mkdir, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { Database } from "./database.js";
import {
  createRecoveryExport,
  restoreRecoveryExport,
  inspectRecoveryExport,
} from "./recovery.js";
import {
  publishPrivacyLedger,
  fetchIndependentPrivacyLedger,
  validateIndependentPrivacyLedger,
} from "./privacy-ledger.js";

async function main() {
  const [command, environment, argument, ...flags] = process.argv.slice(2),
    config = loadConfig();
  if (
    ![
      "export",
      "publish",
      "restore",
      "download",
      "publish-ledger",
      "fetch-ledger",
      "validate-ledger",
    ].includes(command) ||
    !environment ||
    !argument ||
    environment !== process.env.APP_ENVIRONMENT
  )
    throw new Error("Invalid recovery command or environment identity.");
  try {
    if (
      ["staging", "production"].includes(environment) !==
      (config.mode === "production")
    )
      throw new Error("RECOVERY_RUNTIME_ENVIRONMENT_MISMATCH");
    if (command.endsWith("-ledger")) {
      if (argument !== "--traffic-stopped" || flags.length)
        throw new Error("Ledger operators require stopped API/workers.");
      if (command === "fetch-ledger") {
        console.log(
          JSON.stringify(await fetchIndependentPrivacyLedger(config)),
        );
        return;
      }
      if (command === "validate-ledger") {
        console.log(
          JSON.stringify(await validateIndependentPrivacyLedger(config)),
        );
        return;
      }
      const db = new Database(config.databaseUrl);
      try {
        const result = await db.transaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(73501923)");
          return publishPrivacyLedger(config);
        });
        console.log(JSON.stringify(result));
      } finally {
        await db.close();
      }
      return;
    }
    const keyFile = process.env.BACKUP_KEY_FILE,
      tools = process.env.PG_RECOVERY_BIN;
    if (!keyFile || !tools)
      throw new Error(
        "Independent backup key file and matching PostgreSQL client bin directory are required.",
      );
    if (process.platform !== "win32" && (await stat(keyFile)).mode & 0o077)
      throw new Error("BACKUP_KEY_FILE_MUST_BE_PRIVATE");
    const encoded = (await readFile(keyFile, "utf8")).trim();
    if (!/^[a-f0-9]{64}$/i.test(encoded))
      throw new Error(
        "Backup key must be exactly 32 random bytes encoded as hex.",
      );
    const common = { environment, key: Buffer.from(encoded, "hex"), tools };
    if (command === "download") {
      const [id, version] = flags;
      if (
        flags.length !== 2 ||
        !/^[a-f0-9-]{36}$/.test(id) ||
        !version ||
        !config.recoveryStore
      )
        throw new Error(
          "Download requires local archive path, archive UUID, exact object version and configured independent storage.",
        );
      await config.recoveryStore.downloadArchive(
        "exports/" + id + ".enc",
        version,
        argument,
      );
      const header = await inspectRecoveryExport(argument, common.key);
      if (header.environment !== environment || header.id !== id)
        throw new Error("BACKUP_ENVIRONMENT_MISMATCH");
      console.log(JSON.stringify(header));
      return;
    }
    const path =
      argument === "auto" && command === "publish"
        ? join("/var/lib/tutoring/backups", randomUUID() + ".enc")
        : argument;
    if (command === "export" || command === "publish") {
      if (
        !process.env.RELEASE_ID ||
        flags.some((flag) => flag !== "--remove-local-after-verified") ||
        (command === "export" && flags.length) ||
        flags.length > 1
      )
        throw new Error("Invalid export arguments.");
      if (command === "publish" && !config.recoveryStore)
        throw new Error("INDEPENDENT_RECOVERY_STORAGE_REQUIRED");
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const report = await createRecoveryExport(config, {
        ...common,
        output: path,
        release: process.env.RELEASE_ID,
      });
      await writeFile(path + ".receipt.json", JSON.stringify(report, null, 2), {
        flag: "wx",
        mode: 0o600,
      });
      if (command === "publish") {
        const store = config.recoveryStore!,
          copy = await store.putArchive("exports/" + report.id + ".enc", path);
        if (copy.sha256 !== report.archive_sha256)
          throw new Error("EXPORTED_ARCHIVE_CHANGED_BEFORE_PUBLICATION");
        const receipt = {
          ...report,
          remote_version: copy.version,
          verified_at: new Date().toISOString(),
        };
        await store.put(
          "exports/" + report.id + ".json",
          Buffer.from(JSON.stringify(receipt)),
          { absent: true },
        );
        let prior: Awaited<ReturnType<typeof store.read>> | undefined;
        try {
          prior = await store.read("exports/latest.json");
        } catch (error) {
          if (
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode !== 404
          )
            throw error;
        }
        if (
          prior &&
          Date.parse(JSON.parse(prior.bytes.toString()).snapshot_at) >
            Date.parse(report.snapshot_at)
        )
          throw new Error("NEWER_BACKUP_ALREADY_PUBLISHED");
        await store.put(
          "exports/latest.json",
          Buffer.from(JSON.stringify(receipt)),
          prior ? { etag: prior.etag } : { absent: true },
        );
        const db = new Database(config.databaseUrl);
        try {
          await db.transaction(async (client) => {
            const owner = config.operations?.ownerId;
            if (
              !owner ||
              !(
                await client.query(
                  "SELECT 1 FROM users u JOIN staff_accounts s ON s.user_id=u.id WHERE u.id=$1 AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL AND s.enabled AND 'SUPPORT'=ANY(s.scopes)",
                  [owner],
                )
              ).rowCount
            )
              throw new Error("VERIFIED_BACKUP_ALERT_OWNER_REQUIRED");
            await client.query(
              "INSERT INTO operations_observations(request_key,kind,healthy,observed_at,valid_until,evidence_reference,actor_id,created_at) VALUES($1,'BACKUP',true,$2,$3,$4,$5,now())",
              [
                randomUUID(),
                receipt.verified_at,
                new Date(Date.parse(report.snapshot_at) + 18 * 3600000),
                "backup:" + report.id,
                owner,
              ],
            );
          });
        } finally {
          await db.close();
        }
        if (flags.includes("--remove-local-after-verified")) {
          await unlink(path);
          await unlink(path + ".receipt.json");
        }
        console.log(JSON.stringify(receipt));
        return;
      }
      console.log(JSON.stringify(report));
      return;
    }
    if (
      flags.length !== 2 ||
      !flags.includes("--traffic-stopped") ||
      !flags.includes("--latest-ledger-verified")
    )
      throw new Error(
        "Restore requires --traffic-stopped --latest-ledger-verified; stop API/workers and independently verify latest signed privacy ledger first.",
      );
    const report = await restoreRecoveryExport(config, {
      ...common,
      archive: path,
      trafficStopped: true,
      latestLedgerVerified: true,
    });
    await writeFile(
      path + ".restore-" + Date.now() + ".json",
      JSON.stringify(report, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    console.log(JSON.stringify(report));
  } finally {
    config.recoveryStore?.destroy();
  }
}
main().catch((error) => {
  const known =
    error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "Check recovery arguments, protected key file, complete ledger, PostgreSQL tools and an empty isolated target.";
  console.error(
    "Recovery operator failed: " +
      known +
      " Keep application traffic and workers stopped.",
  );
  process.exitCode = 1;
});
