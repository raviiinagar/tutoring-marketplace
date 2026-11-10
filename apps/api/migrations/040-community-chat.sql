-- Beta community chat (ADR0017). Additive: no existing table, column or row changes.
CREATE TABLE community_members (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 nickname text NOT NULL CHECK(char_length(nickname) BETWEEN 2 AND 30),
 adult_confirmed_at timestamptz NOT NULL,
 rules_accepted_at timestamptz NOT NULL,
 rules_version text NOT NULL,
 left_at timestamptz,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL
);
CREATE TABLE community_channels (
 id uuid PRIMARY KEY,
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 40),
 name text NOT NULL CHECK(char_length(name) BETWEEN 2 AND 40),
 description text NOT NULL CHECK(char_length(description) <= 200),
 staff_only_posting boolean NOT NULL DEFAULT false,
 archived boolean NOT NULL DEFAULT false,
 position integer NOT NULL DEFAULT 100,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL
);
INSERT INTO community_channels(id,slug,name,description,staff_only_posting,position,created_at,updated_at) VALUES
 ('3a7c9a3e-6d1b-4c55-9a0e-0f5d2b1c0001','announcements','Announcements','News and release notes from the team.',true,10,now(),now()),
 ('3a7c9a3e-6d1b-4c55-9a0e-0f5d2b1c0002','general','General','Chat about the platform with other members and the team.',false,20,now(),now()),
 ('3a7c9a3e-6d1b-4c55-9a0e-0f5d2b1c0003','bug-reports','Bug reports','Spotted something broken? Discuss it here.',false,30,now(),now()),
 ('3a7c9a3e-6d1b-4c55-9a0e-0f5d2b1c0004','feature-ideas','Feature ideas','Share and discuss ideas for new features.',false,40,now(),now()),
 ('3a7c9a3e-6d1b-4c55-9a0e-0f5d2b1c0005','help-and-support','Help & support','Ask how things work. Account or payment problems belong in Support.',false,50,now(),now());
-- Every visible change to a message (new, deleted, pinned, reacted) takes a new change sequence,
-- so clients sync with a single "after" cursor.
CREATE SEQUENCE community_change_seq;
CREATE TABLE community_messages (
 id uuid PRIMARY KEY,
 -- Posting order; timestamps can tie.
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 channel_id uuid NOT NULL REFERENCES community_channels(id),
 author_id uuid NOT NULL REFERENCES users(id),
 request_key uuid NOT NULL,
 reply_to uuid REFERENCES community_messages(id),
 encrypted_body jsonb NOT NULL,
 status text NOT NULL DEFAULT 'VISIBLE' CHECK(status IN ('VISIBLE','DELETED_BY_AUTHOR','REMOVED_BY_STAFF')),
 pinned boolean NOT NULL DEFAULT false,
 change_seq bigint NOT NULL DEFAULT nextval('community_change_seq'),
 test_only boolean NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 UNIQUE(author_id,request_key)
);
CREATE INDEX community_channel_history ON community_messages(channel_id,sequence DESC);
CREATE INDEX community_channel_changes ON community_messages(channel_id,change_seq);
CREATE INDEX community_author ON community_messages(author_id);
CREATE TABLE community_reactions (
 message_id uuid NOT NULL REFERENCES community_messages(id),
 user_id uuid NOT NULL REFERENCES users(id),
 emoji text NOT NULL CHECK(emoji IN ('THUMBS_UP','HEART','LAUGH','CELEBRATE','THINKING','EYES')),
 created_at timestamptz NOT NULL,
 PRIMARY KEY(message_id,user_id,emoji)
);
CREATE INDEX community_reactions_user ON community_reactions(user_id);
CREATE TABLE community_reports (
 id uuid PRIMARY KEY,
 message_id uuid NOT NULL REFERENCES community_messages(id),
 reporter_id uuid NOT NULL REFERENCES users(id),
 category text NOT NULL CHECK(category IN ('SPAM','HARASSMENT','CONTACT_DETAILS','INAPPROPRIATE','OTHER')),
 encrypted_note jsonb NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACTIONED','DISMISSED')),
 resolved_by uuid REFERENCES users(id),
 resolved_at timestamptz,
 created_at timestamptz NOT NULL,
 UNIQUE(message_id,reporter_id)
);
CREATE INDEX community_open_reports ON community_reports(status,created_at);
CREATE TABLE community_mutes (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 muted_until timestamptz NOT NULL,
 reason text NOT NULL,
 muted_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL
);
