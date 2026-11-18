-- ADR0021: simple account and Tutor journey.

-- New accounts choose Learn, Teach or Both on their first visit to My Account.
-- Existing accounts already have their roles, so they are marked as having chosen.
ALTER TABLE users ADD COLUMN roles_chosen_at timestamptz;
UPDATE users SET roles_chosen_at = created_at WHERE roles_chosen_at IS NULL;

-- One profile photo per account, managed in My Account by Learners and Tutors alike.
-- Photos used to require a Tutor profile; they now belong to the account. A photo is
-- still shown publicly only on a published Tutor profile and its ads.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'tutor_photos'::regclass AND con.contype = 'f'
      AND con.confrelid = 'tutor_profiles'::regclass
  LOOP
    EXECUTE format('ALTER TABLE tutor_photos DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE tutor_photos ADD CONSTRAINT tutor_photos_account_fkey FOREIGN KEY (user_id) REFERENCES users(id);

-- With staff photo review off, signed-in visitors can report an unsuitable public photo.
-- One report per account per photo; staff see the count in Portrait reviews.
CREATE TABLE photo_reports (
  photo_id uuid NOT NULL REFERENCES tutor_photos(id),
  reporter_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (reason IN ('NOT_A_PORTRAIT','NOT_THE_TUTOR','INAPPROPRIATE','OTHER')),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (photo_id, reporter_id)
);
CREATE INDEX photo_reports_photo ON photo_reports(photo_id);
