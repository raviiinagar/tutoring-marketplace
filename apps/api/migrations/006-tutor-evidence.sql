CREATE TABLE tutor_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  display_name text NOT NULL,
  biography text NOT NULL,
  encrypted_birth_date jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','CHANGES_REQUESTED','APPROVED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tutor_evidence (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES tutor_profiles(user_id),
  media_type text NOT NULL CHECK(media_type IN ('application/pdf','image/png','image/jpeg')),
  byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 1048576),
  encrypted_payload jsonb,
  scan_status text NOT NULL DEFAULT 'QUARANTINED' CHECK(scan_status IN ('QUARANTINED','CLEAN','REJECTED','ERROR','WITHDRAWN')),
  test_only boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tutor_evidence_owner ON tutor_evidence(user_id);
CREATE TABLE tutor_claims (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES tutor_profiles(user_id),
  profile_revision integer NOT NULL,
  kind text NOT NULL CHECK(kind IN ('IDENTITY','QUALIFICATION','EXPERIENCE')),
  subject_id text REFERENCES catalogue_terms(id),
  description text NOT NULL,
  evidence_id uuid NOT NULL REFERENCES tutor_evidence(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','CHANGES_REQUESTED','REJECTED','REVOKED')),
  CHECK((kind='IDENTITY' AND subject_id IS NULL) OR (kind<>'IDENTITY' AND subject_id IS NOT NULL)),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  expires_at timestamptz,
  review_reason text,
  reviewed_check text,
  adult_identity_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tutor_identity_claim ON tutor_claims(user_id,profile_revision) WHERE kind='IDENTITY';
CREATE TABLE tutor_claim_reviews (
  id uuid PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES tutor_claims(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  outcome text NOT NULL,
  checked_item text NOT NULL,
  reason text NOT NULL,
  adult_identity_confirmed boolean NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tutor_download_grants (
  token_hash char(64) PRIMARY KEY,
  evidence_id uuid NOT NULL REFERENCES tutor_evidence(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  session_binding char(64) NOT NULL,
  profile_revision integer NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
