CREATE TABLE refund_cases (
 id uuid PRIMARY KEY,
 cycle_id uuid NOT NULL REFERENCES purchase_cycles(id),
 payer_id uuid NOT NULL REFERENCES users(id),
 request_key uuid NOT NULL,
 encrypted_reason jsonb NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','APPROVED','DECLINED')),
 reviewed_by uuid REFERENCES users(id),
 review_reason text,
 amount_paise bigint,
 access_treatment text CHECK(access_treatment IN ('KEEP','REVOKE_FUTURE')),
 operation_id uuid UNIQUE REFERENCES refund_operations(id),
 created_at timestamptz NOT NULL,
 reviewed_at timestamptz,
 UNIQUE(payer_id,request_key)
);
CREATE FUNCTION immutable_refund_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status<>'OPEN' OR (to_jsonb(NEW)-ARRAY['status','reviewed_by','review_reason','amount_paise','access_treatment','operation_id','reviewed_at']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['status','reviewed_by','review_reason','amount_paise','access_treatment','operation_id','reviewed_at']) THEN RAISE EXCEPTION 'Refund case and recorded decision are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_refund_case BEFORE UPDATE ON refund_cases FOR EACH ROW EXECUTE FUNCTION immutable_refund_case();
CREATE TRIGGER prevent_refund_case_deletion BEFORE DELETE ON refund_cases FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE finance_exceptions (
 id uuid PRIMARY KEY,
 cycle_id uuid REFERENCES purchase_cycles(id),
 kind text NOT NULL,
 reference text NOT NULL,
 details jsonb NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')),
 resolution_reason text,
 resolved_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL,
 resolved_at timestamptz,
 UNIQUE(kind,reference)
);
CREATE TABLE payment_disputes (
 id text PRIMARY KEY,
 cycle_id uuid NOT NULL REFERENCES purchase_cycles(id),
 capture_id uuid NOT NULL REFERENCES payment_journal(id),
 provider_key_id text NOT NULL,
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 currency text NOT NULL,
 amount_deducted bigint NOT NULL CHECK(amount_deducted>=0),
 status text NOT NULL CHECK(status IN ('open','under_review','won','lost','closed')),
 phase text NOT NULL,
 updated_at timestamptz NOT NULL
);
CREATE TABLE finance_observations (
 fingerprint char(64) PRIMARY KEY,
 cycle_id uuid NOT NULL REFERENCES purchase_cycles(id),
 provider_reference text NOT NULL,
 kind text NOT NULL,
 fact jsonb NOT NULL,
 recorded_at timestamptz NOT NULL
);
CREATE TRIGGER immutable_finance_observations BEFORE UPDATE OR DELETE ON finance_observations FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE external_refunds (
 id text PRIMARY KEY,
 capture_id uuid NOT NULL REFERENCES payment_journal(id),
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 currency text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','processed','failed')),
 updated_at timestamptz NOT NULL
);
