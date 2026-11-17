-- ADR0018: a Tutor can ask the team to set up and publish their profile.
-- The request records the Tutor's own consent; staff act only while a request is claimed.
CREATE TABLE tutor_onboarding_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  request_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  consent_version text NOT NULL,
  consent_accepted_at timestamptz NOT NULL,
  -- WhatsApp number and optional note, encrypted; redacted on account deletion.
  encrypted_contact jsonb,
  assigned_to uuid REFERENCES users(id),
  staff_note varchar(500),
  revision integer NOT NULL DEFAULT 1,
  test_only boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text CHECK (cancelled_by IN ('TUTOR','STAFF','ERASURE')),
  UNIQUE (user_id, request_key),
  CHECK (status <> 'IN_PROGRESS' OR assigned_to IS NOT NULL),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL))
);
-- At most one active request per account.
CREATE UNIQUE INDEX tutor_onboarding_one_active ON tutor_onboarding_requests(user_id) WHERE status IN ('OPEN','IN_PROGRESS');
CREATE INDEX tutor_onboarding_queue ON tutor_onboarding_requests(status, created_at, id);
