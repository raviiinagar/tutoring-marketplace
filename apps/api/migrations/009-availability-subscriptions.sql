CREATE TABLE availability_subscriptions (
  id uuid PRIMARY KEY,
  email_hash char(64) NOT NULL,
  selection_key char(64) NOT NULL,
  selection jsonb NOT NULL,
  encrypted_contact jsonb,
  consent_version text NOT NULL,
  purpose text NOT NULL DEFAULT 'TUTOR_AVAILABILITY' CHECK(purpose='TUTOR_AVAILABILITY'),
  generation integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','MATCH_FOUND','WITHDRAWN','EXPIRED')),
  verification_hash char(64),
  verification_expires_at timestamptz,
  unsubscribe_hash char(64),
  verified_at timestamptz,
  expires_at timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email_hash,selection_key)
);
CREATE INDEX availability_match_pending ON availability_subscriptions(next_check_at,id) WHERE status='ACTIVE';
CREATE TABLE availability_notification_intents (
  id uuid PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES availability_subscriptions(id),
  generation integer NOT NULL,
  listing_id uuid NOT NULL REFERENCES teaching_listings(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CANCELLED')),
  matched_at timestamptz NOT NULL,
  UNIQUE(subscription_id,generation)
);
ALTER TABLE mail_outbox ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE mail_outbox ADD COLUMN availability_subscription_id uuid REFERENCES availability_subscriptions(id);
ALTER TABLE mail_outbox ADD CONSTRAINT mail_recipient_owner CHECK(num_nonnulls(user_id,availability_subscription_id)=1);
