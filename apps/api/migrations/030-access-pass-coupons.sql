CREATE TABLE access_coupons (
 id uuid PRIMARY KEY, code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{3,31}$'),
 percent_off integer NOT NULL CHECK(percent_off BETWEEN 1 AND 100),
 starts_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 max_uses integer NOT NULL CHECK(max_uses BETWEEN 1 AND 100000),
 test_only boolean NOT NULL, enabled boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL,
 CHECK(expires_at>starts_at)
);
CREATE FUNCTION immutable_coupon_terms() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'enabled') IS DISTINCT FROM (to_jsonb(OLD)-'enabled') THEN
 RAISE EXCEPTION 'Coupon terms are immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_coupon_terms BEFORE UPDATE OR DELETE ON access_coupons FOR EACH ROW EXECUTE FUNCTION immutable_coupon_terms();
CREATE TABLE coupon_redemptions (
 id uuid PRIMARY KEY, coupon_id uuid NOT NULL REFERENCES access_coupons(id), payer_id uuid NOT NULL REFERENCES users(id),
 request_key uuid NOT NULL, payload_hash text NOT NULL, policy_version text NOT NULL REFERENCES payment_policies(version),
 code text NOT NULL, percent_off integer NOT NULL, base_paise integer NOT NULL, discount_paise integer NOT NULL,
 total_paise integer NOT NULL, test_only boolean NOT NULL, cycle_id uuid UNIQUE REFERENCES purchase_cycles(id),
 created_at timestamptz NOT NULL,
 UNIQUE(coupon_id,payer_id), UNIQUE(payer_id,request_key), UNIQUE(id,payer_id),
 CHECK(base_paise>0 AND percent_off BETWEEN 1 AND 100 AND discount_paise=base_paise*percent_off/100 AND total_paise=base_paise-discount_paise),
 CHECK((total_paise=0 AND cycle_id IS NULL) OR (total_paise>0 AND cycle_id IS NOT NULL))
);
CREATE TRIGGER immutable_coupon_redemption BEFORE UPDATE OR DELETE ON coupon_redemptions FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
ALTER TABLE purchase_cycles ADD COLUMN coupon_redemption_id uuid UNIQUE REFERENCES coupon_redemptions(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE access_entitlements ADD COLUMN coupon_redemption_id uuid UNIQUE;
ALTER TABLE access_entitlements ADD COLUMN issued_at timestamptz;
ALTER TABLE access_entitlements ADD CONSTRAINT coupon_entitlement_owner FOREIGN KEY(coupon_redemption_id,payer_id) REFERENCES coupon_redemptions(id,payer_id);
ALTER TABLE access_entitlements DROP CONSTRAINT access_entitlements_source_check;
ALTER TABLE access_entitlements ADD CONSTRAINT access_entitlements_source_check CHECK(source IN ('FIXTURE','PAYMENT','COUPON'));
ALTER TABLE access_entitlements DROP CONSTRAINT access_entitlements_check;
ALTER TABLE access_entitlements ADD CONSTRAINT entitlement_matching_time CHECK(status<>'MATCHING' OR (COALESCE(captured_at,issued_at) IS NOT NULL AND matching_deadline>COALESCE(captured_at,issued_at)));
ALTER TABLE access_entitlements DROP CONSTRAINT paid_entitlement_shape;
ALTER TABLE access_entitlements ADD CONSTRAINT paid_entitlement_shape CHECK(
 (source='FIXTURE' AND cycle_id IS NULL AND test_only AND coupon_redemption_id IS NULL AND issued_at IS NULL) OR
 (source='PAYMENT' AND cycle_id IS NOT NULL AND coupon_redemption_id IS NULL AND issued_at IS NULL AND captured_at IS NOT NULL AND matching_deadline IS NOT NULL AND matching_deadline=captured_at+interval '72 hours' AND
  ((starts_at IS NULL AND ends_at IS NULL AND status<>'ACTIVE') OR (starts_at IS NOT NULL AND ends_at=starts_at+interval '30 days' AND status<>'MATCHING'))) OR
 (source='COUPON' AND cycle_id IS NULL AND coupon_redemption_id IS NOT NULL AND captured_at IS NULL AND issued_at IS NOT NULL AND matching_deadline IS NOT NULL AND matching_deadline=issued_at+interval '72 hours' AND
  ((starts_at IS NULL AND ends_at IS NULL AND status<>'ACTIVE') OR (starts_at IS NOT NULL AND ends_at=starts_at+interval '30 days' AND status<>'MATCHING')))
);
CREATE OR REPLACE FUNCTION immutable_paid_entitlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.source IN ('PAYMENT','COUPON') THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Entitlement history is immutable'; END IF;
  IF (to_jsonb(NEW)-'status'-'starts_at'-'ends_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'starts_at'-'ends_at') OR
   (OLD.starts_at IS NOT NULL AND (NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at)) OR
   (OLD.status='REVOKED' AND NEW.status<>'REVOKED') OR (OLD.status='ACTIVE' AND NEW.status='MATCHING') OR
   (OLD.starts_at IS NULL AND NEW.starts_at IS NOT NULL AND NOT(OLD.status='MATCHING' AND NEW.status='ACTIVE')) THEN
   RAISE EXCEPTION 'Entitlement identity and activation interval are immutable'; END IF;
 END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
ALTER TABLE connection_access_grants DROP CONSTRAINT connection_access_grants_source_check;
ALTER TABLE connection_access_grants ADD CONSTRAINT connection_access_grants_source_check CHECK(source IN ('FIXTURE','PAYMENT','COUPON'));
