CREATE TABLE tutor_presence (
  user_id uuid PRIMARY KEY REFERENCES tutor_profiles(user_id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  location jsonb CHECK (location IS NULL OR jsonb_typeof(location)='object'),
  teaching_modes text[] NOT NULL DEFAULT ARRAY['ONLINE'] CHECK (cardinality(teaching_modes) BETWEEN 1 AND 2 AND teaching_modes <@ ARRAY['ONLINE','IN_PERSON']::text[]),
  accepting_students boolean NOT NULL DEFAULT true,
  weekly_slots jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(weekly_slots)='array'),
  timezone text NOT NULL DEFAULT 'Asia/Kolkata' CHECK (timezone='Asia/Kolkata'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tutor_presence_city ON tutor_presence(lower(location->>'city'));
