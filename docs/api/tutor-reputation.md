# Tutor reputation and evidence boundaries

This additive feature does not change identity approval, public profile eligibility, offer moderation, Tutor Pro, learner access or money records. Reputation is recomputed from current records; a pass never buys a badge. Private evidence is never exposed through reputation endpoints.

## Current policy

- `NEW`: currently eligible public Tutor profile under this project's existing identity and safety rules.
- `EXPERIENCED` (India help terminology): eligible public profile plus two published network recommendations from distinct current verified accounts, an approved clean portrait, at least40 words about the Tutor, and saved current-profile teaching text with a title of at least12 words and class description of at least40 words. These quality checks come from the inspected live `/dashboard.html/status` checklist. That live screen calls the target level **Recommended Teacher**; equivalence with help's Experienced label remains unverified and is disclosed in `policy_conflicts`. The implementation conservatively requires both the documented recommendation threshold and observed quality checklist. Recommendations are moderated endorsements, not star reviews, verified lessons or proof of teaching quality.
- `SUPER_TEACHER`: cannot currently be awarded. [India help](https://www.superprof.co.in/help/teachers/become-a-superprof/superprof-charter/50/) specifies four recommendations, three positive reviews, diploma and quick responses; [India terms](https://www.superprof.co.in/gtu.html) specify one review. The definition of positive, response aggregation and observation period were not verified.
- `AMBASSADOR`: cannot currently be awarded. The help adds six student reviews, official ID and an interview questionnaire to all earlier requirements. The questionnaire/approval method was not accessible. No substitute interview is invented.

Ratings of four or five are reported literally. `positive_student_reviews` remains `null`, rather than defining an unverified award threshold. The all-history mean response time is a descriptive fact, not a badge eligibility decision. A Tutor-labelled diploma link records an upload, not verified qualification. No higher badge can be granted by uploading or self-attesting.

The level checklist uses whitespace-separated word counts. These stricter word minima apply only to this progression and **do not change basic profile validation or public visibility**. A shorter identity-approved introduction remains public with New status. Saved current-profile draft, review, published or paused offer text can satisfy the checklist; staff-restricted offers cannot. Pausing an offer or ordinary Tutor Pro expiry alone does not remove text evidence. Existing offer-creation access rules remain separate; a pass never awards a level. Removing a portrait, shortening qualifying text or withdrawing a recommendation can remove eligibility. No two-times visibility boost or other ranking claim is implemented. Policy version is `tutor-reputation-v2`; no persisted award or data migration is needed for this correction.

## Endpoints

| Endpoint | Access and behavior |
| --- | --- |
| `GET /v1/me/tutor/progression` | Verified Tutor session; current level, exact counts, separate criterion states, requirements, sources and policy conflicts. |
| `GET /v1/tutor-profiles/:publicId/progression` | Currently public eligible profile only; badge, label, exact published recommendation count, meaning, and at most20 `published_recommendations` entries `{id,author_display_name,relationship,text}`. Staff-published text only. No private account IDs, emails, documents or response records. |
| `GET /v1/me/tutor/recommendations` | Tutor-owned recommendation statuses/revisions and reviewer feedback. |
| `POST /v1/tutors/:publicId/recommendations` | Verified non-self author, current public profile, block/safety checks. Body `{relationship,text,interaction_attested:true}`; relation is `FORMER_STUDENT`, `COLLEAGUE`, `FAMILY` or `OTHER`; text is 40–1500 characters with no links/contact details. Stores encrypted pending content. One per author/Tutor, at most five submissions per author/day. |
| `GET /v1/me/recommendations` | Authenticated author's own content/status; `tutor_public_id` links the public profile without leaking private account IDs. |
| `DELETE /v1/me/recommendations/:id` | Author-only withdrawal, JSON body `{}`. Removes public contribution to progress immediately. |
| `POST /v1/me/tutor/progression/diploma` | Tutor-owned, clean scanned evidence only; body `{evidence_id}`. Current profile revision bound. Existing upload scanning/type/size/access rules still apply. |
| `GET /v1/staff/tutor-recommendations?reason=...` | Elevated TRUST permission; audited 10–240-character access reason; pending and prior cases (bounded100). |
| `POST /v1/staff/tutor-recommendations/:id/decisions` | Elevated TRUST; no self/subject review; `{revision,outcome,reason}`, outcome `PUBLISH`, `REJECT` or `REMOVE`. Stale revisions fail409. Withdrawn content cannot be republished. |

Only currently published recommendations from active, verified, unrestricted authors count; bilateral blocks with the Tutor also exclude the contribution. The public sample uses exactly the same filter as the unpaginated count. Withdrawal, removal, account disable/safety, revoked identity, inactive subject or unavailable profile removes the badge or contribution. No historic grants are backfilled. Migration037 only adds tables; it rewrites no existing profile, review or payment. Privacy export includes authored contributions and owned diploma links; account erasure deletes related new records, with conditional table checks for older recovery archives.

## Validation

`apps/api/test/tutor-reputation.test.ts` uses isolated PostgreSQL and real HTTP routes for pending-to-published progression, self/unauthenticated rejection, private encrypted storage, moderation authorization, self-review denial, stale revisions, author withdrawal, profile revocation, public projection, owned-clean diploma evidence and permanently gated unverified upper tiers. Fixtures are explicitly fictional; these checks do not create live accounts or award live badges.
