CREATE INDEX contact_requests_due ON contact_requests(expires_at,id) WHERE status='PENDING';

-- Minimal durable events for the later transactional notification dispatcher.
-- No email, child details, message text, payment mutations or delivery claim.
CREATE TABLE contact_request_lifecycle_events (
  request_id uuid NOT NULL REFERENCES contact_requests(id),
  event_type text NOT NULL CHECK(event_type IN ('RESPONSE_DUE','EXPIRED')),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY(request_id,event_type)
);
