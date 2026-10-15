# 13: Block communication and investigate safety reports

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 03 — Sign in to a scoped staff console with MFA; 12 — Send durable text messages and recover after reconnect

**What to build:** A participant can immediately block/report another account, and trust staff can investigate a scoped case and restrict affected accounts, Listings or Connections.

## Acceptance criteria

- [x] Blocking immediately stops applicable contact reads, new messages and realtime delivery, independently of staff queue delay.
- [x] Reports preserve necessary scoped evidence without broad support access to all conversations.
- [x] Sanctions have actor, reason and audit; suspended supply cannot authorise requests through stale public results.
- [x] Case views expose only authorised material; user-facing action states and appeal entry are available.
- [x] Tests prove post-block access denial, staff scope boundaries and suspension during contact grant creation.

## Verification evidence

Implemented participant-owned account blocks and report controls on owned Contact Requests and Connections, including selected chat-message report entry. Blocks serialize with acceptance/contact/message commands using sorted adult participant locks; they stop both directions and emit transactional authority wakeups without waiting for staff. Each adult can remove only their own block.

Reports freeze only selected messages (maximum ten) or the specifically reported initial enquiry into encrypted case evidence. Client request keys deduplicate retries; changed payloads conflict. TRUST scope, current session-bound MFA and an audited purpose are required for case inspection. SUPPORT/FINANCE and unrelated public accounts cannot inspect or sanction; involved staff cannot review their own case. No general conversation-reading staff interface exists.

Revisioned Trust decisions restrict case-derived accounts, Listings or Connections. Independent restriction records compose across cases and leave older manual safety flags intact. Current authentication, Learner/Tutor qualification, Listing availability, discovery/photo delivery and established Connection checks enforce them. Restricted published supply is paused; explicit lift does not republish it. Restricted verified adults retain only basic identity/safety/block/report/appeal entry while marketplace commands remain denied. Durable idempotent appeals remain PENDING_REVIEW for task 22 adjudication; they never auto-lift restrictions.

Verification on 15 October 2026:

- TDD red/green logs `task13-red-01` through `04` and corresponding green logs cover live blocking, frozen selected evidence and Trust permissions, composed sanctions, and restricted-adult appeal entry. Assertions use public HTTP/realtime with real isolated PostgreSQL; external mail/scanning/coverage fixtures remain fictional setup only.
- `npm test`: **98 API scenarios and 11 UI tests passed**, zero failed/skipped (`.local/task13-full-tests.log`).
- Final six-scenario safety rerun after DTO/client identity scoping: **6 passed** (`.local/task13-safety-final.log`), including restriction/acceptance races, stale-offer request denial, unrelated IDs, missing/revoked MFA and self-review denial.
- Expanded Tutor/chat browser journey passed in the full run: a live peer loses chat on block, only selected message evidence reaches Trust, staff restricts the Connection, unblocking leaves that restriction intact, an appeal persists, and explicit lifting restores permitted history. Other six existing journeys passed in that run. The availability journey initially asserted during cold loading; waiting for the actual selected search response fixed the synchronization, and its targeted rerun passed. All **8 browser journeys have passing evidence** across `.local/task13-browser-all.log` and `task13-browser-availability-final.log`. A first safety assertion used an incorrectly encoded separator; its corrected assertion passed in the full run.
- Final root build and typecheck passed (`task13-build-final.log`, `task13-typecheck-final.log`). Typecheck caught an inferred empty restriction-array type; an explicit participant notice type corrected it. No dependencies or credentials were added.
- Migration 014 applied successfully to the existing local database. Restarted the verified project dev stack; `/v1/health` returned 200 and anonymous participant/staff safety requests returned 401. Existing accounts and approvals were preserved.
- Inspected the mobile safety screenshot; browser overflow checks passed. These are functional results, not measured pilot accessibility/load capacity; task 27 retains that release gate.

See [safety workflow and interface](../../../docs/api/safety.md). Views are bounded to recent 50 entries, with a known case reference available for scoped Trust inspection. Full support browsing/appeal adjudication remains task 22, approved retention/export/deletion and re-encryption task 23, and notifications/alerts tasks 20/25. Live paid capture/activation remains tasks 14-15; production rejects fixture coverage. SMTP, merchant/brand, Guardian/privacy policy and deployment remain launch dependencies.

## Comments



Implementation started on 15 October 2026 using TDD and codebase-design. Public HTTP commands/reads, actual realtime streams with real isolated PostgreSQL, and browser journeys are the already accepted seams in the specification. First slice: participant-owned account blocking closes current communication independently of report review. Routine design defaults are delegated; no new test seam or launch credential is inferred.

Adopted implementation defaults: a participant blocks the other adult via an owned Contact Request/Connection, across their mutual interactions. Reporting remains available after a block or interaction restriction using membership identity, without granting message-history/contact access. Trust case inspections require current scoped MFA and a recorded purpose; only selected messages (maximum ten), or the specifically reported initial enquiry, enter the encrypted frozen evidence snapshot. No general conversation-reading staff endpoint is introduced.

Case restrictions are independent records, so lifting one case cannot clear another case or the earlier manual Listing safety flag. Restricting supply pauses published offers; lifting restrictions requires explicit owner resume before public availability. Current verified restricted adults retain a narrow safety identity for decisions/block/report/appeal, while ordinary marketplace commands remain denied. Appeals are durable entries in PENDING_REVIEW; full support case adjudication is ticket 22. Live Guardian/retention/merchant/provider dependencies remain unchanged.

Completion review: current permission gates reuse the same participant lock order; case evidence is not returned by participant/queue views, scoped UI state clears on account changes and MFA expiry, and private text stays out of general logs/audit metadata. Final diff whitespace checks passed.
