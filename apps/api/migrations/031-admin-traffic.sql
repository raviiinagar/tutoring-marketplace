CREATE TABLE admin_traffic_daily (
 day date NOT NULL,test_only boolean NOT NULL,page_key text NOT NULL CHECK(page_key IN ('HOME','BROWSE','TUTOR','CATEGORY','SIGN_IN','SIGN_UP')),
 page_views integer NOT NULL DEFAULT 0 CHECK(page_views>=0),first_seen_at timestamptz NOT NULL,
 PRIMARY KEY(day,test_only,page_key)
);
CREATE TABLE admin_visit_daily (
 day date NOT NULL,test_only boolean NOT NULL,visits integer NOT NULL DEFAULT 0 CHECK(visits>=0),
 PRIMARY KEY(day,test_only)
);
CREATE TABLE admin_traffic_receipts (
 day date NOT NULL,test_only boolean NOT NULL,kind text NOT NULL CHECK(kind IN ('VISIT','VIEW')),
 receipt_hash char(64) NOT NULL,fingerprint char(64) NOT NULL,
 PRIMARY KEY(day,test_only,kind,receipt_hash)
);
CREATE INDEX admin_traffic_receipts_expiry ON admin_traffic_receipts(day);
CREATE INDEX admin_login_trends ON audit_events(created_at,user_id) WHERE event_type='SESSION_CREATED';
CREATE INDEX admin_account_login_history ON audit_events(user_id,created_at DESC) WHERE event_type='SESSION_CREATED';
