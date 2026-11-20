-- Owner decision, 20 Nov 2026 (ADR0022): a Tutor whose subject is not listed chooses "Other"
-- and types the subject on the ad, which publishes immediately. One catalogue term stands for
-- every typed subject so the existing domain/level/catalogue checks keep working; the typed
-- name lives on the ad (payload.custom_subject). The public catalogue does not list this term,
-- and staff can deactivate it to switch the option off.
INSERT INTO catalogue_terms(id,kind,label,aliases,domain_ids,active)
SELECT 'subject-other','SUBJECT','Other subject','{}',array_agg(id ORDER BY position),true
FROM (SELECT id,position FROM learning_domains ORDER BY position LIMIT 8) AS domains
ON CONFLICT (id) DO NOTHING;
INSERT INTO catalogue_names(kind,name,term_id)
SELECT 'SUBJECT','othersubject','subject-other'
WHERE EXISTS (SELECT 1 FROM catalogue_terms WHERE id='subject-other')
  AND NOT EXISTS (SELECT 1 FROM catalogue_names WHERE kind='SUBJECT' AND name='othersubject');
