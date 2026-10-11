ALTER TABLE users ADD COLUMN roles text[] NOT NULL DEFAULT ARRAY['LEARNER']::text[]
  CHECK (cardinality(roles) BETWEEN 1 AND 2 AND roles <@ ARRAY['LEARNER','TUTOR']::text[]);
ALTER TABLE audit_events ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE password_resets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user ON password_resets(user_id);
