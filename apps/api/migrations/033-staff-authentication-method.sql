ALTER TABLE staff_sessions ADD COLUMN authentication_method text NOT NULL DEFAULT 'MFA'
  CHECK (authentication_method IN ('MFA','TEST_PASSWORD'));
