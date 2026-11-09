import { randomUUID } from "node:crypto";
import type { Database } from "../../src/database.js";

/**
 * Writes a child Learner profile the way data from before ADR 0015 looks: an
 * APPROVED Guardian verification, the child profile and an active consent.
 * Child profiles can no longer be created through the API, so tests use this to
 * prove such historical rows stay unusable while privacy rights still work.
 */
export async function historicalChild(
  database: Database,
  ownerId: string,
  at: Date,
  alias = "Historical child nickname",
) {
  const verificationId = randomUUID(),
    profileId = randomUUID();
  await database.pool.query(
    `INSERT INTO guardian_verifications(id,user_id,policy_id,notice_version,consent_version,consent_accepted_at,encrypted_evidence,status,created_at,reviewed_at)
     VALUES($1,$2,'test-guardian-v1','test-notice-v1','test-consent-v1',$3,'{}'::jsonb,'APPROVED',$3,$3)`,
    [verificationId, ownerId, at],
  );
  await database.pool.query(
    `INSERT INTO learner_profiles(id,owner_id,kind,alias,age_band,learning_requirements,guardian_verification_id,created_at,updated_at)
     VALUES($1,$2,'CHILD',$3,'13_15','Practice school Physics concepts with examples',$4,$5,$5)`,
    [profileId, ownerId, alias, verificationId, at],
  );
  await database.pool.query(
    `INSERT INTO learner_consents(id,profile_id,owner_id,notice_version,consent_version,accepted_at)
     VALUES($1,$2,$3,'test-notice-v1','test-consent-v1',$4)`,
    [randomUUID(), profileId, ownerId, at],
  );
  return { verificationId, profileId, alias };
}
