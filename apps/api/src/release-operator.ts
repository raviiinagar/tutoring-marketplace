import { loadConfig } from "./config.js";
import { Database, migrate } from "./database.js";
import { assertPrivateDatabase } from "./deployment.js";

async function main() {
  const [command, environment, directory, offline] = process.argv.slice(2),
    config = loadConfig();
  if (
    command !== "check" ||
    environment !== process.env.APP_ENVIRONMENT ||
    !directory ||
    offline !== "--traffic-stopped" ||
    process.argv.length !== 6
  )
    throw new Error(
      "Expected check <APP_ENVIRONMENT> <candidate-migrations-directory> --traffic-stopped",
    );
  const db = new Database(config.databaseUrl);
  try {
    await assertPrivateDatabase(config, db);
    const result = await migrate(db, { directory, verifyOnly: true });
    console.log(
      JSON.stringify({
        schema_compatible: true,
        verified_migrations: result.verified.length,
        database_mutated: false,
        notice:
          "Schema compatibility only. Verify trusted artifact checksum and approved application behaviour before switching the release symlink. Never restore an old financial database for application rollback.",
      }),
    );
  } finally {
    await db.close();
    config.recoveryStore?.destroy();
  }
}
main().catch(() => {
  console.error(
    "Candidate release rejected. Keep current release and financial database; verify environment, immutable migrations and compatibility.",
  );
  process.exitCode = 1;
});
