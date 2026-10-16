CREATE TABLE connection_reviews (
 id uuid PRIMARY KEY, connection_id uuid NOT NULL UNIQUE REFERENCES connections(id),
 author_id uuid NOT NULL REFERENCES users(id), tutor_id uuid NOT NULL REFERENCES users(id),
 request_key uuid NOT NULL, rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 encrypted_text jsonb NOT NULL, published_text text, interaction_attested_at timestamptz NOT NULL,
 policy_version text NOT NULL, test_only boolean NOT NULL,
 status text NOT NULL CHECK(status IN ('PENDING','PUBLISHED','REJECTED','REMOVED','WITHDRAWN')),
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 CHECK(author_id<>tutor_id), UNIQUE(author_id,tutor_id), UNIQUE(author_id,request_key),
 CHECK((status='PUBLISHED')=(published_text IS NOT NULL))
);
CREATE INDEX review_public_tutor ON connection_reviews(tutor_id,status,id);
CREATE INDEX review_moderation_queue ON connection_reviews(status,created_at,id);
CREATE TABLE review_decisions (
 id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES connection_reviews(id),
 actor_id uuid NOT NULL REFERENCES users(id), revision integer NOT NULL,
 outcome text NOT NULL, policy_code text NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL, UNIQUE(review_id,revision)
);
CREATE TRIGGER immutable_review_decisions BEFORE UPDATE OR DELETE ON review_decisions FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
CREATE TABLE review_appeals (
 id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES connection_reviews(id),
 actor_id uuid NOT NULL REFERENCES users(id), request_key uuid NOT NULL,
 review_revision integer NOT NULL, encrypted_description jsonb NOT NULL,
 status text NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL,
 UNIQUE(actor_id,request_key), UNIQUE(review_id,actor_id,review_revision)
);
-- Live projection: status/consent/safety changes cannot leave stale stored totals.
-- A participant block does not erase feedback or manipulate the public rating.
CREATE VIEW review_public_candidates AS
 SELECT v.id,v.tutor_id,v.rating,v.published_text,v.created_at,v.test_only,p.kind AS learner_kind,
 g.policy_id,g.notice_version,g.consent_version
 FROM connection_reviews v
 JOIN connections c ON c.id=v.connection_id AND c.status='ACTIVE' AND NOT c.safety_suspended
 JOIN contact_requests r ON r.id=c.request_id AND r.payer_id=v.author_id AND r.tutor_id=v.tutor_id
 JOIN connection_access_grants a ON a.connection_id=c.id AND a.revoked_at IS NULL AND a.entitlement_id=r.entitlement_id AND a.source=r.coverage_snapshot->>'source'
 JOIN users u ON u.id=v.author_id AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL AND 'LEARNER'=ANY(u.roles)
 JOIN users t ON t.id=v.tutor_id AND t.status='ACTIVE' AND t.email_verified_at IS NOT NULL AND 'TUTOR'=ANY(t.roles)
 JOIN learner_profiles p ON p.id=r.learner_id AND p.owner_id=v.author_id AND p.status='ACTIVE'
 JOIN teaching_listings l ON l.id=r.listing_id AND NOT l.safety_suspended
 LEFT JOIN guardian_verifications g ON g.id=p.guardian_verification_id AND g.user_id=p.owner_id
 WHERE v.status='PUBLISHED'
 AND r.coverage_snapshot->>'source' IN ('FIXTURE','PAYMENT')
 AND v.test_only=(r.coverage_snapshot->>'source'='FIXTURE' OR COALESCE((r.coverage_snapshot->>'test_only')::boolean,false))
 AND (p.kind='ADULT' OR (g.status='APPROVED' AND EXISTS(SELECT 1 FROM learner_consents s WHERE s.profile_id=p.id AND s.owner_id=p.owner_id AND s.withdrawn_at IS NULL AND s.notice_version=g.notice_version AND s.consent_version=g.consent_version)))
 AND NOT EXISTS(SELECT 1 FROM safety_restrictions s WHERE s.lifted_at IS NULL AND ((s.target_type='ACCOUNT' AND s.target_id IN (v.author_id,v.tutor_id)) OR (s.target_type='CONNECTION' AND s.target_id=c.id) OR (s.target_type='LISTING' AND s.target_id=l.id)));
