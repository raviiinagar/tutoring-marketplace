import { randomUUID } from "node:crypto";
import { Database } from "./database.js";
import type { Config } from "./config.js";
import type { PoolClient } from "pg";
export const workerNames = [
  "verification-email",
  "availability",
  "payments",
  "request-deadlines",
  "refunds",
  "financial-events",
  "settlements",
  "notifications",
  "privacy",
  "operations",
] as const;
export type WorkerName = (typeof workerNames)[number];
export class OperationsMonitor {
  private nextCheck = 0;
  private reported = new Map<string, number>();
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async workerResult(name: WorkerName, success: boolean) {
    if (!workerNames.includes(name)) throw new Error("Unknown worker");
    const at = this.now();
    if (success && (this.reported.get(name) || 0) > at.getTime()) return;
    await this.database.pool.query(
      `INSERT INTO operations_worker_health(name,last_seen_at,last_success_at,consecutive_errors) VALUES($1,$2,CASE WHEN $3 THEN $2::timestamptz END,CASE WHEN $3 THEN 0 ELSE 1 END)
   ON CONFLICT(name) DO UPDATE SET last_seen_at=$2,last_success_at=CASE WHEN $3 THEN $2 ELSE operations_worker_health.last_success_at END,consecutive_errors=CASE WHEN $3 THEN 0 ELSE operations_worker_health.consecutive_errors+1 END`,
      [name, at, success],
    );
    this.reported.set(name, success ? at.getTime() + 15000 : 0);
  }
  async tick() {
    if (this.nextCheck > this.now().getTime()) return false;
    await this.scan();
    this.nextCheck = this.now().getTime() + 30000;
    return false;
  }
  async scan() {
    return this.database.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(73501925)");
      const at = this.now(),
        testOnly = this.config.mode !== "production",
        key = this.config.payments?.keyId || "";
      const findings: {
        code: string;
        scope: "SUPPORT" | "FINANCE";
        count: number;
      }[] = [];
      const count = async (
        code: string,
        scope: "SUPPORT" | "FINANCE",
        sql: string,
        args: unknown[] = [],
      ) => {
        const n = Number((await client.query(sql, args)).rows[0].n);
        if (n) findings.push({ code, scope, count: n });
      };
      await count(
        "UNKNOWN_PAYMENTS",
        "FINANCE",
        "SELECT count(*) n FROM purchase_cycles WHERE provider_key_id=$1 AND test_only=$2 AND status IN ('CREATING','UNKNOWN','VERIFYING') AND updated_at<=$3",
        [key, testOnly, new Date(at.getTime() - 300000)],
      );
      await count(
        "CAPTURE_WITHOUT_ACTIVATION",
        "FINANCE",
        `SELECT count(*) n FROM purchase_cycles p WHERE provider_key_id=$1 AND test_only=$2 AND captured_at IS NOT NULL AND matching_deadline<=$3 AND NOT EXISTS(SELECT 1 FROM access_entitlements e WHERE e.cycle_id=p.id AND e.starts_at IS NOT NULL) AND EXISTS(SELECT 1 FROM payment_journal j WHERE j.cycle_id=p.id AND j.amount_paise>(SELECT COALESCE(sum(amount_paise),0) FROM reversal_journal r WHERE r.capture_id=j.id))`,
        [key, testOnly, at],
      );
      await count(
        "REFUND_FAILURES",
        "FINANCE",
        "SELECT count(*) n FROM refund_operations r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE p.provider_key_id=$1 AND p.test_only=$2 AND (r.status IN ('FAILED','REVIEW') OR r.last_error='INSUFFICIENT_RESERVE')",
        [key, testOnly],
      );
      await count(
        "RECONCILIATION_EXCEPTIONS",
        "FINANCE",
        "SELECT count(*) n FROM finance_exceptions WHERE provider_key_id=$1 AND test_only=$2 AND status='OPEN' AND kind NOT IN ('BANK_CREDIT_PENDING','BANK_RECEIPT_UNMATCHED')",
        [key, testOnly],
      );
      await count(
        "REFUND_QUEUE_AGE",
        "FINANCE",
        "SELECT count(*) n FROM refund_operations r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE p.provider_key_id=$1 AND p.test_only=$2 AND r.status<>'PROCESSED' AND r.created_at<=$3",
        [key, testOnly, new Date(at.getTime() - 900000)],
      );
      await count(
        "RECONCILIATION_QUEUE_AGE",
        "FINANCE",
        "SELECT count(*) n FROM reconciliation_runs WHERE provider_key_id=$1 AND test_only=$2 AND status<>'COMPLETED' AND (status='REVIEW' OR created_at<=$3)",
        [key, testOnly, new Date(at.getTime() - 900000)],
      );
      await count(
        "PAYMENT_QUEUE_AGE",
        "FINANCE",
        "SELECT count(*) n FROM payment_webhook_inbox WHERE provider_key_id=$1 AND status IN ('PENDING','UNMATCHED') AND received_at<=$2",
        [key, new Date(at.getTime() - 900000)],
      );
      await count(
        "PAYMENT_REPEATED_ERRORS",
        "FINANCE",
        "SELECT count(*) n FROM payment_webhook_inbox WHERE provider_key_id=$1 AND (status='REVIEW' OR (status IN ('PENDING','UNMATCHED') AND attempts>=3))",
        [key],
      );
      await count(
        "NOTIFICATION_QUEUE_AGE",
        "SUPPORT",
        "SELECT count(*) n FROM notification_outbox WHERE test_only=$1 AND category<>'OPERATIONS' AND status IN ('PENDING','PROCESSING') AND created_at<=$2",
        [testOnly, new Date(at.getTime() - 900000)],
      );
      await count(
        "NOTIFICATION_ERRORS",
        "SUPPORT",
        "SELECT count(*) n FROM notification_outbox WHERE test_only=$1 AND status IN ('FAILED','CONFIG_REQUIRED','UNKNOWN')",
        [testOnly],
      );
      await count(
        "AUTH_MAIL_FAILURES",
        "SUPPORT",
        "SELECT count(*) n FROM mail_outbox WHERE expires_at>$1 AND (status='FAILED' OR (status IN ('PENDING','PROCESSING') AND created_at<=$2))",
        [at, new Date(at.getTime() - 300000)],
      );
      await count(
        "WORKER_ERRORS",
        "SUPPORT",
        "SELECT count(*) n FROM operations_worker_health WHERE consecutive_errors>=3",
      );
      await count(
        "WORKER_STALE",
        "SUPPORT",
        "SELECT count(*) n FROM operations_worker_health WHERE last_seen_at<=$1",
        [new Date(at.getTime() - 180000)],
      );
      await count(
        "SECURITY_RECOVERY",
        "SUPPORT",
        "SELECT count(*) n FROM audit_events WHERE event_type='STAFF_MFA_RECOVERED' AND created_at>$1",
        [new Date(at.getTime() - 86400000)],
      );
      const observations = (
        await client.query(
          "SELECT DISTINCT ON(kind) kind,healthy,valid_until FROM operations_observations ORDER BY kind,observed_at DESC,created_at DESC",
        )
      ).rows;
      for (const [kind, code, required] of [
        ["WEBHOOK_DELIVERY", "WEBHOOK_UNHEALTHY", !!this.config.payments],
        ["BACKUP", "BACKUP_UNHEALTHY", true],
        ["SECURITY", "SECURITY_OBSERVATION", false],
      ] as const) {
        const row = observations.find((r) => r.kind === kind);
        if (
          (row && (!row.healthy || new Date(row.valid_until) <= at)) ||
          (!row && required && this.config.mode === "production")
        )
          findings.push({
            code,
            scope: kind === "WEBHOOK_DELIVERY" ? "FINANCE" : "SUPPORT",
            count: 1,
          });
      }
      const current = (
        await client.query(
          "SELECT id,code,scope FROM operations_alerts WHERE status='OPEN' FOR UPDATE",
        )
      ).rows;
      for (const row of current)
        if (!findings.some((f) => f.code === row.code && f.scope === row.scope))
          await client.query(
            "UPDATE operations_alerts SET status='RESOLVED',resolved_at=$2 WHERE id=$1",
            [row.id, at],
          );
      for (const f of findings)
        await client.query(
          "INSERT INTO operations_alerts(id,code,scope,status,count,opened_at,last_seen_at) VALUES($1,$2,$3,'OPEN',$4,$5,$5) ON CONFLICT(code,scope) WHERE status='OPEN' DO UPDATE SET count=EXCLUDED.count,last_seen_at=EXCLUDED.last_seen_at",
          [randomUUID(), f.code, f.scope, f.count, at],
        );
      await this.route(client, at, testOnly);
      await client.query(
        "UPDATE operations_monitor_checkpoint SET checked_at=$1 WHERE singleton",
        [at],
      );
    });
  }
  private async route(client: PoolClient, at: Date, testOnly: boolean) {
    const owner = this.config.operations?.ownerId;
    if (!owner) return;
    const rows = (
      await client.query(
        "SELECT a.id FROM operations_alerts a JOIN users u ON u.id=$1 AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL JOIN staff_accounts s ON s.user_id=u.id AND s.enabled AND a.scope=ANY(s.scopes) WHERE a.status='OPEN'",
        [owner],
      )
    ).rows;
    for (const row of rows) {
      await client.query(
        "SELECT queue_notification($1,$2,'OPERATOR_SYSTEM_EMAIL',$3,'OPERATOR',$4,$5)",
        ["operation:" + row.id + ":" + owner, owner, row.id, testOnly, at],
      );
      if (this.config.sms?.operationsContentSid)
        await client.query(
          "SELECT queue_notification($1,$2,'OPERATOR_SYSTEM_SMS',$3,'OPERATOR',$4,$5)",
          ["operation:" + row.id + ":" + owner, owner, row.id, testOnly, at],
        );
    }
  }
}
