CREATE TABLE purchase_cancellations (
  cycle_id uuid PRIMARY KEY REFERENCES purchase_cycles(id),
  reason text NOT NULL CHECK(reason IN ('PAYER_CANCELLED','NO_MATCH')),
  actor_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL
);
CREATE TRIGGER immutable_cancellation BEFORE UPDATE OR DELETE ON purchase_cancellations FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE refund_reserves (
  provider_key_id text NOT NULL,
  currency text NOT NULL,
  confirmed_paise bigint NOT NULL DEFAULT 0 CHECK(confirmed_paise>=0),
  reserved_paise bigint NOT NULL DEFAULT 0 CHECK(reserved_paise>=0),
  spent_paise bigint NOT NULL DEFAULT 0 CHECK(spent_paise>=0),
  PRIMARY KEY(provider_key_id,currency),
  CHECK(confirmed_paise>=reserved_paise+spent_paise)
);
CREATE TABLE refund_reserve_funding (
  reference text PRIMARY KEY,
  provider_key_id text NOT NULL,
  amount_paise bigint NOT NULL CHECK(amount_paise>0),
  currency text NOT NULL CHECK(currency='INR'),
  actor_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TRIGGER immutable_reserve_funding BEFORE UPDATE OR DELETE ON refund_reserve_funding FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE refund_operations (
  id uuid PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES purchase_cycles(id),
  capture_id uuid NOT NULL REFERENCES payment_journal(id),
  business_key text NOT NULL UNIQUE,
  amount_paise bigint NOT NULL CHECK(amount_paise>0),
  currency text NOT NULL,
  reason text NOT NULL,
  provider_body jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('WAITING_RESERVE','RESERVED','SENDING','UNKNOWN','PENDING','PROCESSED','FAILED','REVIEW')),
  provider_refund_id text UNIQUE,
  reserve_held boolean NOT NULL DEFAULT false,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  last_error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX refund_work_due ON refund_operations(next_attempt_at) WHERE status<>'PROCESSED';
CREATE FUNCTION immutable_refund_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','provider_refund_id','reserve_held','lease_token','lease_until','attempts','next_attempt_at','last_error','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','provider_refund_id','reserve_held','lease_token','lease_until','attempts','next_attempt_at','last_error','updated_at']) OR
    (OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id) OR
    (OLD.status='PROCESSED' AND NEW.status<>'PROCESSED') THEN RAISE EXCEPTION 'Refund terms and completed results are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_refund_operation BEFORE UPDATE ON refund_operations FOR EACH ROW EXECUTE FUNCTION immutable_refund_operation();
CREATE TRIGGER prevent_refund_deletion BEFORE DELETE ON refund_operations FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE reversal_journal (
  id uuid PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES purchase_cycles(id),
  capture_id uuid NOT NULL REFERENCES payment_journal(id),
  operation_id uuid UNIQUE REFERENCES refund_operations(id),
  provider_reference text NOT NULL UNIQUE,
  kind text NOT NULL CHECK(kind IN ('REFUND','CHARGEBACK')),
  amount_paise bigint NOT NULL CHECK(amount_paise>0),
  currency text NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE TRIGGER immutable_reversal_journal BEFORE UPDATE OR DELETE ON reversal_journal FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
