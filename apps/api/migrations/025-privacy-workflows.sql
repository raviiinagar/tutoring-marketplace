CREATE TABLE privacy_verifications (
 token_hash char(64) PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),session_id uuid NOT NULL REFERENCES sessions(id),
 purpose text NOT NULL CHECK(purpose IN ('EXPORT','DELETE','WITHDRAW','DOWNLOAD')),expires_at timestamptz NOT NULL,used_at timestamptz
);
CREATE TABLE privacy_receipts (
 token_hash char(64) PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL
);
CREATE TABLE privacy_requests (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),request_key uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('EXPORT','DELETE','WITHDRAW')),profile_id uuid REFERENCES learner_profiles(id),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSING','COMPLETED','RETRYING','EXTERNAL_REVIEW','FAILED')),
 verified_at timestamptz NOT NULL,policy_snapshot jsonb,email_hash char(64),withdraw_scope jsonb NOT NULL DEFAULT '{}',test_only boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL,completed_at timestamptz,
 available_at timestamptz NOT NULL,lease_token uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,last_error text,
 result jsonb NOT NULL DEFAULT '{}',UNIQUE(user_id,request_key)
);
CREATE INDEX privacy_work_due ON privacy_requests(available_at,id) WHERE status IN ('QUEUED','PROCESSING','RETRYING');
CREATE TABLE privacy_exports (
 request_id uuid PRIMARY KEY REFERENCES privacy_requests(id),encrypted_payload jsonb NOT NULL,byte_length integer NOT NULL,expires_at timestamptz NOT NULL
);
CREATE TABLE privacy_tombstones (
 request_id uuid PRIMARY KEY REFERENCES privacy_requests(id),user_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('DELETE','WITHDRAW')),profile_id uuid,recorded_at timestamptz NOT NULL
);
CREATE TABLE privacy_retained (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES privacy_requests(id),user_id uuid NOT NULL REFERENCES users(id),
 class text NOT NULL CHECK(class IN ('ACCOUNT','PHOTO','EVIDENCE','SAFETY','SUPPORT','FINANCE')),
 scope text NOT NULL CHECK(scope IN ('SUPPORT','TRUST','FINANCE')),purpose text NOT NULL,
 encrypted_payload jsonb,expires_at timestamptz NOT NULL,purged_at timestamptz,created_at timestamptz NOT NULL,
 UNIQUE(request_id,class,scope)
);
CREATE TABLE privacy_holds (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),class text NOT NULL,scope text NOT NULL,
 reference text NOT NULL,reason text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL,
 released_at timestamptz,released_by uuid REFERENCES users(id),release_reason text
);
CREATE TABLE privacy_events (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES privacy_requests(id),event text NOT NULL,actor_id uuid REFERENCES users(id),
 metadata jsonb NOT NULL,created_at timestamptz NOT NULL
);
CREATE TRIGGER privacy_events_immutable BEFORE UPDATE OR DELETE ON privacy_events FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();

-- A worker may redact a narrow set of personal fields only for a recorded, active erasure job.
CREATE FUNCTION privacy_erasure_allowed(subject uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM privacy_requests p JOIN privacy_tombstones t ON t.request_id=p.id
 WHERE p.id::text=current_setting('app.privacy_request',true) AND p.status='PROCESSING' AND p.kind='DELETE' AND p.user_id=subject)
$$;
CREATE FUNCTION privacy_withdrawal_allowed(request uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM privacy_requests p JOIN privacy_tombstones t ON t.request_id=p.id JOIN contact_requests r ON r.id=request
 WHERE p.id::text=current_setting('app.privacy_request',true) AND p.status='PROCESSING' AND p.kind='WITHDRAW' AND p.user_id=r.payer_id
 AND p.withdraw_scope->'request_ids' ? r.id::text)
$$;
CREATE OR REPLACE FUNCTION immutable_contact_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at']) THEN RETURN NEW; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','updated_at','encrypted_message','offer_snapshot']) IS NOT DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['status','updated_at','encrypted_message','offer_snapshot'])
 AND (NEW.encrypted_message=OLD.encrypted_message OR privacy_erasure_allowed(OLD.payer_id) OR privacy_withdrawal_allowed(OLD.id))
 AND (NEW.offer_snapshot=OLD.offer_snapshot OR (privacy_erasure_allowed(OLD.tutor_id) AND
 (NEW.offer_snapshot-ARRAY['title','description'])=(OLD.offer_snapshot-ARRAY['title','description']))) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Contact Request submission and coverage snapshots are immutable';
END $$;
CREATE OR REPLACE FUNCTION protect_support_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'encrypted_payload')=(to_jsonb(OLD)-'encrypted_payload') AND
 EXISTS(SELECT 1 FROM support_cases c WHERE c.id=OLD.case_id AND privacy_erasure_allowed(c.owner_id)) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Support case history is immutable';
END $$;
CREATE OR REPLACE FUNCTION immutable_refund_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['encrypted_reason','review_reason'])=(to_jsonb(OLD)-ARRAY['encrypted_reason','review_reason']) AND privacy_erasure_allowed(OLD.payer_id) THEN RETURN NEW; END IF;
 IF OLD.status<>'OPEN' OR (to_jsonb(NEW)-ARRAY['status','reviewed_by','review_reason','amount_paise','access_treatment','operation_id','reviewed_at']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['status','reviewed_by','review_reason','amount_paise','access_treatment','operation_id','reviewed_at']) THEN RAISE EXCEPTION 'Refund case and recorded decision are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION privacy_review_reason() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'reason')=(to_jsonb(OLD)-'reason') AND
 EXISTS(SELECT 1 FROM connection_reviews r WHERE r.id=OLD.review_id AND (privacy_erasure_allowed(r.author_id) OR privacy_erasure_allowed(r.tutor_id))) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Review decisions are immutable';
END $$;
DROP TRIGGER immutable_review_decisions ON review_decisions;
CREATE TRIGGER immutable_review_decisions BEFORE UPDATE OR DELETE ON review_decisions FOR EACH ROW EXECUTE FUNCTION privacy_review_reason();
CREATE FUNCTION prevent_privacy_reactivation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='ACTIVE' AND EXISTS(SELECT 1 FROM privacy_tombstones WHERE user_id=NEW.id AND kind='DELETE') THEN RAISE EXCEPTION 'A deletion tombstone prevents account reactivation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_no_reactivation BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION prevent_privacy_reactivation();
CREATE TABLE privacy_policies(id text PRIMARY KEY,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL);
CREATE TRIGGER privacy_policies_immutable BEFORE UPDATE OR DELETE ON privacy_policies FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE privacy_retention_runs (
 id uuid PRIMARY KEY,policy_id text NOT NULL REFERENCES privacy_policies(id),status text NOT NULL,
 purged_count integer NOT NULL DEFAULT 0,started_at timestamptz NOT NULL,completed_at timestamptz,last_error text
);
ALTER TABLE guardian_verifications ADD COLUMN evidence_erased_at timestamptz;
