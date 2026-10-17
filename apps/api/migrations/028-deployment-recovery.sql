CREATE TABLE deployment_recoveries (
 id uuid PRIMARY KEY, archive_id uuid NOT NULL UNIQUE,
 source_snapshot_at timestamptz NOT NULL, release_id text NOT NULL,
 state text NOT NULL CHECK(state IN ('MONEY_REVIEW','RELEASED')),
 started_at timestamptz NOT NULL, privacy_reapplied_at timestamptz,
 released_at timestamptz, evidence_reference text,
 released_by uuid REFERENCES users(id), release_fingerprint char(64),
 release_correlation uuid, reconciliation_ids uuid[]
);
