ALTER TABLE access_entitlements DROP CONSTRAINT access_entitlements_source_check;
ALTER TABLE access_entitlements ADD CONSTRAINT access_entitlements_source_check CHECK(source IN ('FIXTURE','PAYMENT'));
ALTER TABLE access_entitlements ADD COLUMN cycle_id uuid UNIQUE REFERENCES purchase_cycles(id);
ALTER TABLE access_entitlements ADD COLUMN test_only boolean NOT NULL DEFAULT true;
ALTER TABLE purchase_cycles ADD CONSTRAINT purchase_cycle_payer UNIQUE(id,payer_id);
ALTER TABLE access_entitlements ADD CONSTRAINT entitlement_cycle_owner FOREIGN KEY(cycle_id,payer_id) REFERENCES purchase_cycles(id,payer_id);
ALTER TABLE access_entitlements ADD CONSTRAINT paid_entitlement_shape CHECK(
  (source='FIXTURE' AND cycle_id IS NULL AND test_only) OR
  (source='PAYMENT' AND cycle_id IS NOT NULL AND captured_at IS NOT NULL AND matching_deadline IS NOT NULL AND matching_deadline=captured_at+interval '72 hours' AND
    ((starts_at IS NULL AND ends_at IS NULL AND status<>'ACTIVE') OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND status<>'MATCHING' AND ends_at=starts_at+interval '30 days')))
);
ALTER TABLE access_entitlements ADD CONSTRAINT entitlement_source_unique UNIQUE(id,source);
ALTER TABLE connection_access_grants DROP CONSTRAINT connection_access_grants_source_check;
ALTER TABLE connection_access_grants ADD CONSTRAINT connection_access_grants_source_check CHECK(source IN ('FIXTURE','PAYMENT'));
ALTER TABLE connection_access_grants ADD CONSTRAINT connection_grant_source FOREIGN KEY(entitlement_id,source) REFERENCES access_entitlements(id,source);

CREATE FUNCTION immutable_paid_entitlement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.source='PAYMENT' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Paid entitlement history is immutable'; END IF;
    IF (to_jsonb(NEW)-'status'-'starts_at'-'ends_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'starts_at'-'ends_at') OR
       (OLD.starts_at IS NOT NULL AND (NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at)) OR
       (OLD.status='REVOKED' AND NEW.status<>'REVOKED') OR
       (OLD.status='ACTIVE' AND NEW.status='MATCHING') OR
       (OLD.starts_at IS NULL AND NEW.starts_at IS NOT NULL AND NOT(OLD.status='MATCHING' AND NEW.status='ACTIVE')) THEN
      RAISE EXCEPTION 'Paid entitlement identity and activation interval are immutable';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_paid_entitlement BEFORE UPDATE OR DELETE ON access_entitlements FOR EACH ROW EXECUTE FUNCTION immutable_paid_entitlement();
