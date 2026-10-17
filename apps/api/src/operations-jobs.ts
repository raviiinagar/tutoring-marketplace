import type { PoolClient } from "pg";
import type { Config } from "./config.js";
export type JobKind =
  | "NOTIFICATION"
  | "AUTH_MAIL"
  | "PAYMENT_EVENT"
  | "REFUND"
  | "RECONCILIATION"
  | "PURCHASE";
export const jobScope = (kind: JobKind) =>
  kind === "NOTIFICATION" || kind === "AUTH_MAIL"
    ? ("SUPPORT" as const)
    : ("FINANCE" as const);
export async function completedOperation(
  client: PoolClient,
  config: Config,
  kind: JobKind,
  id: string,
) {
  const clauses: Partial<Record<JobKind, string>> = {
    NOTIFICATION:
      "SELECT 1 FROM notification_outbox WHERE id::text=$1 AND test_only=$2 AND status IN ('SENT','SUPPRESSED')",
    AUTH_MAIL:
      "SELECT 1 FROM mail_outbox WHERE id::text=$1 AND status IN ('SENT','EXPIRED') AND $2::boolean IS NOT NULL",
    PAYMENT_EVENT:
      "SELECT 1 FROM payment_webhook_inbox WHERE event_id=$1 AND provider_key_id=$3 AND status IN ('PROCESSED','IGNORED') AND $2::boolean IS NOT NULL",
    REFUND:
      "SELECT 1 FROM refund_operations r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE r.id::text=$1 AND p.test_only=$2 AND p.provider_key_id=$3 AND r.status='PROCESSED'",
    RECONCILIATION:
      "SELECT 1 FROM reconciliation_runs WHERE id::text=$1 AND test_only=$2 AND provider_key_id=$3 AND status='COMPLETED'",
  };
  const query = clauses[kind];
  if (!query) return false;
  return !!(
    await client.query(
      query + (query.includes("$3") ? "" : " AND $3::text IS NOT NULL"),
      [id, config.mode !== "production", config.payments?.keyId || ""],
    )
  ).rowCount;
}
export async function operationJobs(
  client: PoolClient,
  config: Config,
  scope: "SUPPORT" | "FINANCE",
  at: Date,
  target?: { kind: JobKind; id: string },
) {
  const sql =
    scope === "SUPPORT"
      ? `
 SELECT id::text,'NOTIFICATION' kind,status,created_at,updated_at,attempts,lease_until,
  CASE WHEN channel='SMS' AND status IN ('UNKNOWN','PROCESSING') THEN 'RECONCILE_PROVIDER' WHEN status='PROCESSING' AND lease_until>$3 THEN 'WAIT' ELSE 'REPLAY' END recovery
 FROM notification_outbox WHERE test_only=$1 AND status NOT IN ('SENT','SUPPRESSED')
 UNION ALL SELECT id::text,'AUTH_MAIL',status,created_at,created_at,attempts,lease_until,
  CASE WHEN expires_at<=$3 THEN 'EXPIRED' WHEN status='PROCESSING' AND lease_until>$3 THEN 'WAIT' ELSE 'REPLAY' END
 FROM mail_outbox WHERE status IN ('PENDING','PROCESSING','FAILED')`
      : `
 SELECT event_id AS id,'PAYMENT_EVENT' AS kind,status,received_at AS created_at,COALESCE(processed_at,received_at) AS updated_at,attempts,NULL::timestamptz AS lease_until,
  CASE WHEN status='REVIEW' THEN 'MANUAL_RECONCILIATION' ELSE 'REPLAY' END recovery
 FROM payment_webhook_inbox WHERE provider_key_id=$2 AND status IN ('PENDING','UNMATCHED','REVIEW')
 UNION ALL SELECT r.id::text,'REFUND',r.status,r.created_at,r.updated_at,r.attempts,r.lease_until,
  CASE WHEN r.lease_until>$3 THEN 'WAIT' ELSE 'REPLAY' END
 FROM refund_operations r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE p.test_only=$1 AND p.provider_key_id=$2 AND r.status<>'PROCESSED'
 UNION ALL SELECT id::text,'RECONCILIATION',status,created_at,updated_at,0,lease_until,
  CASE WHEN status='REVIEW' THEN 'REPLAY' ELSE 'WAIT' END
 FROM reconciliation_runs WHERE provider_key_id=$2 AND test_only=$1 AND status<>'COMPLETED'
 UNION ALL SELECT id::text,'PURCHASE',status,created_at,updated_at,0,NULL::timestamptz,'MANUAL_RECONCILIATION'
 FROM purchase_cycles WHERE provider_key_id=$2 AND test_only=$1 AND status IN ('UNKNOWN','VERIFYING','CREATING','REVIEW')`;
  return (
    await client.query(
      `SELECT id,kind,status,created_at,updated_at,attempts,lease_until,recovery FROM (${sql}) jobs WHERE ($4::text IS NULL OR (kind=$4 AND id=$5)) AND $2::text IS NOT NULL ORDER BY CASE WHEN status IN ('FAILED','REVIEW','UNKNOWN','CONFIG_REQUIRED') THEN 0 ELSE 1 END,created_at,id LIMIT 100`,
      [
        config.mode !== "production",
        config.payments?.keyId || "",
        at,
        target?.kind || null,
        target?.id || null,
      ],
    )
  ).rows;
}
