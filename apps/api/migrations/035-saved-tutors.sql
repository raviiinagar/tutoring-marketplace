CREATE TABLE saved_tutors (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES tutor_profiles(public_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, profile_id)
);
CREATE INDEX saved_tutors_profile_id ON saved_tutors(profile_id);
