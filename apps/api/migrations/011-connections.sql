CREATE TABLE connections (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES contact_requests(id),
  status text NOT NULL CHECK(status IN ('PENDING_GRANT','ACTIVE')),
  safety_suspended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL
);
CREATE TABLE connection_participants (
  connection_id uuid NOT NULL REFERENCES connections(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK(role IN ('PAYER','TUTOR')),
  PRIMARY KEY(connection_id,user_id),
  UNIQUE(connection_id,role)
);
CREATE INDEX connection_participants_owner ON connection_participants(user_id,connection_id);
CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  connection_id uuid NOT NULL UNIQUE REFERENCES connections(id),
  last_sequence bigint NOT NULL DEFAULT 0 CHECK(last_sequence>=0),
  created_at timestamptz NOT NULL
);
CREATE TABLE connection_access_grants (
  connection_id uuid PRIMARY KEY REFERENCES connections(id),
  entitlement_id uuid NOT NULL REFERENCES access_entitlements(id),
  source text NOT NULL CHECK(source='FIXTURE'),
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE contact_request_decisions (
  request_id uuid PRIMARY KEY REFERENCES contact_requests(id),
  tutor_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK(decision IN ('ACCEPT','DECLINE')),
  decided_at timestamptz NOT NULL
);
CREATE INDEX contact_requests_payer_history ON contact_requests(payer_id,id);
CREATE INDEX contact_requests_tutor_history ON contact_requests(tutor_id,id);
