# 21: Submit and moderate connection-linked Reviews

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 13 — Block communication and investigate safety reports

**What to build:** A connected Learner or Guardian attests to actual interaction and submits a Review after seven days, with staff moderation and accurate public aggregates.

## Acceptance criteria

- [x] Eligibility uses connection establishment time; reject early, unrelated, self and duplicate submissions.
- [x] Moderation records reasons/history and handles positive/negative compliant feedback consistently.
- [x] Public labels identify connection evidence without claiming attendance verification.
- [x] Publication/removal recalculates eligible aggregates; suspended or deleted state cannot be resurrected by stale updates.
- [x] Tests prove eligibility, negative publication, withdrawal/removal and scoped moderation; appeal references are available.

## Verification evidence

Implemented a dedicated Reviews module behind verified HTTP and existing Connection/Guardian/grant checks. The server enforces seven complete days from establishment, explicit interaction attestation, integer 1-5 rating, contact-free bounded feedback, and one review per adult/Tutor relationship. Stable submission keys deduplicate retries; participants cannot review themselves. Ordinary pass expiry preserves established safe review rights. Blocking stops communication without suppressing honest feedback.

Different Trust/MFA staff inspect selected encrypted content with an audited purpose and record immutable, revisioned publish/reject/remove decisions. Positive and negative ratings follow identical policy codes; rating polarity never causes rejection. Authors can withdraw, including after Guardian consent withdrawal; Tutors cannot withdraw another account's feedback. Terminal withdrawal/removal/rejection cannot be republished by stale decisions. Pending/rejected/removed private text stays hidden from the Tutor.

Shared live read projections supply Tutor-wide public counts/averages, public review pages and discovery cards. Current source safety, account/role state, grants, Guardian approval/consent and learner withdrawal filter both content and aggregates. Public roles are anonymous Adult learner/Guardian; no child aliases, identity details or Connection/profile IDs appear. Labels explicitly distinguish Connection evidence from independently verified attendance. Production also validates original coverage classification and excludes copied fixture data even when its review flag is incorrect.

Related adults record private encrypted, idempotent, revision-linked appeals with visible references/status. Appeals do not republish feedback; support adjudication and support-case integration remain task 22. Retention/deletion orchestration remains task 23. See [review workflow and API](../../../docs/api/reviews.md).

Verification on 17 October 2026: 35 API scenarios passed across Reviews, Connections, discovery and availability using real isolated PostgreSQL (`.local/task21-regression.log`), including all six review-specific scenarios. All 26 UI tests passed (`.local/task21-ui.log`). The extended mobile Tutor browser journey passed submission, Trust publication of a negative review, correct public score and author withdrawal (`.local/task21-browser-verified.log`); mobile overflow and screenshot were checked (`.local/task21-mobile-reviews.png`). The initial browser run identified a CommonJS fixture top-level-await error; the fixture was corrected and its full journey rerun passed. Production build and all workspace/UI typechecks passed (`.local/task21-final-build.log`, `.local/task21-final-types.log`).

Migration 023 was applied to the owner's existing database without a reset (`.local/task21-local-migration.log`). The old localhost stack was cleanly stopped with pg_ctl and restarted on the latest source. Current `/v1/me/reviews` correctly requires authentication (401), public discovery returns review summaries (200), and API/worker/UI startup is healthy (`.local/dev-task21.log`). No merchant, email, SMS or Guardian launch dependency was fabricated or enabled.

## Comments


