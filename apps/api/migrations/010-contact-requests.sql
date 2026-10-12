CREATE TABLE contact_request_policies (
  version text PRIMARY KEY,
  pending_limit integer NOT NULL CHECK(pending_limit BETWEEN 1 AND 5),
  ttl_hours integer NOT NULL CHECK(ttl_hours=72)
);
INSERT INTO contact_request_policies VALUES('contact-v1',5,72);
CREATE FUNCTION immutable_request_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Contact Request policies are immutable'; END $$;
CREATE TRIGGER immutable_request_policy BEFORE UPDATE OR DELETE ON contact_request_policies FOR EACH ROW EXECUTE FUNCTION immutable_request_policy();

-- Test coverage only until the verified payment/activation integrations in tasks 14-15.
-- No public grant command exists; production rejects this source regardless of row contents.
CREATE TABLE access_entitlements (
  id uuid PRIMARY KEY,
  payer_id uuid NOT NULL REFERENCES users(id),
  source text NOT NULL CHECK(source='FIXTURE'),
  policy_version text NOT NULL,
  status text NOT NULL CHECK(status IN ('MATCHING','ACTIVE','REVOKED')),
  captured_at timestamptz,
  matching_deadline timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL,
  CHECK(status<>'MATCHING' OR (captured_at IS NOT NULL AND matching_deadline>captured_at)),
  CHECK(status<>'ACTIVE' OR (starts_at IS NOT NULL AND ends_at>starts_at))
);
CREATE INDEX access_entitlements_payer ON access_entitlements(payer_id,status);
CREATE TABLE account_blocks (
  owner_id uuid NOT NULL REFERENCES users(id),
  blocked_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,blocked_id),
  CHECK(owner_id<>blocked_id)
);
CREATE TABLE contact_requests (
  id uuid PRIMARY KEY,
  payer_id uuid NOT NULL REFERENCES users(id),
  tutor_id uuid NOT NULL REFERENCES users(id),
  learner_id uuid NOT NULL REFERENCES learner_profiles(id),
  listing_id uuid NOT NULL REFERENCES teaching_listings(id),
  listing_revision integer NOT NULL,
  profile_revision integer NOT NULL,
  offer_snapshot jsonb NOT NULL,
  encrypted_message jsonb NOT NULL,
  request_key uuid NOT NULL,
  payload_hash char(64) NOT NULL,
  entitlement_id uuid NOT NULL REFERENCES access_entitlements(id),
  coverage_snapshot jsonb NOT NULL,
  request_policy_version text NOT NULL REFERENCES contact_request_policies(version),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(payer_id,request_key),
  CHECK(payer_id<>tutor_id),
  CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX contact_requests_one_pending_offer ON contact_requests(payer_id,learner_id,listing_id) WHERE status='PENDING';
CREATE INDEX contact_requests_payer_pending ON contact_requests(payer_id,expires_at) WHERE status='PENDING';
CREATE INDEX contact_requests_tutor ON contact_requests(tutor_id,created_at,id);
CREATE TABLE contact_request_keys (
  payer_id uuid NOT NULL REFERENCES users(id),
  request_key uuid NOT NULL,
  payload_hash char(64) NOT NULL,
  request_id uuid NOT NULL REFERENCES contact_requests(id),
  PRIMARY KEY(payer_id,request_key)
);
CREATE FUNCTION immutable_contact_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at') THEN
    RAISE EXCEPTION 'Contact Request submission and coverage snapshots are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_contact_request BEFORE UPDATE ON contact_requests FOR EACH ROW EXECUTE FUNCTION immutable_contact_request();
