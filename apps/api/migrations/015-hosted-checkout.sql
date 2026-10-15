CREATE TABLE payment_policies (
  version text PRIMARY KEY,
  amount_paise integer NOT NULL CHECK(amount_paise > 0),
  currency text NOT NULL CHECK(currency='INR'),
  access_days integer NOT NULL CHECK(access_days=30),
  matching_hours integer NOT NULL CHECK(matching_hours=72)
);
INSERT INTO payment_policies VALUES ('access-v1',59900,'INR',30,72);
CREATE FUNCTION immutable_payment_fact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Payment policies and journal facts are immutable'; END $$;
CREATE TRIGGER immutable_payment_policy BEFORE UPDATE OR DELETE ON payment_policies FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();

CREATE TABLE purchase_cycles (
  id uuid PRIMARY KEY,
  payer_id uuid NOT NULL REFERENCES users(id),
  learner_id uuid NOT NULL REFERENCES learner_profiles(id),
  listing_id uuid NOT NULL REFERENCES teaching_listings(id),
  listing_revision integer NOT NULL,
  request_key uuid NOT NULL,
  policy_version text NOT NULL REFERENCES payment_policies(version),
  amount_paise integer NOT NULL CHECK(amount_paise > 0),
  currency text NOT NULL CHECK(currency='INR'),
  provider_key_id text NOT NULL,
  test_only boolean NOT NULL,
  disclosures jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('CREATING','ORDER_READY','UNKNOWN','VERIFYING','CAPTURED','REVIEW')),
  open boolean NOT NULL DEFAULT true,
  provider_order_id text UNIQUE,
  captured_at timestamptz,
  matching_deadline timestamptz,
  resolution_required boolean NOT NULL DEFAULT false,
  last_payment_failed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(payer_id,request_key),
  CHECK((captured_at IS NULL)=(matching_deadline IS NULL)),
  CHECK(matching_deadline IS NULL OR matching_deadline=captured_at+interval '72 hours')
);
CREATE UNIQUE INDEX one_open_purchase_per_payer ON purchase_cycles(payer_id) WHERE open;
CREATE FUNCTION immutable_purchase_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'status'-'open'-'provider_order_id'-'captured_at'-'matching_deadline'-'resolution_required'-'updated_at'-'last_payment_failed') IS DISTINCT FROM
     (to_jsonb(OLD)-'status'-'open'-'provider_order_id'-'captured_at'-'matching_deadline'-'resolution_required'-'updated_at'-'last_payment_failed') OR
     (OLD.provider_order_id IS NOT NULL AND NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id) OR
     (OLD.captured_at IS NOT NULL AND (NEW.captured_at IS DISTINCT FROM OLD.captured_at OR NEW.matching_deadline IS DISTINCT FROM OLD.matching_deadline)) THEN
    RAISE EXCEPTION 'Purchase terms and confirmed capture time are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_purchase_terms BEFORE UPDATE ON purchase_cycles FOR EACH ROW EXECUTE FUNCTION immutable_purchase_terms();

-- Only whitelisted financial fields are persisted, never raw card/contact payloads.
CREATE TABLE payment_webhook_inbox (
  event_id text PRIMARY KEY,
  body_hash char(64) NOT NULL,
  event jsonb NOT NULL,
  provider_key_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSED','UNMATCHED','REVIEW','IGNORED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  processed_at timestamptz,
  last_error text
);
CREATE INDEX payment_inbox_pending ON payment_webhook_inbox(next_attempt_at) WHERE status IN ('PENDING','UNMATCHED');
CREATE TABLE payment_journal (
  id uuid PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES purchase_cycles(id),
  provider_payment_id text NOT NULL UNIQUE,
  provider_order_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('CAPTURE','UNEXPECTED_CAPTURE')),
  amount_paise bigint NOT NULL CHECK(amount_paise>0),
  currency text NOT NULL,
  captured_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  event_id text NOT NULL REFERENCES payment_webhook_inbox(event_id)
);
CREATE TRIGGER immutable_payment_journal BEFORE UPDATE OR DELETE ON payment_journal FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
