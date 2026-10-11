CREATE TABLE staff_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 3 AND scopes <@ ARRAY['SUPPORT','TRUST','FINANCE']::text[]),
  enabled boolean NOT NULL DEFAULT true,
  encrypted_secret jsonb,
  encrypted_pending_secret jsonb,
  pending_session_id uuid REFERENCES sessions(id),
  pending_expires_at timestamptz,
  last_counter bigint NOT NULL DEFAULT -1,
  recovery_hashes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE staff_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES staff_accounts(user_id),
  account_session_id uuid NOT NULL REFERENCES sessions(id),
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_sessions_user ON staff_sessions(user_id);
