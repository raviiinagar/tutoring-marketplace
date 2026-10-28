ALTER TABLE tutor_profiles ADD COLUMN onboarding_version integer NOT NULL DEFAULT 1 CHECK(onboarding_version IN (1,2));
ALTER TABLE tutor_profiles ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE tutor_profiles ADD COLUMN public_revision integer NOT NULL DEFAULT 1;
ALTER TABLE tutor_profiles ADD COLUMN subject_ids text[] NOT NULL DEFAULT '{}';
ALTER TABLE tutor_profiles ADD COLUMN hourly_rate_paise integer CHECK(hourly_rate_paise BETWEEN 100 AND 10000000);
ALTER TABLE tutor_profiles ADD COLUMN identity_country text CHECK(identity_country IN ('IN','OTHER'));
ALTER TABLE tutor_profiles ADD COLUMN identity_document text CHECK(identity_document IN ('AADHAAR','GOVERNMENT_ID','PASSPORT'));
ALTER TABLE tutor_profiles ADD COLUMN public_email_consent_at timestamptz;
ALTER TABLE tutor_profiles ADD COLUMN public_email_consent_version text;
UPDATE tutor_profiles p SET subject_ids=COALESCE((SELECT array_agg(DISTINCT c.subject_id ORDER BY c.subject_id) FROM tutor_claims c WHERE c.user_id=p.user_id AND c.profile_revision=p.revision AND c.kind<>'IDENTITY' AND c.subject_id IS NOT NULL),'{}'),hourly_rate_paise=(SELECT (l.payload->>'rate_paise')::integer FROM teaching_listings l WHERE l.user_id=p.user_id AND l.payload->>'rate_unit'='HOUR' ORDER BY l.created_at,l.id LIMIT 1);
CREATE INDEX public_tutor_subjects ON tutor_profiles USING gin(subject_ids);
ALTER TABLE payment_policies ADD COLUMN product text NOT NULL DEFAULT 'LEARNER_ACCESS' CHECK(product IN ('LEARNER_ACCESS','TUTOR_PRO'));
ALTER TABLE payment_policies ADD CONSTRAINT policy_product_unique UNIQUE(version,product);
INSERT INTO payment_policies(version,amount_paise,currency,access_days,matching_hours,product) VALUES('tutor-pro-v1',60000,'INR',30,72,'TUTOR_PRO');
ALTER TABLE purchase_cycles ADD COLUMN product text NOT NULL DEFAULT 'LEARNER_ACCESS' CHECK(product IN ('LEARNER_ACCESS','TUTOR_PRO'));
ALTER TABLE purchase_cycles ALTER COLUMN learner_id DROP NOT NULL;
ALTER TABLE purchase_cycles ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE purchase_cycles ALTER COLUMN listing_revision DROP NOT NULL;
ALTER TABLE purchase_cycles ADD CONSTRAINT cycle_product_unique UNIQUE(id,product);
ALTER TABLE purchase_cycles ADD CONSTRAINT cycle_policy_product FOREIGN KEY(policy_version,product) REFERENCES payment_policies(version,product);
ALTER TABLE purchase_cycles ADD CONSTRAINT cycle_product_shape CHECK((product='LEARNER_ACCESS' AND learner_id IS NOT NULL AND listing_id IS NOT NULL AND listing_revision IS NOT NULL) OR (product='TUTOR_PRO' AND learner_id IS NULL AND listing_id IS NULL AND listing_revision IS NULL));
DROP INDEX one_open_purchase_per_payer;
CREATE UNIQUE INDEX one_open_purchase_per_payer ON purchase_cycles(payer_id,product) WHERE open;
ALTER TABLE access_entitlements ADD COLUMN product text NOT NULL DEFAULT 'LEARNER_ACCESS' CHECK(product='LEARNER_ACCESS');
ALTER TABLE access_entitlements ADD CONSTRAINT learner_entitlement_product FOREIGN KEY(cycle_id,product) REFERENCES purchase_cycles(id,product);
ALTER TABLE access_coupons ADD COLUMN product text NOT NULL DEFAULT 'LEARNER_ACCESS' CHECK(product IN ('LEARNER_ACCESS','TUTOR_PRO'));
ALTER TABLE access_coupons ADD CONSTRAINT coupon_product_unique UNIQUE(id,product);
ALTER TABLE coupon_redemptions ADD COLUMN product text NOT NULL DEFAULT 'LEARNER_ACCESS' CHECK(product IN ('LEARNER_ACCESS','TUTOR_PRO'));
ALTER TABLE coupon_redemptions ADD CONSTRAINT redemption_product_unique UNIQUE(id,product);
ALTER TABLE coupon_redemptions ADD CONSTRAINT redemption_campaign_product FOREIGN KEY(coupon_id,product) REFERENCES access_coupons(id,product);
ALTER TABLE coupon_redemptions ADD CONSTRAINT redemption_cycle_product FOREIGN KEY(cycle_id,product) REFERENCES purchase_cycles(id,product);
CREATE TABLE tutor_pro_grants (
 id uuid PRIMARY KEY,payer_id uuid NOT NULL REFERENCES users(id),source text NOT NULL CHECK(source IN ('PAYMENT','COUPON')),
 product text NOT NULL DEFAULT 'TUTOR_PRO' CHECK(product='TUTOR_PRO'),
 cycle_id uuid UNIQUE,capture_id uuid UNIQUE REFERENCES payment_journal(id),coupon_redemption_id uuid UNIQUE,
 test_only boolean NOT NULL,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,created_at timestamptz NOT NULL,
 FOREIGN KEY(cycle_id,payer_id) REFERENCES purchase_cycles(id,payer_id),
 FOREIGN KEY(cycle_id,product) REFERENCES purchase_cycles(id,product),
 FOREIGN KEY(coupon_redemption_id,payer_id) REFERENCES coupon_redemptions(id,payer_id),
 FOREIGN KEY(coupon_redemption_id,product) REFERENCES coupon_redemptions(id,product),
 CHECK(ends_at=starts_at+interval '30 days'),
 CHECK((source='PAYMENT' AND cycle_id IS NOT NULL AND capture_id IS NOT NULL AND coupon_redemption_id IS NULL) OR (source='COUPON' AND cycle_id IS NULL AND capture_id IS NULL AND coupon_redemption_id IS NOT NULL))
);
CREATE INDEX tutor_pro_current ON tutor_pro_grants(payer_id,ends_at) WHERE status='ACTIVE';
CREATE FUNCTION immutable_tutor_pro_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR (OLD.status='REVOKED' AND NEW.status<>'REVOKED') THEN RAISE EXCEPTION 'Tutor Pro terms and activation are immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_tutor_pro_grant BEFORE UPDATE OR DELETE ON tutor_pro_grants FOR EACH ROW EXECUTE FUNCTION immutable_tutor_pro_grant();


ALTER TABLE coupon_redemptions ADD CONSTRAINT redemption_policy_product FOREIGN KEY(policy_version,product) REFERENCES payment_policies(version,product);
ALTER TABLE access_entitlements ADD CONSTRAINT learner_coupon_product FOREIGN KEY(coupon_redemption_id,product) REFERENCES coupon_redemptions(id,product);

ALTER TABLE tutor_pro_grants ADD CONSTRAINT tutor_pro_grant_owner UNIQUE(id,payer_id);
ALTER TABLE contact_requests ADD COLUMN tutor_pro_grant_id uuid;
ALTER TABLE contact_requests ADD CONSTRAINT request_tutor_pro_owner FOREIGN KEY(tutor_pro_grant_id,tutor_id) REFERENCES tutor_pro_grants(id,payer_id);
