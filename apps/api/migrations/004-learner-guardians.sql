CREATE TABLE guardian_verifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  policy_id text NOT NULL,
  notice_version text NOT NULL,
  consent_version text NOT NULL,
  consent_accepted_at timestamptz NOT NULL,
  encrypted_evidence jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','REVOKED')),
  review_reason varchar(240),
  created_at timestamptz NOT NULL,
  reviewed_at timestamptz
);
CREATE UNIQUE INDEX guardian_open_case ON guardian_verifications(user_id) WHERE status IN ('PENDING','APPROVED');
CREATE TABLE guardian_reviews (
  id uuid PRIMARY KEY,
  verification_id uuid NOT NULL REFERENCES guardian_verifications(id),
  reviewer_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT','REVOKE')),
  identifiable_adult_reviewed boolean NOT NULL,
  authority_reviewed boolean NOT NULL,
  policy_id text NOT NULL,
  notice_version text NOT NULL,
  consent_version text NOT NULL,
  reason varchar(240) NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE learner_profiles (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN ('ADULT','CHILD')),
  alias varchar(40) NOT NULL,
  age_band text NOT NULL CHECK(age_band IN ('ADULT','UNDER_13','13_15','16_17')),
  learning_requirements varchar(300) NOT NULL,
  guardian_verification_id uuid REFERENCES guardian_verifications(id),
  adult_attested_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','WITHDRAWN')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK ((kind='ADULT' AND age_band='ADULT' AND guardian_verification_id IS NULL AND adult_attested_at IS NOT NULL)
    OR (kind='CHILD' AND age_band<>'ADULT' AND guardian_verification_id IS NOT NULL AND adult_attested_at IS NULL))
);
CREATE UNIQUE INDEX learner_adult_owner ON learner_profiles(owner_id) WHERE kind='ADULT';
CREATE INDEX learner_profiles_owner ON learner_profiles(owner_id);
CREATE TABLE learner_consents (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES learner_profiles(id),
  owner_id uuid NOT NULL REFERENCES users(id),
  notice_version text NOT NULL,
  consent_version text NOT NULL,
  accepted_at timestamptz NOT NULL,
  withdrawn_at timestamptz
);
CREATE UNIQUE INDEX learner_active_consent ON learner_consents(profile_id) WHERE withdrawn_at IS NULL;
