CREATE TABLE teaching_listings (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES tutor_profiles(user_id),
  payload jsonb NOT NULL,
  profile_revision integer NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEW','CHANGES_REQUESTED','PUBLISHED','PAUSED')),
  approved boolean NOT NULL DEFAULT false,
  safety_suspended boolean NOT NULL DEFAULT false,
  review_reason text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  safety_reason text,
  safety_actor uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teaching_listings_owner ON teaching_listings(user_id);
CREATE TABLE listing_decisions (
  id uuid PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES teaching_listings(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  revision integer NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
