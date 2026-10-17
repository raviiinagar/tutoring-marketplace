import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import { decrypt } from "./security.js";
import { createHmac } from "node:crypto";
type Row = Record<string, any>;
export const availabilityEmailHash = (email: string, config: Config) =>
  createHmac("sha256", config.authSecret)
    .update("availability:" + email)
    .digest("hex");
export async function personalExport(
  client: PoolClient,
  user: Row,
  config: Config,
  at: Date,
) {
  const rows = async (sql: string, params: unknown[] = [user.id]) =>
    (await client.query(sql, params)).rows;
  const read = (payload: any) =>
    payload ? decrypt<Row>(payload, config.authSecret) : null;
  const profile = (
    await rows(
      "SELECT display_name,biography,encrypted_birth_date,status,revision,created_at FROM tutor_profiles WHERE user_id=$1",
    )
  )[0];
  const cleanAsset = (row: Row) => {
    const { encrypted_payload, ...metadata } = row;
    return {
      ...metadata,
      ...(row.scan_status === "CLEAN" && encrypted_payload
        ? {
            asset_base64: read(encrypted_payload)?.data,
            media_type: row.media_type || "image/jpeg",
          }
        : { asset_excluded: "No current clean scanned asset" }),
    };
  };
  const reviewRows = await rows(
    "SELECT * FROM connection_reviews WHERE author_id=$1",
  );
  const support = await rows(
    "SELECT id,category,status,source_id,related_id,encrypted_description,created_at FROM support_cases WHERE owner_id=$1",
  );
  for (const item of support) {
    item.description = read(item.encrypted_description);
    delete item.encrypted_description;
    item.events = (
      await rows(
        "SELECT e.outcome,e.encrypted_payload,e.created_at FROM support_events e JOIN support_cases c ON c.id=e.case_id WHERE c.owner_id=$1 AND c.id=$2 AND e.visibility='USER' ORDER BY e.sequence",
        [user.id, item.id],
      )
    ).map((e) => {
      const p = read(e.encrypted_payload);
      return {
        outcome: e.outcome,
        message: p?.message,
        created_at: e.created_at,
      };
    });
  }
  const hash = availabilityEmailHash(user.email, config);
  return {
    format_version: "privacy-export-v1",
    generated_at: at.toISOString(),
    scope:
      "Your contributed content and owned records; other participants, staff-only notes, authentication secrets and unsafe uploads are excluded.",
    account: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      roles: user.roles,
      email_verified_at: user.email_verified_at,
      created_at: user.created_at,
    },
    learners: await rows(
      "SELECT id,kind,alias,age_band,learning_requirements,status,adult_attested_at,created_at,updated_at FROM learner_profiles WHERE owner_id=$1",
    ),
    consents: await rows(
      "SELECT profile_id,notice_version,consent_version,accepted_at,withdrawn_at FROM learner_consents WHERE owner_id=$1",
    ),
    guardian_verifications: (
      await rows(
        "SELECT id,status,policy_id,notice_version,consent_version,encrypted_evidence,created_at,reviewed_at,review_reason FROM guardian_verifications WHERE user_id=$1",
      )
    ).map((r) => {
      const { encrypted_evidence, ...m } = r;
      return { ...m, evidence: read(encrypted_evidence) };
    }),
    tutor: profile
      ? {
          display_name: profile.display_name,
          biography: profile.biography,
          birth_date: read(profile.encrypted_birth_date)?.birth_date,
          status: profile.status,
          revision: profile.revision,
          created_at: profile.created_at,
        }
      : null,
    tutor_claims: await rows(
      "SELECT id,profile_revision,kind,subject_id,description,evidence_id,status,review_reason,reviewed_check,expires_at,created_at FROM tutor_claims WHERE user_id=$1",
    ),
    evidence: (
      await rows(
        "SELECT id,media_type,byte_length,scan_status,test_only,created_at,encrypted_payload FROM tutor_evidence WHERE user_id=$1",
      )
    ).map(cleanAsset),
    photos: (
      await rows(
        "SELECT id,status,scan_status,test_only,byte_length,review_reason,created_at,encrypted_payload FROM tutor_photos WHERE user_id=$1",
      )
    ).map(cleanAsset),
    listings: await rows(
      "SELECT id,payload,status,revision,review_reason,created_at FROM teaching_listings WHERE user_id=$1",
    ),
    contact_requests: (
      await rows(
        "SELECT id,learner_id,listing_id,offer_snapshot,encrypted_message,status,expires_at,created_at FROM contact_requests WHERE payer_id=$1",
      )
    ).map((r) => {
      const { encrypted_message, ...m } = r;
      return { ...m, message: read(encrypted_message) };
    }),
    tutor_request_decisions: await rows(
      "SELECT r.id,r.status,r.created_at FROM contact_requests r WHERE r.tutor_id=$1",
    ),
    connections: await rows(
      "SELECT c.id,c.status,c.created_at,p.role FROM connections c JOIN connection_participants p ON p.connection_id=c.id WHERE p.user_id=$1",
    ),
    own_messages: (
      await rows(
        "SELECT conversation_id,sequence,encrypted_text,created_at FROM conversation_messages WHERE sender_id=$1 ORDER BY conversation_id,sequence",
      )
    ).map((r) => ({
      conversation_id: r.conversation_id,
      sequence: Number(r.sequence),
      text: read(r.encrypted_text)?.text,
      created_at: r.created_at,
    })),
    reviews: reviewRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      text: read(r.encrypted_text)?.text,
      status: r.status,
      revision: r.revision,
      created_at: r.created_at,
    })),
    review_appeals: (
      await rows(
        "SELECT id,review_id,review_revision,encrypted_description,status,created_at FROM review_appeals WHERE actor_id=$1",
      )
    ).map((r) => {
      const { encrypted_description, ...m } = r;
      return { ...m, ...read(encrypted_description) };
    }),
    safety_reports: (
      await rows(
        "SELECT id,category,status,revision,encrypted_report,public_notice,created_at FROM safety_cases WHERE reporter_id=$1",
      )
    ).map((r) => ({
      id: r.id,
      category: r.category,
      status: r.status,
      revision: r.revision,
      description: read(r.encrypted_report)?.input?.description,
      public_notice: r.public_notice,
      created_at: r.created_at,
    })),
    safety_appeals: (
      await rows(
        "SELECT id,case_id,status,case_revision,encrypted_description,created_at FROM safety_appeals WHERE actor_id=$1",
      )
    ).map((r) => {
      const { encrypted_description, ...m } = r;
      return { ...m, ...read(encrypted_description) };
    }),
    support_cases: support,
    purchases: await rows(
      "SELECT id,policy_version,amount_paise,currency,disclosures,status,captured_at,created_at FROM purchase_cycles WHERE payer_id=$1",
    ),
    payment_facts: await rows(
      "SELECT j.kind,j.amount_paise,j.currency,j.recorded_at FROM payment_journal j JOIN purchase_cycles p ON p.id=j.cycle_id WHERE p.payer_id=$1",
    ),
    reversals: await rows(
      "SELECT j.kind,j.amount_paise,j.currency,j.recorded_at FROM reversal_journal j JOIN purchase_cycles p ON p.id=j.cycle_id WHERE p.payer_id=$1",
    ),
    payment_documents: await rows(
      "SELECT d.id,d.snapshot,d.issued_at FROM payment_documents d JOIN purchase_cycles p ON p.id=d.cycle_id WHERE p.payer_id=$1",
    ),
    refund_cases: (
      await rows(
        "SELECT id,cycle_id,status,encrypted_reason,review_reason,amount_paise,access_treatment,created_at FROM refund_cases WHERE payer_id=$1",
      )
    ).map((r) => {
      const { encrypted_reason, ...m } = r;
      return { ...m, ...read(encrypted_reason) };
    }),
    availability: await rows(
      "SELECT id,selection,status,consent_version,verified_at,expires_at,created_at FROM availability_subscriptions WHERE email_hash=$1",
      [hash],
    ),
    notification_preferences: await rows(
      "SELECT enquiry_email,chat_email,availability_email,marketing_email,notice_version,updated_at FROM notification_preferences WHERE user_id=$1",
    ),
    notifications: await rows(
      "SELECT template,category,channel,status,created_at,sent_at FROM notification_outbox WHERE recipient_id=$1",
    ),
    sessions: await rows(
      "SELECT id,created_at,expires_at,revoked_at FROM sessions WHERE user_id=$1",
    ),
    access_entitlements: await rows(
      "SELECT id,policy_version,status,captured_at,matching_deadline,starts_at,ends_at,created_at FROM access_entitlements WHERE payer_id=$1",
    ),
    refund_operations: await rows(
      "SELECT r.id,r.cycle_id,r.amount_paise,r.currency,r.status,r.created_at,r.updated_at FROM refund_operations r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE p.payer_id=$1",
    ),
    payment_disputes: await rows(
      "SELECT d.id,d.cycle_id,d.amount_paise,d.currency,d.status,d.phase,d.updated_at FROM payment_disputes d JOIN purchase_cycles p ON p.id=d.cycle_id WHERE p.payer_id=$1",
    ),
    guardian_decisions: await rows(
      "SELECT r.verification_id,r.decision,r.reason,r.created_at FROM guardian_reviews r JOIN guardian_verifications g ON g.id=r.verification_id WHERE g.user_id=$1",
    ),
    tutor_claim_decisions: await rows(
      "SELECT r.claim_id,r.outcome,r.checked_item,r.reason,r.expires_at,r.created_at FROM tutor_claim_reviews r JOIN tutor_claims c ON c.id=r.claim_id WHERE c.user_id=$1",
    ),
    listing_decisions: await rows(
      "SELECT d.listing_id,d.revision,d.outcome,d.reason,d.created_at FROM listing_decisions d JOIN teaching_listings l ON l.id=d.listing_id WHERE l.user_id=$1",
    ),
    review_decisions: await rows(
      "SELECT d.review_id,d.revision,d.outcome,d.policy_code,d.reason,d.created_at FROM review_decisions d JOIN connection_reviews r ON r.id=d.review_id WHERE r.author_id=$1",
    ),
    own_blocks: await rows(
      "SELECT blocked_id,created_at FROM account_blocks WHERE owner_id=$1",
    ),
    staff_membership: await rows(
      "SELECT scopes,enabled,(encrypted_secret IS NOT NULL) AS mfa_enrolled,updated_at FROM staff_accounts WHERE user_id=$1",
    ),
    privacy_requests: await rows(
      "SELECT id,kind,status,created_at,completed_at FROM privacy_requests WHERE user_id=$1",
    ),
    audit: await rows(
      "SELECT event_type,created_at FROM audit_events WHERE user_id=$1 ORDER BY created_at,id",
    ),
  };
}
