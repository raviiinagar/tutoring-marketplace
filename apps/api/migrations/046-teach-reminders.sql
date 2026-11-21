-- Owner decision, 21 Nov 2026 (ADR0023): an account that chooses to teach and has no published
-- ad gets at most two reminders, one day and seven days later, offering both ways to create the
-- ad (our team or the Tutor). Accounts that only learn never get them. Delivery re-checks the
-- account, its Tutor role, its ads and this opt-out, so nothing is sent once an ad is online.
-- Accounts that already teach are not emailed retrospectively.
ALTER TABLE notification_preferences ADD COLUMN teaching_reminder_email boolean NOT NULL DEFAULT true;

INSERT INTO notification_templates VALUES
 ('TEACH_REMINDER_1','service-v1','TEACHING','EMAIL',false,'Your Tutor ad is one step away','You chose to teach on Tutor Marketplace, but your ad isn''t online yet, so learners can''t find you.\n\nTwo free ways to get your ad online:\n\n[[choices]]\n\nPublishing an ad is free. Identity verification is optional.'),
 ('TEACH_REMINDER_2','service-v1','TEACHING','EMAIL',false,'Learners can''t find you yet','Your teaching ad still isn''t online. It takes one short form, or our team can create it for you.\n\nPick whichever is easier:\n\n[[choices]]\n\nPublishing an ad is free. Identity verification is optional.');

CREATE FUNCTION notify_teaching_chosen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF 'TUTOR'=ANY(NEW.roles) AND NOT ('TUTOR'=ANY(COALESCE(OLD.roles,'{}'::text[]))) THEN
  INSERT INTO notification_outbox(source_key,recipient_id,target_id,audience,template,template_version,category,channel,mandatory,test_only,available_at,created_at,updated_at)
  SELECT 'teach-reminder-'||d.n||':'||NEW.id::text,NEW.id,NEW.id,'TUTOR',t.template,t.version,t.category,t.channel,t.mandatory,false,
         now()+d.delay,now(),now()
  FROM (SELECT 1 AS n,interval '1 day' AS delay,'TEACH_REMINDER_1' AS name UNION ALL SELECT 2,interval '7 days','TEACH_REMINDER_2') AS d
  JOIN notification_templates t ON t.template=d.name AND t.version='service-v1'
  ON CONFLICT(source_key,channel) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_teaching_chosen AFTER UPDATE OF roles ON users FOR EACH ROW EXECUTE FUNCTION notify_teaching_chosen();
