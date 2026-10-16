CREATE TABLE financial_entries (
 id uuid PRIMARY KEY, source_type text NOT NULL, source_id text NOT NULL,
 cycle_id uuid REFERENCES purchase_cycles(id), provider_key_id text NOT NULL, test_only boolean NOT NULL, currency text NOT NULL,
 created_at timestamptz NOT NULL, UNIQUE(source_type,source_id)
);
CREATE TABLE financial_postings (
 entry_id uuid NOT NULL REFERENCES financial_entries(id), account text NOT NULL,
 direction text NOT NULL CHECK(direction IN ('DEBIT','CREDIT')),
 amount_paise bigint NOT NULL CHECK(amount_paise>0), PRIMARY KEY(entry_id,account,direction)
);
CREATE FUNCTION balanced_financial_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; total numeric; quantity integer;
BEGIN
 IF TG_TABLE_NAME='financial_entries' THEN target=NEW.id; ELSE target=NEW.entry_id; END IF;
 SELECT COALESCE(sum(CASE WHEN direction='DEBIT' THEN amount_paise ELSE -amount_paise END),0),count(*) INTO total,quantity FROM financial_postings WHERE entry_id=target;
 IF total<>0 OR quantity<2 THEN RAISE EXCEPTION 'Financial journal entry must balance'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_entry AFTER INSERT ON financial_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balanced_financial_entry();
CREATE CONSTRAINT TRIGGER balanced_postings AFTER INSERT ON financial_postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balanced_financial_entry();
CREATE TRIGGER immutable_financial_entries BEFORE UPDATE OR DELETE ON financial_entries FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TRIGGER immutable_financial_postings BEFORE UPDATE OR DELETE ON financial_postings FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE reconciliation_runs (
 id uuid PRIMARY KEY, request_key uuid NOT NULL UNIQUE, provider_key_id text NOT NULL, test_only boolean NOT NULL,
 selection jsonb NOT NULL, actor_id uuid REFERENCES users(id), reason text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','COMPLETED','REVIEW')),
 next_skip integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz, last_error text,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE provider_recon_rows (
 reference text PRIMARY KEY, provider_key_id text NOT NULL, fingerprint char(64) NOT NULL,
 settlement_id text, snapshot jsonb NOT NULL, imported_at timestamptz NOT NULL
);
CREATE TRIGGER immutable_provider_recon_rows BEFORE UPDATE OR DELETE ON provider_recon_rows FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE provider_settlements (
 id text PRIMARY KEY, provider_key_id text NOT NULL, amount_paise bigint NOT NULL CHECK(amount_paise>=0),
 currency text NOT NULL CHECK(currency='INR'), status text NOT NULL, utr text, snapshot jsonb NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE bank_receipts (
 reference text PRIMARY KEY, provider_key_id text NOT NULL, fingerprint char(64) NOT NULL, utr text NOT NULL,
 amount_paise bigint NOT NULL CHECK(amount_paise>0), currency text NOT NULL CHECK(currency='INR'), received_at timestamptz NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL,
 settlement_id text UNIQUE REFERENCES provider_settlements(id), created_at timestamptz NOT NULL
);
CREATE TABLE payment_reconciliation_checks (
 cycle_id uuid PRIMARY KEY REFERENCES purchase_cycles(id), next_check_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, last_error text
);

CREATE FUNCTION immutable_bank_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'settlement_id') IS DISTINCT FROM (to_jsonb(OLD)-'settlement_id') OR (OLD.settlement_id IS NOT NULL AND NEW.settlement_id IS DISTINCT FROM OLD.settlement_id) THEN RAISE EXCEPTION 'Bank receipt evidence is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_bank_receipt BEFORE UPDATE ON bank_receipts FOR EACH ROW EXECUTE FUNCTION immutable_bank_receipt();
CREATE TRIGGER prevent_bank_receipt_deletion BEFORE DELETE ON bank_receipts FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();

ALTER TABLE finance_exceptions ADD COLUMN provider_key_id text, ADD COLUMN test_only boolean NOT NULL DEFAULT true;
UPDATE finance_exceptions e SET provider_key_id=p.provider_key_id,test_only=p.test_only FROM purchase_cycles p WHERE p.id=e.cycle_id;
