import { z } from "zod";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { ApiProblem } from "./errors.js";
const rule = z.strictObject({
  days: z.number().int().min(0).max(3650),
  purpose: z.string().trim().min(20).max(300),
});
export const retentionPolicy = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{5,79}$/),
  test_only: z.boolean(),
  approved_by: z.string().trim().min(5).max(120),
  approval_reference: z.string().trim().min(10).max(240),
  classes: z.strictObject({
    ACCOUNT: rule,
    PHOTO: rule,
    EVIDENCE: rule,
    SAFETY: rule,
    SUPPORT: rule,
    FINANCE: rule,
  }),
});
export type RetentionPolicy = z.infer<typeof retentionPolicy>;
export type PrivacyConfig = { policy: RetentionPolicy; tombstoneDir: string };
export function privacyConfig(
  env: NodeJS.ProcessEnv,
  mode: string,
): PrivacyConfig | undefined {
  const source = env.PRIVACY_RETENTION_POLICY_FILE
    ? readFileSync(resolve(env.PRIVACY_RETENTION_POLICY_FILE), "utf8")
    : env.PRIVACY_RETENTION_POLICY;
  if (!source) {
    if (mode === "production")
      throw new Error(
        "Production requires an approved privacy retention schedule.",
      );
    return undefined;
  }
  const policy = retentionPolicy.parse(JSON.parse(source));
  if (
    mode === "production" &&
    (policy.test_only || env.PRIVACY_POLICY_APPROVED !== "true")
  )
    throw new Error(
      "Production requires an approved live privacy retention schedule.",
    );
  if (!env.PRIVACY_TOMBSTONE_DIR)
    throw new Error(
      "Privacy erasure requires independent durable tombstone storage.",
    );
  if (
    mode === "production" &&
    env.PRIVACY_LEDGER_DURABILITY_CONFIRMED !== "true"
  )
    throw new Error(
      "Production requires independently durable tombstone storage confirmation.",
    );
  return { policy, tombstoneDir: resolve(env.PRIVACY_TOMBSTONE_DIR) };
}
export async function ensurePrivacyPolicy(
  client: PoolClient,
  policy: RetentionPolicy,
  at: Date,
) {
  await client.query(
    "INSERT INTO privacy_policies(id,snapshot,created_at) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
    [policy.id, policy, at],
  );
  if (
    !(
      await client.query(
        "SELECT id FROM privacy_policies WHERE id=$1 AND snapshot=$2::jsonb",
        [policy.id, policy],
      )
    ).rowCount
  )
    throw new ApiProblem(
      409,
      "PRIVACY_POLICY_CONFLICT",
      "Use a new approved policy version when changing retention rules.",
    );
}
