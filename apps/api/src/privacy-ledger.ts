import { createHmac, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  lstat,
  rename,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import type { Config } from "./config.js";
import { retentionPolicy } from "./privacy-policy.js";
const entrySchema = z.strictObject({
  version: z.literal("privacy-ledger-v1"),
  id: z.uuid(),
  user_id: z.uuid(),
  kind: z.enum(["DELETE", "WITHDRAW"]),
  profile_id: z.uuid().nullable(),
  email_hash: z.string().regex(/^[a-f0-9]{64}$/),
  created_at: z.iso.datetime(),
  policy_snapshot: retentionPolicy,
  test_only: z.boolean(),
  withdraw_scope: z
    .strictObject({
      consent_ids: z.array(z.uuid()),
      request_ids: z.array(z.uuid()),
    })
    .optional(),
});
export type PrivacyTombstone = z.infer<typeof entrySchema>;
function sign(entry: PrivacyTombstone, config: Config) {
  return createHmac("sha256", config.authSecret)
    .update("privacy-ledger:" + JSON.stringify(entry))
    .digest("hex");
}
const indexSchema = z.strictObject({
  version: z.literal("privacy-index-v1"),
  ids: z.array(z.uuid()),
});
function indexMac(value: unknown, config: Config) {
  return createHmac("sha256", config.authSecret)
    .update("privacy-index:" + JSON.stringify(value))
    .digest("hex");
}
async function readIndex(config: Config) {
  if (!config.privacy) throw new Error("PRIVACY_STORAGE_REQUIRED");
  const value = JSON.parse(
    await readFile(join(config.privacy.tombstoneDir, "index.json"), "utf8"),
  );
  const index = indexSchema.parse(value.index);
  if (value.mac !== indexMac(index, config))
    throw new Error("INVALID_PRIVACY_INDEX");
  return index;
}
async function writeIndex(ids: string[], config: Config) {
  const index = {
      version: "privacy-index-v1" as const,
      ids: [...new Set(ids)].sort(),
    },
    temp = join(config.privacy!.tombstoneDir, "index-" + randomUUID() + ".tmp");
  const file = await open(temp, "wx", 0o600);
  try {
    await file.writeFile(
      JSON.stringify({ index, mac: indexMac(index, config) }),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temp, join(config.privacy!.tombstoneDir, "index.json"));
}
export async function initializePrivacyLedger(config: Config) {
  if (!config.privacy) throw new Error("PRIVACY_STORAGE_REQUIRED");
  await mkdir(config.privacy.tombstoneDir, { recursive: true, mode: 0o700 });
  try {
    await readIndex(config);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const files = await readdir(config.privacy.tombstoneDir);
    if (files.some((f) => /^[a-f0-9-]{36}\.json$/.test(f)))
      throw new Error("EXISTING_TOMBSTONES_REQUIRE_INDEX_RECOVERY");
    await writeIndex([], config);
  }
}
export async function persistPrivacyTombstone(
  job: Record<string, any>,
  config: Config,
) {
  if (!config.privacy) throw new Error("PRIVACY_STORAGE_REQUIRED");
  const entry = entrySchema.parse({
    version: "privacy-ledger-v1",
    id: job.id,
    user_id: job.user_id,
    kind: job.kind,
    profile_id: job.profile_id,
    email_hash: job.email_hash,
    created_at: new Date(job.created_at).toISOString(),
    policy_snapshot: job.policy_snapshot,
    test_only: job.test_only,
    ...(job.kind === "WITHDRAW" ? { withdraw_scope: job.withdraw_scope } : {}),
  });
  // Live storage must be initialized before traffic. A missing index must never
  // silently replace an existing recovery ledger.
  if (config.mode !== "production") await initializePrivacyLedger(config);
  const prior = await readIndex(config);
  await mkdir(config.privacy.tombstoneDir, { recursive: true, mode: 0o700 });
  const path = join(config.privacy.tombstoneDir, entry.id + ".json");
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(
        JSON.stringify({ entry, mac: sign(entry, config) }),
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const existing = JSON.parse(await readFile(path, "utf8"));
    if (
      JSON.stringify(existing.entry) !== JSON.stringify(entry) ||
      existing.mac !== sign(entry, config)
    )
      throw new Error("TOMBSTONE_CONFLICT");
  }
  // Callers serialize writes with the database advisory lock; atomic rename protects readers.
  await writeIndex([...prior.ids, entry.id], config);
}
export async function privacyTombstones(config: Config) {
  if (!config.privacy) throw new Error("PRIVACY_STORAGE_REQUIRED");
  let files: string[], index: z.infer<typeof indexSchema>;
  try {
    files = await readdir(config.privacy.tombstoneDir);
    index = await readIndex(config);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error("PRIVACY_LEDGER_UNAVAILABLE");
    throw e;
  }
  if (index.ids.some((id) => !files.includes(id + ".json")))
    throw new Error("PRIVACY_LEDGER_INCOMPLETE");
  const entries: PrivacyTombstone[] = [];
  for (const file of files) {
    if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
    const path = join(config.privacy.tombstoneDir, file),
      stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("INVALID_TOMBSTONE_FILE");
    const value = JSON.parse(await readFile(path, "utf8")),
      entry = entrySchema.parse(value.entry);
    if (
      file !== entry.id + ".json" ||
      typeof value.mac !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.mac) ||
      !timingSafeEqual(
        Buffer.from(value.mac, "hex"),
        Buffer.from(sign(entry, config), "hex"),
      )
    )
      throw new Error("INVALID_TOMBSTONE_SIGNATURE");
    if (
      config.mode === "production" &&
      (entry.test_only || entry.policy_snapshot.test_only)
    )
      throw new Error("TEST_TOMBSTONE_FORBIDDEN");
    entries.push(entry);
  }
  return entries;
}
