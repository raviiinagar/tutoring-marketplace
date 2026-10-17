# 22: Resolve support cases and appeals through scoped actions

Status: ready-for-agent
Resolution: completed
Completed: 17 October 2026
Type: task
Blocked by: 18 — Review refunds after connection and reconcile chargebacks; 21 — Submit and moderate connection-linked Reviews

**What to build:** Users create and track support/refund/moderation appeals, while authorised staff handle them within published support coverage and recorded action limits.

## Acceptance criteria

- [x] Case ownership, queue status, assignment and restricted notes are visible only to allowed participants.
- [x] Support uses authorised domain commands rather than silently impersonating Tutors or direct database financial edits.
- [x] Refund and safety appeals retain outcome/reason history and appropriate evidence references.
- [x] Published hours are Monday–Saturday, 10 am–6 pm IST; no unstaffed 24/7 human-support promise.
- [x] Tests cover unrelated case IDs, finance/trust scope boundaries and audited resolution.

## Verification evidence

Implemented owner-only support creation/history/replies, immutable encrypted events, scoped metadata queues, purpose-recorded inspection, self-assignment/release, private staff notes and explicit terminal responses. Every privileged request uses current staff scope and account-bound MFA. Unrelated accounts receive 404, staff participants cannot adjudicate their own disputes, and optimistic revisions prevent competing or stale actions. Published coverage and next opening follow Monday-Saturday, 10:00-18:00 IST; signed-out visitors can read it.

Review/safety appeals link atomically to support cases. Trust can uphold, return rejected/removed feedback to fresh moderation, lift only the appealed safety case restriction, or close a changed source as superseded. Author withdrawal cannot be reversed. A new safety-case decision can be appealed at its own revision. Source evidence stays in its original authorized workspace and references/history are retained. Legacy safety appeals use a documented migration-time revision baseline.

Refund appeals require ownership and a closed original decision. Finance can uphold it or call the Finance-owned command to open a new linked review; original decisions and money facts remain immutable. Reconsideration does not approve or complete a refund, release contact, publish feedback or impersonate a Tutor. Domain changes and support outcomes share one transaction without nested transactions or external provider calls. Existing Finance approval and reversal/reserve limits remain authoritative. See the [support API and operating guide](../../../docs/api/support.md).

Verification on 17 October 2026: 29 real-PostgreSQL HTTP scenarios passed across Support, Support Finance, Reviews, Finance and chat/safety (`.local/task22-api-regression.log`). All 30 UI tests passed (`.local/task22-ui-final.log`). The isolated Edge browser journey passed a complete owner/staff exchange, private-note exclusion, customer confirmation, terminal resolution and 390 px overflow check (`.local/task22-browser-verified.log`, `.local/task22-support-mobile.png`, `.local/task22-support-staff.png`). The initial browser attempt exposed an accessible select-label mismatch; explicit labels fixed it and the fresh journey passed. A test-database teardown warning occurred after successful assertions; leftover isolated workers were checked/cleaned, and test ports 3100/4100/5434 are released. No owner database process was used for browser fixtures.

Production build and all workspace/UI typechecks passed (`.local/task22-final-build.log`, `.local/task22-final-types.log`). Migration 024 applied to the existing owner database without a reset: 28 users before and after (`.local/task22-local-migration.log`). The latest local API/worker/UI stack is running; health, both support pages and public policy return 200, while unauthenticated private support reads return 401. Existing credentials/accounts are preserved.

Real email/payment credentials, staffed operations, legal operator/contact details, Guardian approvals and other existing launch dependencies remain external. This task adds in-app case handling; it does not assert live message delivery or production launch readiness. Retention/deletion remains task 23.

## Comments


