-- ADR0020: sign in with Google. One Google account per platform account.
CREATE TABLE user_identities (
  provider text NOT NULL CHECK (provider IN ('GOOGLE')),
  subject varchar(255) NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  email varchar(254) NOT NULL,
  created_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL,
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);

-- One-time sign-in attempts. The state and the browser binding are stored only as hashes;
-- the PKCE verifier and nonce are encrypted. Rows expire after ten minutes.
CREATE TABLE oauth_states (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('GOOGLE')),
  state_hash char(64) NOT NULL UNIQUE,
  binding_hash char(64) NOT NULL,
  encrypted_secrets jsonb NOT NULL,
  return_to varchar(200) NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);
