-- Beta feedback (ADR0016). Additive: no existing table, column or row changes.
CREATE TABLE feedback_items (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id),
 request_key uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('BUG','SUGGESTION','FEATURE_REQUEST','UI_UX')),
 -- Suggestions and feature requests are listed on the signed-in board without the author.
 public boolean NOT NULL,
 hidden boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','REVIEWING','IN_PROGRESS','RESOLVED')),
 priority text CHECK(priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 encrypted_body jsonb NOT NULL,
 screenshot_status text NOT NULL DEFAULT 'NONE' CHECK(screenshot_status IN ('NONE','CLEAN','REJECTED','REMOVED')),
 encrypted_screenshot jsonb,
 screenshot_bytes integer NOT NULL DEFAULT 0 CHECK(screenshot_bytes>=0),
 vote_count integer NOT NULL DEFAULT 0 CHECK(vote_count>=0),
 test_only boolean NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 UNIQUE(owner_id,request_key),
 CHECK((screenshot_status='CLEAN')=(encrypted_screenshot IS NOT NULL))
);
CREATE INDEX feedback_owner_list ON feedback_items(owner_id,created_at DESC,id);
CREATE INDEX feedback_staff_queue ON feedback_items(status,created_at,id);
CREATE INDEX feedback_board ON feedback_items(vote_count DESC,created_at DESC,id) WHERE public AND NOT hidden;
CREATE TABLE feedback_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id uuid NOT NULL UNIQUE,
 item_id uuid NOT NULL REFERENCES feedback_items(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 visibility text NOT NULL CHECK(visibility IN ('USER','INTERNAL')),
 outcome text NOT NULL,
 encrypted_payload jsonb NOT NULL,
 created_at timestamptz NOT NULL
);
CREATE INDEX feedback_event_history ON feedback_events(item_id,sequence);
CREATE TABLE feedback_votes (
 item_id uuid NOT NULL REFERENCES feedback_items(id),
 user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 PRIMARY KEY(item_id,user_id)
);
CREATE INDEX feedback_votes_user ON feedback_votes(user_id);
