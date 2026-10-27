import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink, lstat } from "node:fs/promises";
import { join } from "node:path";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import { encrypt, randomToken } from "./security.js";
import { availabilityEmailHash, personalExport } from "./privacy-inventory.js";
import type { RetentionPolicy } from "./privacy-policy.js";
type Row = Record<string, any>;
export async function stopPrivacyActivity(
  client: PoolClient,
  user: Row,
  kind: string,
  profileId: string | null,
  emailHash: string,
  at: Date,
  scope: Row = {},
) {
  const params = [user.id, at];
  if (kind === "WITHDRAW") {
    const newer = (
      await client.query(
        "SELECT 1 FROM learner_consents WHERE profile_id=$1 AND owner_id=$2 AND withdrawn_at IS NULL AND NOT(id=ANY($3::uuid[]))",
        [profileId, user.id, scope.consent_ids || []],
      )
    ).rowCount;
    if (!newer)
      await client.query(
        "UPDATE learner_profiles SET status='WITHDRAWN',updated_at=$3 WHERE id=$1 AND owner_id=$2",
        [profileId, user.id, at],
      );
    await client.query(
      "UPDATE learner_consents SET withdrawn_at=$2 WHERE id=ANY($1::uuid[]) AND withdrawn_at IS NULL",
      [scope.consent_ids || [], at],
    );
    await client.query(
      "UPDATE contact_requests SET status='CANCELLED',updated_at=$2 WHERE id=ANY($1::uuid[]) AND status='PENDING'",
      [scope.request_ids || [], at],
    );
    await client.query(
      "UPDATE connection_access_grants SET revoked_at=$2 WHERE connection_id IN (SELECT id FROM connections WHERE request_id=ANY($1::uuid[])) AND revoked_at IS NULL",
      [scope.request_ids || [], at],
    );
    await client.query(
      "DELETE FROM privacy_exports WHERE request_id IN (SELECT id FROM privacy_requests WHERE user_id=$1)",
      [user.id],
    );
    return;
  }
  await client.query("UPDATE users SET status='DISABLED' WHERE id=$1", [
    user.id,
  ]);
  await client.query(
    "UPDATE sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL",
    params,
  );
  await client.query(
    "UPDATE staff_sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL",
    params,
  );
  await client.query(
    "UPDATE staff_accounts SET enabled=false,encrypted_secret=NULL,encrypted_pending_secret=NULL,recovery_hashes=ARRAY[]::text[] WHERE user_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE teaching_listings SET status='PAUSED',approved=false,revision=revision+1,updated_at=$2 WHERE user_id=$1",
    params,
  );
  await client.query(
    "UPDATE tutor_profiles SET status='REVOKED',updated_at=$2 WHERE user_id=$1",
    params,
  );
  await client.query(
    "UPDATE tutor_claims SET status='REVOKED' WHERE user_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE guardian_verifications SET status='REVOKED',reviewed_at=$2 WHERE user_id=$1",
    params,
  );
  await client.query(
    "UPDATE learner_profiles SET status='WITHDRAWN',updated_at=$2 WHERE owner_id=$1",
    params,
  );
  await client.query(
    "UPDATE learner_consents SET withdrawn_at=$2 WHERE owner_id=$1 AND withdrawn_at IS NULL",
    params,
  );
  await client.query(
    "UPDATE access_entitlements SET status='REVOKED' WHERE payer_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE contact_requests SET status='CANCELLED',updated_at=$2 WHERE (payer_id=$1 OR tutor_id=$1) AND status='PENDING'",
    params,
  );
  await client.query(
    "UPDATE connection_access_grants SET revoked_at=$2 WHERE connection_id IN (SELECT connection_id FROM connection_participants WHERE user_id=$1) AND revoked_at IS NULL",
    params,
  );
  await client.query(
    "UPDATE availability_subscriptions SET status='WITHDRAWN',encrypted_contact=NULL,verification_hash=NULL,verification_expires_at=NULL,unsubscribe_hash=NULL,updated_at=$2 WHERE email_hash=$1",
    [emailHash, at],
  );
  await client.query(
    "UPDATE availability_notification_intents SET status='CANCELLED' WHERE subscription_id IN (SELECT id FROM availability_subscriptions WHERE email_hash=$1)",
    [emailHash],
  );
  await client.query(
    "UPDATE mail_outbox SET status='EXPIRED',lease_until=NULL WHERE user_id=$1 OR availability_subscription_id IN (SELECT id FROM availability_subscriptions WHERE email_hash=$2)",
    [user.id, emailHash],
  );
  await client.query(
    "UPDATE notification_outbox SET status='SUPPRESSED',lease_token=NULL,lease_until=NULL,updated_at=$3 WHERE (recipient_id=$1 OR availability_intent_id IN (SELECT i.id FROM availability_notification_intents i JOIN availability_subscriptions s ON s.id=i.subscription_id WHERE s.email_hash=$2)) AND status NOT IN ('SENT','UNKNOWN')",
    [user.id, emailHash, at],
  );
  await client.query(
    "DELETE FROM privacy_exports WHERE request_id IN (SELECT id FROM privacy_requests WHERE user_id=$1)",
    [user.id],
  );
}
export async function retentionHeld(client: PoolClient, row: Row) {
  const manual = (
    await client.query(
      "SELECT 1 FROM privacy_holds WHERE user_id=$1 AND class=$2 AND scope=$3 AND released_at IS NULL LIMIT 1",
      [row.user_id, row.class, row.scope],
    )
  ).rowCount;
  if (manual) return true;
  if (row.class === "FINANCE")
    return !!(
      await client.query(
        "SELECT 1 FROM purchase_cycles p WHERE p.payer_id=$1 AND (p.status IN ('CREATING','UNKNOWN','VERIFYING','REVIEW') OR EXISTS(SELECT 1 FROM refund_operations o WHERE o.cycle_id=p.id AND o.status<>'PROCESSED') OR EXISTS(SELECT 1 FROM refund_cases c WHERE c.cycle_id=p.id AND c.status='OPEN') OR EXISTS(SELECT 1 FROM payment_disputes d WHERE d.cycle_id=p.id AND d.status IN ('open','under_review')) OR EXISTS(SELECT 1 FROM finance_exceptions e WHERE e.cycle_id=p.id AND e.status='OPEN')) LIMIT 1",
        [row.user_id],
      )
    ).rowCount;
  if (["SAFETY", "EVIDENCE"].includes(row.class))
    return !!(
      await client.query(
        "SELECT 1 FROM safety_cases c WHERE (c.reporter_id=$1 OR c.subject_id=$1) AND (c.status='OPEN' OR EXISTS(SELECT 1 FROM safety_restrictions r WHERE r.case_id=c.id AND r.lifted_at IS NULL)) LIMIT 1",
        [row.user_id],
      )
    ).rowCount;
  if (row.class === "SUPPORT")
    return !!(
      await client.query(
        "SELECT 1 FROM support_cases WHERE owner_id=$1 AND required_scope=$2 AND status<>'RESOLVED' LIMIT 1",
        [row.user_id, row.scope],
      )
    ).rowCount;
  return false;
}
export async function retainedSummary(
  client: PoolClient,
  id: string,
  at: Date,
) {
  const rows = (
    await client.query(
      "SELECT id,user_id,class,scope,purpose,expires_at,purged_at FROM privacy_retained WHERE request_id=$1 ORDER BY class,scope",
      [id],
    )
  ).rows;
  const result = [];
  for (const r of rows)
    result.push({
      id: r.id,
      class: r.class,
      scope: r.scope,
      purpose: r.purpose,
      expires_at: r.expires_at,
      purged: !!r.purged_at,
      held: !r.purged_at && (await retentionHeld(client, r)),
    });
  return result;
}
async function retain(
  client: PoolClient,
  job: Row,
  classification: keyof RetentionPolicy["classes"],
  scope: string,
  payload: unknown,
  at: Date,
) {
  const policy = job.policy_snapshot as RetentionPolicy,
    rule = policy.classes[classification];
  const content = Object.values(payload as Row).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined,
  );
  if (!content) return;
  const held = await retentionHeld(client, {
    user_id: job.user_id,
    class: classification,
    scope,
  });
  if (rule.days === 0 && !held) return;
  const expires = new Date(
      new Date(job.created_at).getTime() + rule.days * 86400000,
    ),
    expired = expires <= at && !held;
  await client.query(
    "INSERT INTO privacy_retained(id,request_id,user_id,class,scope,purpose,encrypted_payload,expires_at,created_at,purged_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(request_id,class,scope) DO NOTHING",
    [
      randomUUID(),
      job.id,
      job.user_id,
      classification,
      scope,
      rule.purpose,
      expired ? null : encrypt(payload, job.secret),
      expires,
      at,
      expired ? at : null,
    ],
  );
}
export async function archiveWithdrawal(
  client: PoolClient,
  job: Row,
  user: Row,
  config: Config,
  at: Date,
) {
  const scope = job.withdraw_scope || {},
    ids = scope.request_ids || [];
  const profile = (
    await client.query(
      "SELECT * FROM learner_profiles WHERE id=$1 AND owner_id=$2",
      [job.profile_id, user.id],
    )
  ).rows[0];
  const newer = (
    await client.query(
      "SELECT 1 FROM learner_consents WHERE profile_id=$1 AND owner_id=$2 AND withdrawn_at IS NULL AND NOT(id=ANY($3::uuid[]))",
      [job.profile_id, user.id, scope.consent_ids || []],
    )
  ).rowCount;
  await retain(
    client,
    { ...job, secret: config.authSecret },
    "EVIDENCE",
    "TRUST",
    {
      profile: newer ? null : profile,
      consents: (
        await client.query(
          "SELECT * FROM learner_consents WHERE id=ANY($1::uuid[])",
          [scope.consent_ids || []],
        )
      ).rows,
      requests: (
        await client.query(
          "SELECT id,encrypted_message FROM contact_requests WHERE id=ANY($1::uuid[])",
          [ids],
        )
      ).rows,
      messages: (
        await client.query(
          "SELECT m.* FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id JOIN connections x ON x.id=c.connection_id WHERE x.request_id=ANY($1::uuid[])",
          [ids],
        )
      ).rows,
    },
    at,
  );
}
export async function erasePrivacyData(
  client: PoolClient,
  job: Row,
  user: Row,
  config: Config,
  at: Date,
) {
  const rows = async (sql: string, params: unknown[] = [user.id]) =>
    (await client.query(sql, params)).rows;
  const secret = config.authSecret,
    redact = (value: unknown) => encrypt(value, secret);
  const classTable=(await client.query("SELECT to_regclass('public.class_invitations') AS present")).rows[0].present;
  await client.query("SELECT set_config('app.privacy_request',$1,true)", [
    job.id,
  ]);
  if (job.kind === "WITHDRAW") {
    await archiveWithdrawal(client, job, user, config, at);
    const scope = job.withdraw_scope || {},
      ids = scope.request_ids || [];
    const newer = (
      await rows(
        "SELECT 1 FROM learner_consents WHERE profile_id=$1 AND owner_id=$2 AND withdrawn_at IS NULL AND NOT(id=ANY($3::uuid[]))",
        [job.profile_id, user.id, scope.consent_ids || []],
      )
    ).length;
    if (!newer)
      await client.query(
        "UPDATE learner_profiles SET alias='Withdrawn learner',learning_requirements='[erased]',updated_at=$2 WHERE id=$1",
        [job.profile_id, at],
      );
    await client.query(
      "UPDATE contact_requests SET encrypted_message=$2 WHERE id=ANY($1::uuid[])",
      [
        ids,
        redact({
          learning_requirements: "[withdrawn]",
          preferred_times: "[withdrawn]",
        }),
      ],
    );
    await client.query(
      "UPDATE conversation_messages SET encrypted_text=$2 WHERE conversation_id IN (SELECT c.id FROM conversations c JOIN connections x ON x.id=c.connection_id WHERE x.request_id=ANY($1::uuid[]))",
      [ids, redact({ text: "[withdrawn]" })],
    );
    if(classTable)await client.query(
      "UPDATE class_invitations SET status='CANCELLED',encrypted_payload=$2,revision=revision+1,updated_at=$3 WHERE connection_id IN (SELECT id FROM connections WHERE request_id=ANY($1::uuid[]))",
      [ids,redact({title:'[withdrawn]',meet_url:null}),at],
    );
    await client.query(
      "UPDATE connection_reviews SET status='WITHDRAWN',published_text=NULL,encrypted_text=$2,revision=revision+1,updated_at=$3 WHERE connection_id IN (SELECT id FROM connections WHERE request_id=ANY($1::uuid[])) AND author_id=$4",
      [ids, redact({ text: "[withdrawn]" }), at, user.id],
    );
    await client.query(
      "UPDATE notification_outbox SET status='SUPPRESSED',lease_token=NULL,lease_until=NULL,updated_at=$2 WHERE target_id IN (SELECT id FROM connections WHERE request_id=ANY($1::uuid[]) UNION SELECT id FROM contact_requests WHERE id=ANY($1::uuid[])) AND status NOT IN ('SENT','UNKNOWN')",
      [ids, at],
    );
    return;
  }
  const snapshot = await personalExport(client, user, config, at);
  await retain(
    client,
    { ...job, secret },
    "ACCOUNT",
    "SUPPORT",
    {
      account: snapshot.account,
      learners: snapshot.learners,
      consents: snapshot.consents,
    },
    at,
  );
  await retain(
    client,
    { ...job, secret },
    "PHOTO",
    "TRUST",
    { photos: snapshot.photos },
    at,
  );
  await retain(
    client,
    { ...job, secret },
    "EVIDENCE",
    "TRUST",
    {
      guardian: snapshot.guardian_verifications,
      tutor: snapshot.tutor,
      evidence: snapshot.evidence,
      claims: snapshot.tutor_claims,
    },
    at,
  );
  await retain(
    client,
    { ...job, secret },
    "FINANCE",
    "FINANCE",
    {
      purchases: snapshot.purchases,
      documents: snapshot.payment_documents,
      refund_cases: snapshot.refund_cases,
    },
    at,
  );
  await retain(
    client,
    { ...job, secret },
    "SAFETY",
    "TRUST",
    {
      reviews: snapshot.reviews,
      appeals: snapshot.review_appeals,
      safety_cases: await rows(
        "SELECT * FROM safety_cases WHERE reporter_id=$1 OR subject_id=$1",
      ),
      safety_appeals: await rows(
        "SELECT * FROM safety_appeals WHERE actor_id=$1",
      ),
    },
    at,
  );
  const cases = await rows("SELECT * FROM support_cases WHERE owner_id=$1");
  for (const scope of ["SUPPORT", "TRUST", "FINANCE"]) {
    const selected = cases.filter((c) => c.required_scope === scope);
    if (selected.length)
      await retain(
        client,
        { ...job, secret },
        "SUPPORT",
        scope,
        {
          cases: selected,
          events: await rows(
            "SELECT e.* FROM support_events e JOIN support_cases c ON c.id=e.case_id WHERE c.owner_id=$1 AND c.required_scope=$2",
            [user.id, scope],
          ),
        },
        at,
      );
  }
  if(classTable)await client.query(
    "UPDATE class_invitations SET status='CANCELLED',encrypted_payload=$2,revision=revision+1,updated_at=$3 WHERE connection_id IN (SELECT connection_id FROM connection_participants WHERE user_id=$1)",
    [user.id,redact({title:'[erased]',meet_url:null}),at],
  );
  await client.query(
    "UPDATE tutor_photos SET status='REMOVED',encrypted_payload=NULL,byte_length=0,review_reason='[erased]' WHERE user_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE tutor_evidence SET scan_status='WITHDRAWN',encrypted_payload=NULL WHERE user_id=$1",
    [user.id],
  );
  await client.query(
    "DELETE FROM tutor_download_grants WHERE evidence_id IN (SELECT id FROM tutor_evidence WHERE user_id=$1) OR actor_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE tutor_profiles SET display_name='Deleted account',biography='[erased]',encrypted_birth_date=$2 WHERE user_id=$1",
    [user.id, redact({ birth_date: "1900-01-01" })],
  );
  await client.query(
    "UPDATE tutor_claims SET description='[erased]',review_reason='[erased]',reviewed_check='[erased]' WHERE user_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE tutor_claim_reviews SET checked_item='[erased]',reason='[erased]' WHERE claim_id IN (SELECT id FROM tutor_claims WHERE user_id=$1)",
    [user.id],
  );
  await client.query(
    "UPDATE guardian_verifications SET encrypted_evidence=$2,review_reason='[erased]',evidence_erased_at=$3 WHERE user_id=$1",
    [
      user.id,
      redact({ adult_reference: "[erased]", authority_reference: "[erased]" }),
      at,
    ],
  );
  await client.query(
    "UPDATE guardian_reviews SET reason='[erased]' WHERE verification_id IN (SELECT id FROM guardian_verifications WHERE user_id=$1)",
    [user.id],
  );
  await client.query(
    "UPDATE learner_profiles SET alias='Deleted learner',learning_requirements='[erased]' WHERE owner_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE teaching_listings SET payload=jsonb_set(jsonb_set(payload,'{title}','\"Deleted offer\"'),'{description}','\"[erased]\"'),review_reason='[erased]',safety_reason='[erased]' WHERE user_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE listing_decisions SET reason='[erased]' WHERE listing_id IN (SELECT id FROM teaching_listings WHERE user_id=$1)",
    [user.id],
  );
  await client.query(
    "UPDATE contact_requests SET encrypted_message=$2 WHERE payer_id=$1",
    [
      user.id,
      redact({
        learning_requirements: "[erased]",
        preferred_times: "[erased]",
      }),
    ],
  );
  await client.query(
    "UPDATE contact_requests SET offer_snapshot=jsonb_set(jsonb_set(offer_snapshot,'{title}','\"Deleted offer\"'),'{description}','\"[erased]\"') WHERE tutor_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE conversation_messages SET encrypted_text=$2 WHERE sender_id=$1",
    [user.id, redact({ text: "[erased]" })],
  );
  await client.query(
    "UPDATE connection_reviews SET status='WITHDRAWN',published_text=NULL,encrypted_text=$2,revision=revision+1,updated_at=$3 WHERE author_id=$1",
    [user.id, redact({ text: "[erased]" }), at],
  );
  await client.query(
    "UPDATE review_decisions SET reason='[erased]' WHERE review_id IN (SELECT id FROM connection_reviews WHERE author_id=$1 OR tutor_id=$1)",
    [user.id],
  );
  await client.query(
    "UPDATE review_appeals SET encrypted_description=$2 WHERE actor_id=$1",
    [user.id, redact({ description: "[erased]" })],
  );
  await client.query(
    "UPDATE safety_cases SET encrypted_report=$2,public_notice=$3 WHERE reporter_id=$1 OR subject_id=$1",
    [
      user.id,
      redact({
        input: { description: "[erased]", message_sequences: [] },
        evidence: { offer_title: "Deleted offer", messages: [] },
      }),
      "Private details moved to restricted retention",
    ],
  );
  await client.query(
    "UPDATE safety_restrictions SET reason='[erased]',lift_reason=CASE WHEN lift_reason IS NULL THEN NULL ELSE '[erased]' END WHERE case_id IN (SELECT id FROM safety_cases WHERE reporter_id=$1 OR subject_id=$1)",
    [user.id],
  );
  await client.query(
    "UPDATE safety_appeals SET encrypted_description=$2 WHERE actor_id=$1",
    [user.id, redact({ description: "[erased]" })],
  );
  await client.query(
    "UPDATE support_cases SET encrypted_description=$2 WHERE owner_id=$1",
    [
      user.id,
      redact({ subject: "Deleted account case", description: "[erased]" }),
    ],
  );
  await client.query(
    "UPDATE support_events SET encrypted_payload=$2 WHERE case_id IN (SELECT id FROM support_cases WHERE owner_id=$1)",
    [user.id, redact({ message: "[erased]", reason: "[erased]" })],
  );
  await client.query(
    "UPDATE refund_cases SET encrypted_reason=$2,review_reason=CASE WHEN review_reason IS NULL THEN NULL ELSE $3 END WHERE payer_id=$1",
    [user.id, redact({ reason: "[erased]" }), "[erased]"],
  );
  await client.query(
    "UPDATE mail_outbox SET encrypted_payload=$3 WHERE user_id=$1 OR availability_subscription_id IN (SELECT id FROM availability_subscriptions WHERE email_hash=$2)",
    [user.id, job.email_hash, redact({ to: "erased@example.invalid" })],
  );
  await client.query(
    "UPDATE availability_subscriptions SET email_hash=encode(sha256(('erased:'||id)::bytea),'hex') WHERE email_hash=$1",
    [job.email_hash],
  );
  await client.query("DELETE FROM notification_preferences WHERE user_id=$1", [
    user.id,
  ]);
  await client.query("DELETE FROM password_resets WHERE user_id=$1", [user.id]);
  await client.query("DELETE FROM email_verifications WHERE user_id=$1", [
    user.id,
  ]);
  await client.query("DELETE FROM privacy_verifications WHERE user_id=$1", [
    user.id,
  ]);
  await client.query(
    "UPDATE audit_events SET metadata=metadata-'reason'-'operator' WHERE user_id=$1",
    [user.id],
  );
  await client.query(
    "UPDATE users SET email=$2,display_name='Deleted account',password_hash=$3,email_verified_at=NULL,roles=ARRAY['LEARNER']::text[] WHERE id=$1",
    [user.id, "erased-" + user.id + "@privacy.invalid", randomToken()],
  );
}
export async function eraseCapturedMail(config: Config, emailHash: string) {
  if (config.mailTransport !== "capture") return;
  const files = await readdir(config.mailDir).catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return [];
      throw e;
    },
  );
  for (const name of files) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    const path = join(config.mailDir, name);
    const stat = await lstat(path).catch(() => undefined);
    if (!stat?.isFile() || stat.isSymbolicLink()) continue;
    const data = JSON.parse(await readFile(path, "utf8"));
    if (
      typeof data.to === "string" &&
      availabilityEmailHash(data.to, config) === emailHash
    )
      await unlink(path).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
      });
  }
}
