import { loadConfig } from "./config.js";
import { Database } from "./database.js";
import {
  initializePrivacyLedger,
  privacyTombstones,
} from "./privacy-ledger.js";
import { reapplyPrivacyTombstones } from "./privacy-worker.js";

async function main() {
  const [command, environment, offline] = process.argv.slice(2),
    config = loadConfig();
  if (
    environment !== config.mode ||
    offline !== "--traffic-stopped" ||
    !["init-ledger", "validate-ledger", "reapply"].includes(command) ||
    process.argv.length !== 5
  )
    throw new Error(
      "Expected init-ledger|validate-ledger|reapply <environment> --traffic-stopped. Stop API and workers first.",
    );
  if (command === "init-ledger") {
    await initializePrivacyLedger(config);
    console.log("Empty ledger initialized or existing signed index validated.");
    return;
  }
  const entries = await privacyTombstones(config);
  if (command === "validate-ledger") {
    console.log("Signed privacy ledger validated; entries: " + entries.length);
    return;
  }
  const database = new Database(config.databaseUrl);
  try {
    const result = await reapplyPrivacyTombstones(database, config);
    console.log(
      "Privacy tombstones reapplied: " +
        result.applied +
        ". Keep traffic stopped until payment reconciliation and recovery checks complete.",
    );
  } finally {
    await database.close();
  }
}
main().catch(() => {
  console.error(
    "Privacy operator failed. Check offline arguments, configured storage, complete signed ledger, encryption key and migrations. Traffic must remain stopped.",
  );
  process.exitCode = 1;
});
