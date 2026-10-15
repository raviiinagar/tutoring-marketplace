import type { PoolClient } from "pg";
import { ApiProblem } from "./errors.js";
export async function requireSafetyClear(
  client: PoolClient,
  kind: "ACCOUNT" | "LISTING" | "CONNECTION",
  id: string,
) {
  if (
    (
      await client.query(
        "SELECT 1 FROM safety_restrictions WHERE target_type=$1 AND target_id=$2 AND lifted_at IS NULL LIMIT 1",
        [kind, id],
      )
    ).rowCount
  )
    throw new ApiProblem(
      403,
      "SAFETY_RESTRICTED",
      "This account or interaction is restricted. Open Safety and reports for the decision and appeal options.",
    );
}
