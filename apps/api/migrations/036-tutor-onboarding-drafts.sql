CREATE TABLE tutor_onboarding_drafts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  step smallint NOT NULL CHECK (step BETWEEN 0 AND 4),
  encrypted_payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
