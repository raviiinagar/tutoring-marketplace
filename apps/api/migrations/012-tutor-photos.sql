CREATE TABLE tutor_photos (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES tutor_profiles(user_id),
  status text NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','REMOVED')),
  scan_status text NOT NULL CHECK(scan_status IN ('CLEAN','REJECTED','ERROR')),
  test_only boolean NOT NULL,
  encrypted_payload jsonb,
  byte_length integer NOT NULL DEFAULT 0 CHECK(byte_length BETWEEN 0 AND 524288),
  reviewed_by uuid REFERENCES users(id),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(encrypted_payload IS NULL OR (scan_status='CLEAN' AND status IN ('PENDING','APPROVED')))
);
CREATE UNIQUE INDEX tutor_photo_current ON tutor_photos(user_id) WHERE status IN ('PENDING','APPROVED');
CREATE INDEX tutor_photo_review_queue ON tutor_photos(status,created_at);
