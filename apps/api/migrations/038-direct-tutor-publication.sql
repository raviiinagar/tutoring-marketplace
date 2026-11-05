-- Publication and identity review are independent facts. No identity decision is fabricated.
ALTER TABLE tutor_profiles ADD COLUMN publication_status text NOT NULL DEFAULT 'DRAFT'
  CHECK (publication_status IN ('DRAFT','PUBLISHED','PAUSED'));
ALTER TABLE tutor_profiles ADD COLUMN adult_declared_at timestamptz;
ALTER TABLE tutor_profiles ADD COLUMN publication_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE tutor_photos ADD COLUMN self_published boolean NOT NULL DEFAULT false;
ALTER TABLE teaching_listings ADD COLUMN archived_at timestamptz;
ALTER TABLE teaching_listings ADD COLUMN publication_policy text NOT NULL DEFAULT 'review-v1'
 CHECK (publication_policy IN ('review-v1','direct-ads-v1'));

-- Both existing profile-save APIs required the owner's explicit 18+ declaration.
-- Preserve that historical declaration for safe established Connections. This
-- does not verify identity, publish a draft, or clear a staff restriction.
UPDATE tutor_profiles SET adult_declared_at=created_at;

-- Preserve prior adverse cases as a separate hold. A reviewer can explicitly
-- lift the hold; editing a name or replacing evidence cannot erase it.
UPDATE tutor_profiles SET publication_restricted=true
WHERE status IN ('REVOKED','CHANGES_REQUESTED') OR EXISTS (
 SELECT 1 FROM tutor_claims c WHERE c.user_id=tutor_profiles.user_id
 AND c.profile_revision=tutor_profiles.revision AND c.kind='IDENTITY'
 AND c.status IN ('REJECTED','REVOKED')
);
-- Previously eligible approved introductions retain visibility. Private drafts,
-- pending cases and revoked/rejected historical cases are never auto-published.
UPDATE tutor_profiles p SET publication_status='PUBLISHED',adult_declared_at=p.created_at
WHERE p.status='APPROVED' AND NOT p.publication_restricted AND EXISTS (
 SELECT 1 FROM tutor_claims c JOIN tutor_evidence e ON e.id=c.evidence_id AND e.user_id=c.user_id
 WHERE c.user_id=p.user_id AND c.profile_revision=p.revision AND c.kind='IDENTITY'
 AND c.status='APPROVED' AND c.adult_identity_confirmed AND c.expires_at>now() AND e.scan_status='CLEAN' AND NOT e.test_only
) AND EXISTS (SELECT 1 FROM users u WHERE u.id=p.user_id AND u.status='ACTIVE'
 AND u.email_verified_at IS NOT NULL AND 'TUTOR'=ANY(u.roles));
