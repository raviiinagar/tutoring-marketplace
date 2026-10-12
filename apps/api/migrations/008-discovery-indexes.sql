CREATE INDEX listing_discovery_subject_exam ON teaching_listings((payload->>'subject_id'),(payload->>'exam_id'),id)
  WHERE status='PUBLISHED' AND approved AND NOT safety_suspended;
CREATE INDEX listing_discovery_domain ON teaching_listings((payload->>'domain_id'),id)
  WHERE status='PUBLISHED' AND approved AND NOT safety_suspended;
CREATE INDEX listing_discovery_price ON teaching_listings((payload->>'rate_unit'),((payload->>'rate_paise')::integer),id)
  WHERE status='PUBLISHED' AND approved AND NOT safety_suspended;
CREATE INDEX listing_discovery_languages ON teaching_listings USING gin((payload->'language_ids'))
  WHERE status='PUBLISHED' AND approved AND NOT safety_suspended;
CREATE INDEX tutor_claim_public_eligibility ON tutor_claims(user_id,profile_revision,subject_id,kind,expires_at)
  WHERE status='APPROVED';
