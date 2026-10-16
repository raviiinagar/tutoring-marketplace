CREATE TABLE notification_templates (
 template text NOT NULL, version text NOT NULL, category text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('EMAIL','SMS')), mandatory boolean NOT NULL,
 subject text NOT NULL, body text NOT NULL, PRIMARY KEY(template,version)
);
INSERT INTO notification_templates VALUES
 ('REQUEST_RECEIVED','service-v1','ENQUIRY','EMAIL',false,'A new Tutor enquiry','An enquiry is ready for your response. Sign in to review its current status and deadline.\n\n[[url]]'),
 ('REQUEST_SENT','service-v1','ENQUIRY','EMAIL',false,'Your enquiry is recorded','Your enquiry was recorded. It is not an accepted lesson. Sign in to review its response deadline.\n\n[[url]]'),
 ('REQUEST_DECISION','service-v1','ENQUIRY','EMAIL',false,'Your enquiry has an update','A Tutor response has been recorded. Sign in to view the current result.\n\n[[url]]'),
 ('RESPONSE_DUE','service-v1','ENQUIRY','EMAIL',false,'Enquiry response deadline approaching','An enquiry is approaching its recorded response deadline. Sign in to review it.\n\n[[url]]'),
 ('REQUEST_EXPIRED','service-v1','ENQUIRY','EMAIL',false,'Enquiry response window ended','An enquiry response window has ended. You can review matching alternatives; selecting an alternative never automatically charges you or shares contact details.\n\n[[url]]'),
 ('CHAT_MESSAGE','service-v1','CHAT','EMAIL',false,'A new private message','A new message is available in your secure conversation. Message content stays inside the platform.\n\n[[url]]'),
 ('PAYMENT_CAPTURED','service-v1','SERVICE','EMAIL',true,'Your platform payment is recorded','A verified platform payment has been recorded. Sign in to review payment and Access Pass status. This does not confirm a booked lesson.\n\n[[url]]'),
 ('PAYMENT_REVIEW','service-v1','SERVICE','EMAIL',true,'Your platform payment needs review','A payment has been recorded for financial review. Sign in to view its status.\n\n[[url]]'),
 ('ACCESS_ACTIVATED','service-v1','SERVICE','EMAIL',true,'Your Access Pass has started','Your Access Pass activation has been recorded. Sign in to view the fixed access period. Tuition remains payable directly to Tutors.\n\n[[url]]'),
 ('PURCHASE_CANCELLED','service-v1','SERVICE','EMAIL',true,'Your platform purchase was cancelled','A purchase cancellation has been recorded. Captured payment and refund progress are tracked separately.\n\n[[url]]'),
 ('REFUND_REQUESTED','service-v1','SERVICE','EMAIL',true,'Your refund is queued','A platform-fee refund is queued. This is not confirmation of provider processing or bank credit. Review current progress securely.\n\n[[url]]'),
 ('REFUND_UPDATE','service-v1','SERVICE','EMAIL',true,'Your refund status changed','Your platform-fee refund status has changed. Provider processing and bank credit are separate stages. Sign in for the recorded result.\n\n[[url]]'),
 ('REFUND_CASE_DECIDED','service-v1','SERVICE','EMAIL',true,'Your refund review has an outcome','A Finance decision is available for your refund case. A decision is separate from confirmed provider refund processing.\n\n[[url]]'),
 ('AVAILABILITY_MATCH','service-v1','AVAILABILITY','EMAIL',false,'Matching Tutor availability','An approved online teaching offer matches your availability alert. Availability is checked again when you open it; evidence review does not guarantee teaching quality.\n\n[[url]]'),
 ('OPERATOR_REFUND_ALERT','service-v1','OPERATIONS','SMS',true,'Refund operation needs attention','A refund operation needs review.');
