-- No account, child, free-text, IP, cookie or contact fields enter search telemetry.
CREATE TABLE marketplace_search_receipts (
 key_hash char(64) PRIMARY KEY, fingerprint char(64) NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX marketplace_search_receipts_expiry ON marketplace_search_receipts(expires_at);
CREATE TABLE marketplace_search_daily (
 day date NOT NULL, domain_key text NOT NULL, test_only boolean NOT NULL,
 searches integer NOT NULL DEFAULT 0, matched integer NOT NULL DEFAULT 0,
 empty integer NOT NULL DEFAULT 0, partial integer NOT NULL DEFAULT 0,
 PRIMARY KEY(day,domain_key,test_only), CHECK(searches=matched+empty+partial),
 CHECK(searches>=0 AND matched>=0 AND empty>=0 AND partial>=0)
);
-- Attribute a purchase once using its actual checkout Listing revision. Future
-- Listing edits cannot rewrite a financial cohort's Learning Domain.
CREATE TABLE purchase_domain_facts (
 cycle_id uuid PRIMARY KEY REFERENCES purchase_cycles(id),
 domain_id text NOT NULL REFERENCES learning_domains(id),
 source text NOT NULL CHECK(source IN ('CHECKOUT','REVISION_BACKFILL')),
 recorded_at timestamptz NOT NULL
);
CREATE TRIGGER immutable_purchase_domain BEFORE UPDATE OR DELETE ON purchase_domain_facts FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
INSERT INTO purchase_domain_facts(cycle_id,domain_id,source,recorded_at)
 SELECT p.id,l.payload->>'domain_id','REVISION_BACKFILL',p.created_at
 FROM purchase_cycles p JOIN teaching_listings l ON l.id=p.listing_id AND l.revision=p.listing_revision JOIN learning_domains d ON d.id=l.payload->>'domain_id';
CREATE FUNCTION record_purchase_domain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO purchase_domain_facts(cycle_id,domain_id,source,recorded_at)
 SELECT NEW.id,l.payload->>'domain_id','CHECKOUT',NEW.created_at FROM teaching_listings l JOIN learning_domains d ON d.id=l.payload->>'domain_id' WHERE l.id=NEW.listing_id AND l.revision=NEW.listing_revision;
 RETURN NEW;
END $$;
CREATE TRIGGER purchase_domain_at_checkout AFTER INSERT ON purchase_cycles FOR EACH ROW EXECUTE FUNCTION record_purchase_domain();
CREATE INDEX marketplace_request_cohorts ON contact_requests(created_at);
CREATE INDEX marketplace_capture_cohorts ON payment_journal(captured_at,cycle_id) WHERE kind='CAPTURE';
