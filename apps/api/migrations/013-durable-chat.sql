CREATE TABLE conversation_messages (
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sequence bigint NOT NULL CHECK(sequence>0 AND sequence<=9007199254740991),
  sender_id uuid NOT NULL REFERENCES users(id),
  client_message_id uuid NOT NULL,
  encrypted_text jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(conversation_id,sequence),
  UNIQUE(conversation_id,sender_id,client_message_id)
);
ALTER TABLE conversations ADD CONSTRAINT conversation_safe_sequence CHECK(last_sequence<=9007199254740991);
CREATE TABLE conversation_read_positions (
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  last_read_sequence bigint NOT NULL CHECK(last_read_sequence>=0 AND last_read_sequence<=9007199254740991),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(conversation_id,user_id)
);

-- No message text, session identifiers or child data crosses the notification bus.
CREATE FUNCTION notify_chat_authority_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('chat_authority_changed','');
  RETURN NULL;
END;
$$;
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['users','sessions','tutor_profiles','tutor_claims','tutor_evidence','learner_profiles','guardian_verifications','learner_consents','teaching_listings','account_blocks','connections','connection_participants','connection_access_grants']
  LOOP
    EXECUTE format('CREATE TRIGGER chat_authority_changed AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION notify_chat_authority_change()',target);
  END LOOP;
END;
$$;
