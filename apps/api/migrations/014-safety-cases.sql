CREATE TABLE safety_cases (
 id uuid PRIMARY KEY,
 reporter_id uuid NOT NULL REFERENCES users(id),
 subject_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL REFERENCES contact_requests(id),
 connection_id uuid REFERENCES connections(id),
 listing_id uuid NOT NULL REFERENCES teaching_listings(id),
 request_key uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('HARASSMENT','FRAUD','CHILD_SAFETY','OTHER')),
 encrypted_report jsonb NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED','DISMISSED')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 public_notice text,
 decided_by uuid REFERENCES users(id),
 test_only boolean NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 UNIQUE(reporter_id,request_key),
 CHECK(reporter_id<>subject_id)
);
CREATE INDEX safety_case_queue ON safety_cases(created_at,id);
CREATE INDEX safety_case_reporter ON safety_cases(reporter_id,id);
CREATE TABLE safety_restrictions (
 id uuid PRIMARY KEY,
 case_id uuid NOT NULL REFERENCES safety_cases(id),
 target_type text NOT NULL CHECK(target_type IN ('ACCOUNT','LISTING','CONNECTION')),
 target_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL,
 created_at timestamptz NOT NULL,
 lifted_at timestamptz,
 lifted_by uuid REFERENCES users(id),
 lift_reason text,
 CHECK((lifted_at IS NULL AND lifted_by IS NULL AND lift_reason IS NULL) OR (lifted_at IS NOT NULL AND lifted_by IS NOT NULL AND lift_reason IS NOT NULL))
);
CREATE UNIQUE INDEX safety_case_active_target ON safety_restrictions(case_id,target_type,target_id) WHERE lifted_at IS NULL;
CREATE INDEX safety_active_target ON safety_restrictions(target_type,target_id) WHERE lifted_at IS NULL;
CREATE TRIGGER chat_safety_restriction_changed AFTER INSERT OR UPDATE OR DELETE ON safety_restrictions FOR EACH STATEMENT EXECUTE FUNCTION notify_chat_authority_change();
CREATE TABLE safety_appeals (
 id uuid PRIMARY KEY,
 case_id uuid NOT NULL REFERENCES safety_cases(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 request_key uuid NOT NULL,
 encrypted_description jsonb NOT NULL,
 status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(status='PENDING_REVIEW'),
 created_at timestamptz NOT NULL,
 UNIQUE(case_id,actor_id),
 UNIQUE(actor_id,request_key)
);
