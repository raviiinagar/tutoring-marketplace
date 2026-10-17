import { access } from "node:fs/promises";
import type { Config } from "./config.js";
import { migrate, type Database } from "./database.js";
import { validateIndependentPrivacyLedger } from "./privacy-ledger.js";

/** Production entrypoint gate; isolated application tests keep their adapters. */
export async function assertDeploymentReady(
  config: Config,
  database: Database,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (config.mode === "production") {
    const url = new URL(config.databaseUrl);
    if (
      url.searchParams.get("sslmode") !== "verify-full" ||
      !url.searchParams.get("sslrootcert")
    )
      throw new Error("VERIFIED_DATABASE_TLS_REQUIRED");
  }
  const guard = (
    await database.pool.query(
      "SELECT to_regclass('recovery_guard.attempt') AS present,to_regclass('public.deployment_recoveries') AS recoveries",
    )
  ).rows[0];
  if (
    guard.present &&
    (
      await database.pool.query(
        "SELECT state FROM recovery_guard.attempt WHERE singleton",
      )
    ).rows[0]?.state !== "PRIVACY_REAPPLIED"
  )
    throw new Error("PRIVACY_RECOVERY_INCOMPLETE_KEEP_OFFLINE");
  await migrate(database, { verifyOnly: true });
  const recovery = guard.recoveries
    ? (
        await database.pool.query(
          "SELECT privacy_reapplied_at FROM deployment_recoveries WHERE state<>'RELEASED'",
        )
      ).rows
    : [];
  if (recovery.some((row) => !row.privacy_reapplied_at))
    throw new Error("PRIVACY_RECOVERY_INCOMPLETE_KEEP_OFFLINE");
  if (config.mode !== "production")
    return { recoveryPending: recovery.length > 0 };
  const url = new URL(config.databaseUrl);
  if (
    url.searchParams.get("sslmode") !== "verify-full" ||
    !url.searchParams.get("sslrootcert")
  )
    throw new Error("VERIFIED_DATABASE_TLS_REQUIRED");
  if (
    !["staging", "production"].includes(env.APP_ENVIRONMENT || "") ||
    !env.RELEASE_ID ||
    !/^[a-zA-Z0-9._-]{4,100}$/.test(env.RELEASE_ID)
  )
    throw new Error("ISOLATED_DEPLOYMENT_ID_REQUIRED");
  if (env.APP_ENVIRONMENT === "staging" && config.payments)
    throw new Error("STAGING_LIVE_PAYMENTS_FORBIDDEN");
  if (
    !config.privacy ||
    !config.recoveryStore ||
    !config.operations?.ownerId ||
    config.evidenceScanner !== "clamav"
  )
    throw new Error("PRODUCTION_OPERATIONS_CONFIGURATION_REQUIRED");
  await validateIndependentPrivacyLedger(config);
  await assertPrivateDatabase(config, database);
  return { recoveryPending: recovery.length > 0 };
}
export async function assertPrivateDatabase(
  config: Config,
  database: Database,
) {
  if (config.mode !== "production") return;
  const url = new URL(config.databaseUrl);
  if (
    url.searchParams.get("sslmode") !== "verify-full" ||
    !url.searchParams.get("sslrootcert")
  )
    throw new Error("VERIFIED_DATABASE_TLS_REQUIRED");
  await access(url.searchParams.get("sslrootcert")!);
  const tls = (
    await database.pool.query(
      "SELECT s.ssl,s.version,inet_server_addr()::text AS address FROM pg_stat_ssl s WHERE s.pid=pg_backend_pid()",
    )
  ).rows[0];
  const address = tls?.address || "";
  if (
    !tls?.ssl ||
    !["TLSv1.2", "TLSv1.3"].includes(tls.version) ||
    !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)
  )
    throw new Error("PRIVATE_VERIFIED_DATABASE_CONNECTION_REQUIRED");
}
