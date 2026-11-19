import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { createApplication } from "./app.js";
import { loadConfig } from "./config.js";
import { Database } from "./database.js";
import { ListingsService } from "./listings.js";
import { applyEntry, applyProfileAds, planProfileAds } from "./profile-ads.js";

/**
 * ADR0021 operator command: give published Tutor profiles without an available ad their
 * first ad, with the owner's confirmation that those Tutors consented.
 *
 *   plan  --environment production [--out plan.json]
 *     Read-only. Prints each candidate, the proposed ad and what is missing, and writes a
 *     template the owner fills in (level, board or exam, and any changes).
 *
 *   apply --environment production --file filled.json --operator-email staff@example
 *         --reason "Owner confirmed consent on ..." --confirm yes
 *     Creates and publishes one ad per entry through the normal ad service, audited
 *     under the operator's staff account. Safe to re-run.
 */
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "plan" && command !== "apply") throw new Error("Expected plan or apply.");
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!key?.startsWith("--") || args[index + 1] === undefined || values[key.slice(2)] !== undefined)
      throw new Error("Expected distinct --name value arguments.");
    values[key.slice(2)] = args[index + 1]!;
  }
  const config = loadConfig();
  if (values.environment !== config.mode) throw new Error("Explicit --environment must match NODE_ENV.");
  const database = new Database(config.databaseUrl);
  try {
    if (command === "plan") {
      const plan = await planProfileAds(database);
      if (values.out) await writeFile(values.out, JSON.stringify(plan.template, null, 2) + "\n", { mode: 0o600 });
      console.log(JSON.stringify({ candidates: plan.candidates, choices: plan.choices }, null, 2));
      console.log(`${plan.candidates.length} profile(s) without an available ad.${values.out ? " Template written to " + values.out + "." : ""}`);
      return;
    }
    const input = z
      .strictObject({
        environment: z.string(),
        file: z.string().min(1),
        "operator-email": z.string().trim().pipe(z.email()),
        reason: z.string().trim().min(10).max(240),
        confirm: z.literal("yes"),
      })
      .parse(values);
    const entries = z.array(applyEntry).min(1).max(100).parse(JSON.parse(await readFile(input.file, "utf8")));
    const app = await createApplication(config, database);
    try {
      const results = await applyProfileAds(database, app.get(ListingsService), entries, input["operator-email"], input.reason);
      console.log(JSON.stringify(results, null, 2));
      const failed = results.filter((r) => r.outcome === "FAILED").length;
      console.log(`${results.filter((r) => r.outcome === "PUBLISHED").length} published, ${results.filter((r) => r.outcome === "SKIPPED").length} skipped, ${failed} failed.`);
      if (failed) process.exitCode = 1;
    } finally {
      await app.close();
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error("Profile ads operator command failed: " + (error instanceof Error ? error.message : "unknown error"));
  process.exitCode = 1;
});
