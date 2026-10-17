import { randomUUID } from "node:crypto";
import { Database } from "./database.js";
import type { Config } from "./config.js";
import { ensurePrivacyPolicy } from "./privacy-policy.js";
import { retentionHeld } from "./privacy-erasure.js";
import { encrypt } from "./security.js";
export async function sweepPrivateEvidence(
  database: Database,
  config: Config,
  at: Date,
) {
  if (!config.privacy) return;
  const policy = config.privacy.policy,
    cutoff = new Date(at.getTime() - policy.classes.EVIDENCE.days * 86400000),
    run = randomUUID();
  await database.transaction(async (client) => {
    await ensurePrivacyPolicy(client, policy, at);
    await client.query(
      "INSERT INTO privacy_retention_runs(id,policy_id,status,started_at) VALUES($1,$2,'PROCESSING',$3)",
      [run, policy.id, at],
    );
  });
  let count = 0;
  try {
    let evidenceCursor: string | null = null;
    for (;;) {
      const candidates: { id: string; user_id: string }[] = (
        await database.pool.query(
          `SELECT e.id,e.user_id FROM tutor_evidence e JOIN tutor_profiles p ON p.user_id=e.user_id
   WHERE e.encrypted_payload IS NOT NULL AND GREATEST(e.created_at,COALESCE((SELECT max(CASE WHEN c.profile_revision<>p.revision THEN p.updated_at WHEN c.status='APPROVED' THEN c.expires_at ELSE COALESCE(c.reviewed_at,c.created_at) END) FROM tutor_claims c WHERE c.evidence_id=e.id),e.created_at))<=$1
   AND NOT EXISTS(SELECT 1 FROM tutor_claims c WHERE c.evidence_id=e.id AND c.status='APPROVED' AND c.profile_revision=p.revision AND c.expires_at>$2)
   AND ($3::uuid IS NULL OR e.id>$3::uuid) ORDER BY e.id LIMIT 100`,
          [cutoff, at, evidenceCursor],
        )
      ).rows;
      for (const row of candidates)
        await database.transaction(async (client) => {
          await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
            row.user_id,
          ]);
          if (
            await retentionHeld(client, {
              user_id: row.user_id,
              class: "EVIDENCE",
              scope: "TRUST",
            })
          )
            return;
          const used = (
            await client.query(
              "SELECT 1 FROM tutor_claims c JOIN tutor_profiles p ON p.user_id=c.user_id WHERE c.evidence_id=$1 AND c.status='APPROVED' AND c.profile_revision=p.revision AND c.expires_at>$2",
              [row.id, at],
            )
          ).rowCount;
          if (used) return;
          const updated = await client.query(
            "UPDATE tutor_evidence SET encrypted_payload=NULL,scan_status='WITHDRAWN' WHERE id=$1 AND encrypted_payload IS NOT NULL",
            [row.id],
          );
          count += updated.rowCount || 0;
          await client.query(
            "UPDATE tutor_claims SET status='REVOKED',description='[retention expired]',review_reason='[retention expired]',reviewed_check='[retention expired]' WHERE evidence_id=$1",
            [row.id],
          );
          await client.query(
            "UPDATE tutor_claim_reviews SET reason='[retention expired]',checked_item='[retention expired]' WHERE claim_id IN (SELECT id FROM tutor_claims WHERE evidence_id=$1)",
            [row.id],
          );
          await client.query(
            "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
            [
              randomUUID(),
              row.user_id,
              "EVIDENCE_RETENTION_PURGED",
              run,
              at,
              { target: row.id, policy: policy.id },
            ],
          );
        });
      if (candidates.length < 100) break;
      evidenceCursor = candidates[candidates.length - 1].id;
    }
    let guardianCursor: string | null = null;
    for (;;) {
      const guardians: { id: string; user_id: string }[] = (
        await database.pool.query(
          `SELECT g.id,g.user_id FROM guardian_verifications g WHERE g.evidence_erased_at IS NULL AND GREATEST(g.created_at,COALESCE(g.reviewed_at,g.created_at),COALESCE((SELECT max(c.withdrawn_at) FROM learner_consents c JOIN learner_profiles p ON p.id=c.profile_id WHERE p.guardian_verification_id=g.id),g.created_at))<=$1
   AND NOT EXISTS(SELECT 1 FROM learner_profiles p JOIN learner_consents c ON c.profile_id=p.id AND c.withdrawn_at IS NULL WHERE p.guardian_verification_id=g.id AND p.status='ACTIVE' AND g.status='APPROVED') AND ($2::uuid IS NULL OR g.id>$2::uuid) ORDER BY g.id LIMIT 100`,
          [cutoff, guardianCursor],
        )
      ).rows;
      for (const row of guardians)
        await database.transaction(async (client) => {
          await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
            row.user_id,
          ]);
          if (
            await retentionHeld(client, {
              user_id: row.user_id,
              class: "EVIDENCE",
              scope: "TRUST",
            })
          )
            return;
          const used = (
            await client.query(
              "SELECT 1 FROM learner_profiles p JOIN learner_consents c ON c.profile_id=p.id AND c.withdrawn_at IS NULL JOIN guardian_verifications g ON g.id=p.guardian_verification_id WHERE g.id=$1 AND g.status='APPROVED' AND p.status='ACTIVE'",
              [row.id],
            )
          ).rowCount;
          if (used) return;
          const changed = await client.query(
            "UPDATE guardian_verifications SET status='REVOKED',encrypted_evidence=$2,evidence_erased_at=$3,review_reason='Evidence retention period expired' WHERE id=$1 AND evidence_erased_at IS NULL",
            [
              row.id,
              encrypt(
                {
                  adult_reference: "[erased]",
                  authority_reference: "[erased]",
                },
                config.authSecret,
              ),
              at,
            ],
          );
          count += changed.rowCount || 0;
          await client.query(
            "UPDATE guardian_reviews SET reason='[retention expired]' WHERE verification_id=$1",
            [row.id],
          );
        });
      if (guardians.length < 100) break;
      guardianCursor = guardians[guardians.length - 1].id;
    }
    await database.pool.query(
      "UPDATE privacy_retention_runs SET status='COMPLETED',purged_count=$2,completed_at=$3 WHERE id=$1",
      [run, count, at],
    );
  } catch (error) {
    await database.pool.query(
      "UPDATE privacy_retention_runs SET status='FAILED',purged_count=$2,last_error='RETENTION_SWEEP_FAILED',completed_at=$3 WHERE id=$1",
      [run, count, at],
    );
    throw error;
  }
}
