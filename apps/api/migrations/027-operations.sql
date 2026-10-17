CREATE TABLE operations_checkout (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 paused boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO operations_checkout(singleton) VALUES(true);
CREATE TABLE operations_commands (
 request_key uuid PRIMARY KEY, actor_id uuid NOT NULL, fingerprint text NOT NULL,
 correlation_id uuid NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE operations_alerts (
 id uuid PRIMARY KEY, code text NOT NULL, scope text NOT NULL CHECK(scope IN ('SUPPORT','FINANCE')),
 status text NOT NULL CHECK(status IN ('OPEN','RESOLVED')), count integer NOT NULL,
 opened_at timestamptz NOT NULL,last_seen_at timestamptz NOT NULL,resolved_at timestamptz
);
CREATE UNIQUE INDEX operations_open_alert ON operations_alerts(code,scope) WHERE status='OPEN';
CREATE TABLE operations_worker_health (
 name text PRIMARY KEY,last_seen_at timestamptz NOT NULL,last_success_at timestamptz,
 consecutive_errors integer NOT NULL DEFAULT 0
);
CREATE TABLE operations_observations (
 request_key uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('WEBHOOK_DELIVERY','BACKUP','SECURITY')),
 healthy boolean NOT NULL,observed_at timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 evidence_reference text NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL
);
CREATE INDEX operations_latest_observation ON operations_observations(kind,observed_at DESC);
CREATE TABLE operations_replays (
 request_key uuid PRIMARY KEY,actor_id uuid NOT NULL,kind text NOT NULL,target_id text NOT NULL,
 fingerprint text NOT NULL,correlation_id uuid NOT NULL,status text NOT NULL CHECK(status IN ('REQUESTED','SCHEDULED','FAILED')),
 lease_token uuid,lease_until timestamptz,result jsonb,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL
);
CREATE TABLE operations_monitor_checkpoint(singleton boolean PRIMARY KEY CHECK(singleton),checked_at timestamptz);
INSERT INTO operations_monitor_checkpoint VALUES(true,NULL);
INSERT INTO notification_templates VALUES
 ('OPERATOR_SYSTEM_EMAIL','service-v1','OPERATIONS','EMAIL',true,'Critical platform operation needs attention','A critical platform condition needs inspection. Alert reference: [[reference]]. Automated routing runs outside human support hours. Review current evidence in the private console.\n\n[[url]]'),
 ('OPERATOR_SYSTEM_SMS','service-v1','OPERATIONS','SMS',true,'Critical platform operation needs attention','A critical platform condition needs inspection.');
