CREATE TABLE class_invitations (
 id uuid PRIMARY KEY,
 connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES users(id),
 request_key uuid NOT NULL,
 payload_hash char(64) NOT NULL,
 encrypted_payload jsonb NOT NULL,
 starts_at timestamptz NOT NULL,
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 240),
 status text NOT NULL CHECK(status IN ('SCHEDULED','CANCELLED')),
 revision integer NOT NULL CHECK(revision > 0),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 UNIQUE(connection_id,request_key)
);
CREATE INDEX class_invitations_connection_time ON class_invitations(connection_id,starts_at,id);
