-- Additive reputation records. No existing identity, profile, payment or review is rewritten.
CREATE TABLE tutor_recommendations (
  id uuid PRIMARY KEY,
  tutor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship IN ('FORMER_STUDENT','COLLEAGUE','FAMILY','OTHER')),
  encrypted_text jsonb NOT NULL,
  published_text text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PUBLISHED','REJECTED','WITHDRAWN')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  review_reason text,
  reviewed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (tutor_id <> author_id),
  CHECK ((status='PUBLISHED') = (published_text IS NOT NULL)),
  UNIQUE (tutor_id,author_id)
);
CREATE INDEX tutor_recommendations_queue ON tutor_recommendations(status,created_at,id);
CREATE TABLE tutor_reputation_documents (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES tutor_evidence(id) ON DELETE CASCADE,
  profile_revision integer NOT NULL,
  kind text NOT NULL CHECK (kind='DIPLOMA'),
  created_at timestamptz NOT NULL
);
