# 07: Publish approved teaching offers and manage availability

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 05 — Browse and administer the eight-domain catalogue; 06 — Onboard an adult Tutor and review private evidence

**What to build:** A reviewed Tutor creates structured teaching offers, receives staff approval and can pause or update their available Listings.

## Acceptance criteria

- [x] Offers bind valid Subject, Learner Level, Curriculum and optional Exam Track combinations with rates, units, languages and trial terms.
- [x] Draft, review, changes-requested, published, paused and safety-suspended states are enforced through API and UI.
- [x] Sensitive claim/evidence changes return to review; a Tutor cannot remove a staff safety suspension.
- [x] Public eligibility requires approved claims, active account and available Listing.
- [x] Tests cover ownership, invalid combinations, edit/review transitions and staff-restricted resumption.

## Verification evidence

Implemented on 12 October 2026:

- Migration 007 adds Tutor-owned teaching Listings and append-only staff decision history. Each strict offer binds one exact domain/Subject/level/Curriculum/Exam combination, one to three Teaching Languages, online mode, integer-paise INR tuition rates, hourly/per-lesson units and explicit no/free/paid trial terms. Catalogue membership/type/activation checks prevent unrelated options; school requires Curriculum, entrance requires Exam Track, and seeded JEE/NEET Subject and ICSE/ISC class rules are enforced. Custom combinations still need exact staff review; comprehensive syllabus validation is not claimed.
- Creation/submission/publication/resume require current approved identity and matching Subject evidence, active verified Tutor, current profile revision and active taxonomy. Public `GET /v1/listings/:id` and the locked `requireAvailable` seam recheck eligibility, never just stored status. Responses whitelist offer terms and an evidence-review disclaimer; no account contact, private evidence/birth date, reviewer identity or safety reason is public.
- `/tutor/listings` supports create/edit drafts, submission, exact terms/status/reasons, pause/resume and refresh. `/staff/listings` supports Trust/MFA case inspection, approval/publication, corrections and safety suspension/lift. Navigation is integrated with Tutor onboarding and the existing staff console. Search/public Tutor detail UI remains task 08.
- Every content edit clears approval and returns to draft. Profile changes make previously submitted/published/paused Listings effectively changes-requested and unavailable until a current reviewed profile and revised offer are resubmitted. Expired/revoked Subject/identity evidence, removed role, disabled account and inactive terms block availability. Optimistic revisions reject stale edits, decisions and actions; owner/profile/Listing locking serializes edit against approval.
- Safety suspension is independent of owner-edited content and remains enforced through edits/submission/resume. Only Trust/MFA staff can lift it, with no self-review/lifting one's own restrictions. Suspending a published Listing pauses it; lifting does not auto-publish. An unchanged approved paused offer requires owner resume; edited content needs another review. Inspections, decisions and owner transitions record actor/target/reason/time without evidence bytes or credentials.
- `npm test`: all 48 PostgreSQL/API tests and 9 UI unit tests passed. Seven new Listing tests cover strict taxonomy/commercial/contact fields, current Subject approval, corrections/edit/publication/privacy, pause/resume, foreign ownership, staff/MFA/self-review boundaries, suspension persistence/no automatic publication, evidence/profile/account/catalogue eligibility changes, concurrent edit/approval and representative publication in all eight Learning Domains.
- `npm run typecheck` and `npm run build` passed. The initial typecheck found optional UI fields incompatible with exact optional property types; the explicit undefined-capable form types were corrected and the rerun passed. An initial new test invocation lacked its setup/import prefix due to a script split; the fixture prefix was restored before successful targeted and full API runs.
- Migration 007 was applied to the existing running development database, preserving accounts/evidence. The verified project stack was restarted to load the new API; both `/tutor/listings` and `/staff/listings` returned 200. An initial setup-local attempt correctly refused the occupied database port; migration used the existing stack instead of starting a second database.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:browser`: all six journeys passed in one run (3.2 minutes). The expanded fictional Tutor journey covers draft/submission, staff approval, public availability, pause/resume, edit/re-review, safety suspension/lift without automatic publication and Subject revocation blocking the public offer. Existing account journeys on both loopback origins, catalogue, Guardian and staff MFA/recovery also passed. The isolated browser stack stopped after verification; normal development ports remain running.
- `git diff --check` passed and common credential-pattern checks found no matches in staged files. Local environment, captured mail, database and test artifacts remain ignored.

API and workflow: [docs/api/listings.md](../../../docs/api/listings.md). No payment or provider credential is needed for this slice. Production evidence scanning, privacy approval and other launch dependencies remain as documented on task 06 and the production index. Full search/discovery, requests, access payments and release-readiness work remain later tickets.

## Comments


