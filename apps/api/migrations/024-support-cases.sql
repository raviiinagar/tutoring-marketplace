CREATE TABLE support_cases (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), request_key uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('ACCOUNT','BILLING','OTHER','REVIEW_APPEAL','SAFETY_APPEAL','REFUND_APPEAL')),
 required_scope text NOT NULL CHECK(required_scope IN ('SUPPORT','TRUST','FINANCE')),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 assigned_to uuid REFERENCES users(id), encrypted_description jsonb NOT NULL,
 source_id uuid, related_id uuid, source_revision integer,
 test_only boolean NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 UNIQUE(owner_id,request_key), UNIQUE(owner_id,category,source_id)
);
CREATE INDEX support_owner_queue ON support_cases(owner_id,created_at DESC,id);
CREATE INDEX support_staff_queue ON support_cases(required_scope,status,created_at,id);
CREATE TABLE support_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id uuid NOT NULL UNIQUE,
 case_id uuid NOT NULL REFERENCES support_cases(id), actor_id uuid NOT NULL REFERENCES users(id),
 visibility text NOT NULL CHECK(visibility IN ('USER','INTERNAL')),
 outcome text NOT NULL, encrypted_payload jsonb NOT NULL, created_at timestamptz NOT NULL
);
CREATE INDEX support_event_history ON support_events(case_id,sequence);
CREATE FUNCTION protect_support_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Support case history is immutable'; END $$;
CREATE TRIGGER support_events_immutable BEFORE UPDATE OR DELETE ON support_events
FOR EACH ROW EXECUTE FUNCTION protect_support_event();
CREATE TABLE refund_reconsiderations (
 support_case_id uuid PRIMARY KEY REFERENCES support_cases(id),
 original_case_id uuid NOT NULL REFERENCES refund_cases(id),
 new_case_id uuid NOT NULL UNIQUE REFERENCES refund_cases(id),
 created_at timestamptz NOT NULL
);
CREATE TRIGGER refund_reconsiderations_immutable BEFORE UPDATE OR DELETE ON refund_reconsiderations
FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();

ALTER TABLE safety_appeals DROP CONSTRAINT safety_appeals_status_check;
ALTER TABLE safety_appeals ADD CHECK(status IN ('PENDING_REVIEW','RESOLVED'));
ALTER TABLE safety_appeals ADD COLUMN case_revision integer;
UPDATE safety_appeals a SET case_revision=c.revision FROM safety_cases c WHERE c.id=a.case_id;
ALTER TABLE safety_appeals ALTER COLUMN case_revision SET NOT NULL;
ALTER TABLE safety_appeals ADD CHECK(case_revision>0);
CREATE FUNCTION default_safety_appeal_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.case_revision IS NULL THEN SELECT revision INTO NEW.case_revision FROM safety_cases WHERE id=NEW.case_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER safety_appeal_revision BEFORE INSERT ON safety_appeals FOR EACH ROW EXECUTE FUNCTION default_safety_appeal_revision();
ALTER TABLE safety_appeals DROP CONSTRAINT safety_appeals_case_id_actor_id_key;
ALTER TABLE safety_appeals ADD UNIQUE(case_id,actor_id,case_revision);
ALTER TABLE review_appeals ADD CHECK(status IN ('PENDING','RESOLVED'));

-- A source appeal and its support case commit together, including callers on older app versions.
CREATE FUNCTION link_appeal_support_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE related uuid; source_version integer; isolated boolean; kind text;
BEGIN
 IF TG_TABLE_NAME='review_appeals' THEN
  SELECT id,NEW.review_revision,test_only INTO related,source_version,isolated FROM connection_reviews WHERE id=NEW.review_id;
  kind := 'REVIEW_APPEAL';
 ELSE
  SELECT id,NEW.case_revision,test_only INTO related,source_version,isolated FROM safety_cases WHERE id=NEW.case_id;
  kind := 'SAFETY_APPEAL';
 END IF;
 INSERT INTO support_cases(id,owner_id,request_key,category,required_scope,encrypted_description,source_id,related_id,source_revision,test_only,created_at,updated_at)
 VALUES(gen_random_uuid(),NEW.actor_id,gen_random_uuid(),kind,'TRUST',NEW.encrypted_description,NEW.id,related,source_version,isolated,NEW.created_at,NEW.created_at);
 RETURN NEW;
END $$;
CREATE TRIGGER review_appeal_support AFTER INSERT ON review_appeals FOR EACH ROW EXECUTE FUNCTION link_appeal_support_case();
CREATE TRIGGER safety_appeal_support AFTER INSERT ON safety_appeals FOR EACH ROW EXECUTE FUNCTION link_appeal_support_case();
INSERT INTO support_cases(id,owner_id,request_key,category,required_scope,encrypted_description,source_id,related_id,source_revision,test_only,created_at,updated_at)
 SELECT gen_random_uuid(),a.actor_id,gen_random_uuid(),'REVIEW_APPEAL','TRUST',a.encrypted_description,a.id,r.id,a.review_revision,r.test_only,a.created_at,a.created_at FROM review_appeals a JOIN connection_reviews r ON r.id=a.review_id;
INSERT INTO support_cases(id,owner_id,request_key,category,required_scope,encrypted_description,source_id,related_id,source_revision,test_only,created_at,updated_at)
 SELECT gen_random_uuid(),a.actor_id,gen_random_uuid(),'SAFETY_APPEAL','TRUST',a.encrypted_description,a.id,c.id,c.revision,c.test_only,a.created_at,a.created_at FROM safety_appeals a JOIN safety_cases c ON c.id=a.case_id;