CREATE TRIGGER immutable_notification_templates BEFORE UPDATE OR DELETE ON notification_templates FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE notification_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id), enquiry_email boolean NOT NULL DEFAULT true,
 chat_email boolean NOT NULL DEFAULT true, availability_email boolean NOT NULL DEFAULT true,
 marketing_email boolean NOT NULL DEFAULT false, notice_version text NOT NULL,
 updated_at timestamptz NOT NULL
);
CREATE TABLE notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_key text NOT NULL,
 -- No recipient FK: a financial worker holds a purchase before inserting this
 -- outbox row; acquiring an upstream account FK lock here would invert order.
 recipient_id uuid, target_id uuid NOT NULL, audience text,
 availability_intent_id uuid, message_sequence bigint,
 template text NOT NULL, template_version text NOT NULL, category text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('EMAIL','SMS')), mandatory boolean NOT NULL, test_only boolean NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','FAILED','SUPPRESSED','CONFIG_REQUIRED','UNKNOWN')),
 available_at timestamptz NOT NULL, lease_token uuid, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0, last_error text, provider_reference text,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, sent_at timestamptz,
 UNIQUE(source_key,channel), FOREIGN KEY(template,template_version) REFERENCES notification_templates(template,version)
);
CREATE INDEX notification_work_due ON notification_outbox(available_at,id) WHERE status IN ('PENDING','PROCESSING');
CREATE INDEX notification_owner ON notification_outbox(recipient_id,created_at DESC,id);
CREATE TABLE notification_delivery_attempts (
 notification_id uuid NOT NULL REFERENCES notification_outbox(id), attempt integer NOT NULL,
 started_at timestamptz NOT NULL, finished_at timestamptz, outcome text, error_code text, provider_reference text,
 PRIMARY KEY(notification_id,attempt)
);
CREATE TABLE notification_sms_budget (
 notification_id uuid NOT NULL REFERENCES notification_outbox(id), attempt integer NOT NULL, day date NOT NULL,
 PRIMARY KEY(notification_id,attempt)
);
CREATE FUNCTION immutable_notification_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','available_at','lease_token','lease_until','attempts','last_error','provider_reference','updated_at','sent_at']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['status','available_at','lease_token','lease_until','attempts','last_error','provider_reference','updated_at','sent_at']) THEN RAISE EXCEPTION 'Notification source and template snapshot are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_notification_source BEFORE UPDATE ON notification_outbox FOR EACH ROW EXECUTE FUNCTION immutable_notification_source();
CREATE FUNCTION queue_notification(source text,recipient uuid,kind text,target uuid,audience_name text,is_test boolean,at_time timestamptz,intent uuid DEFAULT NULL,sequence_number bigint DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO notification_outbox(source_key,recipient_id,target_id,audience,availability_intent_id,message_sequence,template,template_version,category,channel,mandatory,test_only,available_at,created_at,updated_at)
 SELECT source,recipient,target,audience_name,intent,sequence_number,t.template,t.version,t.category,t.channel,t.mandatory,is_test,at_time,at_time,at_time
 FROM notification_templates t WHERE t.template=kind AND t.version='service-v1' ON CONFLICT(source_key,channel) DO NOTHING;
END $$;
CREATE FUNCTION notify_contact_request_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fixture boolean;
BEGIN
 fixture=NEW.coverage_snapshot->>'source'='FIXTURE' OR COALESCE((NEW.coverage_snapshot->>'test_only')::boolean,false);
 PERFORM queue_notification('request-received:'||NEW.id::text,NEW.tutor_id,'REQUEST_RECEIVED',NEW.id,'TUTOR',fixture,NEW.created_at);
 PERFORM queue_notification('request-sent:'||NEW.id::text,NEW.payer_id,'REQUEST_SENT',NEW.id,'PAYER',fixture,NEW.created_at);
 RETURN NEW;
END $$;
CREATE TRIGGER notify_contact_request_insert AFTER INSERT ON contact_requests FOR EACH ROW EXECUTE FUNCTION notify_contact_request_insert();
CREATE FUNCTION notify_payment_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase purchase_cycles%ROWTYPE;
BEGIN
 SELECT * INTO purchase FROM purchase_cycles WHERE id=NEW.cycle_id;
 PERFORM queue_notification('capture:'||NEW.id::text,purchase.payer_id,CASE WHEN NEW.kind='CAPTURE' THEN 'PAYMENT_CAPTURED' ELSE 'PAYMENT_REVIEW' END,purchase.id,'PAYER',purchase.test_only,NEW.recorded_at);
 RETURN NEW;
END $$;
CREATE TRIGGER notify_payment_capture AFTER INSERT ON payment_journal FOR EACH ROW EXECUTE FUNCTION notify_payment_capture();
CREATE FUNCTION notify_access_activation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source='PAYMENT' AND NEW.status='ACTIVE' AND OLD.status IS DISTINCT FROM NEW.status THEN
  PERFORM queue_notification('access:'||NEW.id::text,NEW.payer_id,'ACCESS_ACTIVATED',NEW.cycle_id,'PAYER',NEW.test_only,NEW.starts_at);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_access_activation AFTER UPDATE OF status ON access_entitlements FOR EACH ROW EXECUTE FUNCTION notify_access_activation();
CREATE FUNCTION notify_purchase_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase purchase_cycles%ROWTYPE;
BEGIN
 SELECT * INTO purchase FROM purchase_cycles WHERE id=NEW.cycle_id;
 PERFORM queue_notification('purchase-cancelled:'||NEW.cycle_id::text,purchase.payer_id,'PURCHASE_CANCELLED',NEW.cycle_id,'PAYER',purchase.test_only,NEW.created_at);
 RETURN NEW;
END $$;
CREATE TRIGGER notify_purchase_cancellation AFTER INSERT ON purchase_cancellations FOR EACH ROW EXECUTE FUNCTION notify_purchase_cancellation();
CREATE FUNCTION notify_refund_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase purchase_cycles%ROWTYPE;
BEGIN
 SELECT * INTO purchase FROM purchase_cycles WHERE id=NEW.cycle_id;
 IF TG_OP='INSERT' THEN
  PERFORM queue_notification('refund-requested:'||NEW.id::text,purchase.payer_id,'REFUND_REQUESTED',NEW.id,'PAYER',purchase.test_only,NEW.created_at);
 ELSIF NEW.status IN ('UNKNOWN','PENDING','FAILED','REVIEW','PROCESSED') AND OLD.status IS DISTINCT FROM NEW.status THEN
  PERFORM queue_notification('refund-state:'||NEW.id::text||':'||NEW.status,purchase.payer_id,'REFUND_UPDATE',NEW.id,'PAYER',purchase.test_only,NEW.updated_at);
 END IF;
 IF NEW.status IN ('FAILED','REVIEW') OR (NEW.status='WAITING_RESERVE' AND NEW.last_error='INSUFFICIENT_RESERVE') THEN
  PERFORM queue_notification('refund-alert:'||NEW.id::text||':'||NEW.status||':'||COALESCE(NEW.last_error,''),NULL,'OPERATOR_REFUND_ALERT',NEW.id,'OPERATOR',purchase.test_only,NEW.updated_at);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_refund_operation AFTER INSERT OR UPDATE ON refund_operations FOR EACH ROW EXECUTE FUNCTION notify_refund_operation();
CREATE FUNCTION notify_refund_case_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase purchase_cycles%ROWTYPE;
BEGIN
 IF OLD.status='OPEN' AND NEW.status<>'OPEN' THEN
  SELECT * INTO purchase FROM purchase_cycles WHERE id=NEW.cycle_id;
  PERFORM queue_notification('refund-case-decision:'||NEW.id::text,NEW.payer_id,'REFUND_CASE_DECIDED',NEW.id,'PAYER',purchase.test_only,NEW.reviewed_at);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_refund_case_decision AFTER UPDATE OF status ON refund_cases FOR EACH ROW EXECUTE FUNCTION notify_refund_case_decision();
CREATE FUNCTION notify_request_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fixture boolean;
BEGIN
 IF NEW.status IN ('ACCEPTED','DECLINED') AND OLD.status IS DISTINCT FROM NEW.status THEN
  fixture=NEW.coverage_snapshot->>'source'='FIXTURE' OR COALESCE((NEW.coverage_snapshot->>'test_only')::boolean,false);
  PERFORM queue_notification('request-decision:'||NEW.id::text,NEW.payer_id,'REQUEST_DECISION',NEW.id,'PAYER',fixture,NEW.updated_at);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_request_decision AFTER UPDATE OF status ON contact_requests FOR EACH ROW EXECUTE FUNCTION notify_request_decision();
CREATE FUNCTION notify_chat_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE connection uuid; recipient uuid; fixture boolean;
BEGIN
 SELECT c.connection_id INTO connection FROM conversations c WHERE c.id=NEW.conversation_id;
 SELECT r.coverage_snapshot->>'source'='FIXTURE' OR COALESCE((r.coverage_snapshot->>'test_only')::boolean,false) INTO fixture FROM connections c JOIN contact_requests r ON r.id=c.request_id WHERE c.id=connection;
 FOR recipient IN SELECT p.user_id FROM connection_participants p WHERE p.connection_id=connection AND p.user_id<>NEW.sender_id LOOP
  PERFORM queue_notification('message:'||NEW.conversation_id::text||':'||NEW.sequence::text||':'||recipient::text,recipient,'CHAT_MESSAGE',connection,NULL,fixture,NEW.created_at,NULL,NEW.sequence);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_chat_message AFTER INSERT ON conversation_messages FOR EACH ROW EXECUTE FUNCTION notify_chat_message();
CREATE FUNCTION notify_request_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request contact_requests%ROWTYPE; fixture boolean;
BEGIN
 SELECT * INTO request FROM contact_requests WHERE id=NEW.request_id;
 fixture=request.coverage_snapshot->>'source'='FIXTURE' OR COALESCE((request.coverage_snapshot->>'test_only')::boolean,false);
 IF NEW.event_type='RESPONSE_DUE' THEN
  PERFORM queue_notification('response-due-tutor:'||request.id::text,request.tutor_id,'RESPONSE_DUE',request.id,'TUTOR',fixture,NEW.recorded_at);
  PERFORM queue_notification('response-due-payer:'||request.id::text,request.payer_id,'RESPONSE_DUE',request.id,'PAYER',fixture,NEW.recorded_at);
 ELSE
  PERFORM queue_notification('request-expired:'||request.id::text,request.payer_id,'REQUEST_EXPIRED',request.id,'PAYER',fixture,NEW.recorded_at);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_request_lifecycle AFTER INSERT ON contact_request_lifecycle_events FOR EACH ROW EXECUTE FUNCTION notify_request_lifecycle();
ALTER TABLE availability_subscriptions ADD COLUMN test_only boolean NOT NULL DEFAULT true;
ALTER TABLE availability_notification_intents ADD COLUMN delivered_at timestamptz;
