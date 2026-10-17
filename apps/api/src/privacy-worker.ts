import { randomUUID } from "node:crypto";
import { Database } from "./database.js";
import type { Config } from "./config.js";
import { personalExport } from "./privacy-inventory.js";
import { encrypt } from "./security.js";
import {
  stopPrivacyActivity,
  erasePrivacyData,
  eraseCapturedMail,
  retentionHeld,
} from "./privacy-erasure.js";
import {
  persistPrivacyTombstone,
  privacyTombstones,
} from "./privacy-ledger.js";
import { sweepPrivateEvidence } from "./privacy-retention.js";
import { ensurePrivacyPolicy } from "./privacy-policy.js";
export class PrivacyWorker {
  private nextSweep = 0;
  private retentionCursor: { expires_at: Date; id: string } | undefined;
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async tick() {
    if (this.config.privacy && this.now().getTime() >= this.nextSweep) {
      this.nextSweep = this.now().getTime() + 300000;
      try {
        await sweepPrivateEvidence(this.database, this.config, this.now());
      } catch {
        console.error(
          "Private evidence retention sweep temporarily unavailable.",
        );
      }
    }
    await this.database.pool.query(
      "UPDATE privacy_requests SET status='FAILED',last_error='PRIVACY_PROCESSING_FAILED',lease_token=NULL,lease_until=NULL WHERE status='PROCESSING' AND lease_until<=$1 AND attempts>=5",
      [this.now()],
    );
    await this.database.pool.query(
      "DELETE FROM privacy_verifications WHERE expires_at<=$1",
      [this.now()],
    );
    await this.database.pool.query(
      "DELETE FROM privacy_receipts WHERE expires_at<=$1",
      [this.now()],
    );
    await this.database.pool.query(
      "DELETE FROM privacy_exports WHERE expires_at<=$1",
      [this.now()],
    );
    const retained = (
      await this.database.pool.query(
        "SELECT * FROM privacy_retained WHERE encrypted_payload IS NOT NULL AND expires_at<=$1 AND ($2::timestamptz IS NULL OR (expires_at,id)>($2::timestamptz,$3::uuid)) ORDER BY expires_at,id LIMIT 100",
        [
          this.now(),
          this.retentionCursor?.expires_at || null,
          this.retentionCursor?.id || null,
        ],
      )
    ).rows;
    this.retentionCursor =
      retained.length === 100 ? retained[retained.length - 1] : undefined;
    for (const row of retained)
      await this.database.transaction(async (client) => {
        await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          row.user_id,
        ]);
        if (!(await retentionHeld(client, row)))
          await client.query(
            "UPDATE privacy_retained SET encrypted_payload=NULL,purged_at=$2 WHERE id=$1 AND encrypted_payload IS NOT NULL",
            [row.id, this.now()],
          );
      });
    const candidate = (
      await this.database.pool.query(
        "SELECT id,user_id FROM privacy_requests WHERE (status IN ('QUEUED','RETRYING') AND available_at<=$1 OR status='PROCESSING' AND lease_until<=$1) AND attempts<5 AND (NOT $2::boolean OR NOT test_only) ORDER BY created_at,id LIMIT 1",
        [this.now(), this.config.mode === "production"],
      )
    ).rows[0];
    if (!candidate) return false;
    const lease = randomUUID();
    const job = await this.database.transaction(async (client) => {
      const user = (
        await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
          candidate.user_id,
        ])
      ).rows[0];
      const result = await client.query(
        "UPDATE privacy_requests SET status='PROCESSING',lease_token=$2,lease_until=$3,attempts=attempts+1 WHERE id=$1 AND (status IN ('QUEUED','RETRYING') AND available_at<=$4 OR status='PROCESSING' AND lease_until<=$4) RETURNING *",
        [
          candidate.id,
          lease,
          new Date(this.now().getTime() + 300000),
          this.now(),
        ],
      );
      return result.rows[0] ? { ...result.rows[0], user } : undefined;
    });
    if (!job) return true;
    try {
      if (job.kind !== "EXPORT")
        await this.database.transaction(async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(73501923)");
          await persistPrivacyTombstone(job, this.config);
        });
      await this.database.transaction(async (client) => {
        await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        const user = (
          await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
            job.user_id,
          ])
        ).rows[0];
        const current = (
          await client.query(
            "SELECT * FROM privacy_requests WHERE id=$1 AND lease_token=$2 FOR UPDATE",
            [job.id, lease],
          )
        ).rows[0];
        if (!current) return;
        if (job.kind === "EXPORT") {
          if (
            user.status !== "ACTIVE" ||
            (
              await client.query(
                "SELECT 1 FROM privacy_requests WHERE user_id=$1 AND kind<>'EXPORT' AND status IN ('QUEUED','PROCESSING','RETRYING') LIMIT 1",
                [user.id],
              )
            ).rowCount
          )
            throw new Error("PRIVACY_SOURCE_UNAVAILABLE");
          const data = await personalExport(
              client,
              user,
              this.config,
              this.now(),
            ),
            size = Buffer.byteLength(JSON.stringify(data));
          if (size > 50 * 1024 * 1024) throw new Error("EXPORT_TOO_LARGE");
          const expires = new Date(this.now().getTime() + 86400000);
          await client.query(
            "INSERT INTO privacy_exports(request_id,encrypted_payload,byte_length,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(request_id) DO NOTHING",
            [job.id, encrypt(data, this.config.authSecret), size, expires],
          );
          await client.query(
            "UPDATE privacy_requests SET result=$2 WHERE id=$1",
            [job.id, { expires_at: expires, byte_length: size }],
          );
        } else {
          await stopPrivacyActivity(
            client,
            user,
            job.kind,
            job.profile_id,
            job.email_hash,
            this.now(),
            job.withdraw_scope,
          );
          await erasePrivacyData(client, job, user, this.config, this.now());
          await client.query(
            "UPDATE privacy_requests SET result=$2 WHERE id=$1",
            [
              job.id,
              {
                propagation: {
                  public_pages: "REMOVED",
                  assets: "ERASED",
                  analytics: "NO_EXTERNAL_ANALYTICS_CONFIGURED",
                  notifications: "SUPPRESSED",
                  recovery: "SIGNED_TOMBSTONE_DURABLE",
                },
              },
            ],
          );
        }
      });
      if (job.kind === "DELETE")
        await eraseCapturedMail(this.config, job.email_hash);
      const status =
        job.kind === "DELETE" && this.config.mailTransport === "smtp"
          ? "EXTERNAL_REVIEW"
          : "COMPLETED";
      await this.database.transaction(async (client) => {
        const changed = await client.query(
          "UPDATE privacy_requests SET status=$3,completed_at=CASE WHEN $3='COMPLETED' THEN $4::timestamptz ELSE NULL END,lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2 RETURNING id",
          [job.id, lease, status, this.now()],
        );
        if (changed.rowCount)
          await client.query(
            "INSERT INTO privacy_events(id,request_id,event,metadata,created_at) VALUES($1,$2,$3,$4,$5)",
            [
              randomUUID(),
              job.id,
              "JOB_" + status,
              { kind: job.kind },
              this.now(),
            ],
          );
      });
    } catch (error) {
      const code =
        (error as { code?: string }).code || "PRIVACY_PROCESSING_FAILED";
      console.error(
        "Privacy operation failed; request " +
          job.id +
          "; code " +
          (/^[A-Z0-9_]{1,50}$/.test(code) ? code : "UNKNOWN"),
      );
      const location =
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .find((line) =>
                /privacy-(erasure|ledger|inventory|worker)\.ts:\d/.test(line),
              )
          : undefined;
      if (location) console.error(location.trim());
      await this.database.pool.query(
        "UPDATE privacy_requests SET status=CASE WHEN attempts>=5 THEN 'FAILED' ELSE 'RETRYING' END,last_error='PRIVACY_PROCESSING_FAILED',available_at=$3,lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",
        [job.id, lease, new Date(this.now().getTime() + 60000)],
      );
    }
    return true;
  }
}
export async function reapplyPrivacyTombstones(
  database: Database,
  config: Config,
  now: () => Date = () => new Date(),
) {
  const entries = await privacyTombstones(config);
  let applied = 0;
  // Validate the entire independent ledger before performing any restore-time mutation.
  for (const entry of entries) {
    const exists = (
      await database.pool.query("SELECT id FROM users WHERE id=$1", [
        entry.user_id,
      ])
    ).rowCount;
    if (!exists) continue;
    await database.transaction(async (client) => {
      await ensurePrivacyPolicy(client, entry.policy_snapshot, now());
      const user = (
        await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
          entry.user_id,
        ])
      ).rows[0];
      if (
        entry.kind === "WITHDRAW" &&
        !(
          await client.query(
            "SELECT id FROM learner_profiles WHERE id=$1 AND owner_id=$2",
            [entry.profile_id, user.id],
          )
        ).rowCount
      )
        return;
      await client.query(
        "INSERT INTO privacy_requests(id,user_id,request_key,kind,profile_id,status,verified_at,policy_snapshot,email_hash,test_only,created_at,available_at) VALUES($1,$2,$1,$3,$4,'PROCESSING',$5,$6,$7,$8,$5,$5) ON CONFLICT(id) DO UPDATE SET status='PROCESSING'",
        [
          entry.id,
          user.id,
          entry.kind,
          entry.profile_id,
          new Date(entry.created_at),
          entry.policy_snapshot,
          entry.email_hash,
          entry.test_only,
        ],
      );
      await client.query(
        "INSERT INTO privacy_tombstones(request_id,user_id,kind,profile_id,recorded_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(request_id) DO NOTHING",
        [
          entry.id,
          user.id,
          entry.kind,
          entry.profile_id,
          new Date(entry.created_at),
        ],
      );
      await client.query(
        "UPDATE privacy_requests SET withdraw_scope=$2 WHERE id=$1",
        [entry.id, entry.withdraw_scope || {}],
      );
      await stopPrivacyActivity(
        client,
        user,
        entry.kind,
        entry.profile_id,
        entry.email_hash,
        now(),
        entry.withdraw_scope,
      );
      await erasePrivacyData(
        client,
        { ...entry, policy_snapshot: entry.policy_snapshot },
        user,
        config,
        now(),
      );
      await client.query(
        "UPDATE privacy_requests SET status=$3,completed_at=CASE WHEN $3='COMPLETED' THEN $2::timestamptz ELSE NULL END,lease_token=NULL,lease_until=NULL WHERE id=$1",
        [
          entry.id,
          now(),
          entry.kind === "DELETE" && config.mailTransport === "smtp"
            ? "EXTERNAL_REVIEW"
            : "COMPLETED",
        ],
      );
      await client.query(
        "INSERT INTO privacy_events(id,request_id,event,metadata,created_at) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          entry.id,
          "RESTORE_REAPPLIED",
          { policy: entry.policy_snapshot.id },
          now(),
        ],
      );
    });
    if (entry.kind === "DELETE")
      await eraseCapturedMail(config, entry.email_hash);
    applied++;
  }
  return { applied };
}
