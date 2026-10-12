# Plan and design alignment review

Review date: 12 October 2026
Implementation reviewed: `f1692ea` on `main`
Scope: current implementation against the accepted production specification, nine ADRs, implementation tickets and the owner's SuperProf visual reference. This is a whole-project alignment audit, not a review of a particular commit diff. Application code and ticket resolutions were not changed.

## Assessment

The delivered foundation follows the agreed product and architecture. Tasks 01–11 are recorded complete; tasks 12–28 remain planned. That count is not a percentage estimate of remaining effort. The marketplace is not yet ready for a paid production launch. One concurrency defect was reproduced, one accepted feature lacks an implementation ticket, and account-aware navigation needs UI polish.

The findings below describe the original reviewed commit. The owner subsequently authorized fixing all three; they are now corrected. See the follow-up evidence at the end of this report.

## Alignment evidence

| Decision | Current implementation | Assessment |
|---|---|---|
| Paid tutor connections; Tuition Fees paid directly to Tutors | Offer terms distinguish tuition; requests and Connections have their own permissions. No lesson payment or Tutor payout flow was introduced. | Aligned foundation; live platform charging awaits 14–15. |
| Eight Learning Domains, including JEE/NEET/CUET | Typed catalogue, approved exact teaching combinations and same-offer discovery filters. Listing/discovery integration tests include representative offers across all eight domains. | Aligned; catalogue coverage does not establish real Tutor supply. |
| Online-first India release | Listing validation permits ONLINE and INR; in-person/radius discovery remains outside the release scope. | Aligned. |
| Lovable UI, NestJS business authority and PostgreSQL | Running UI is `lovable-ui`; requests go through its typed API adapter with cookie credentials. Root startup runs API, UI and worker separately. Next.js screens are retained reference code, consistent with ADR-0009. | Aligned. |
| Verified accounts, roles and scoped staff MFA | Server sessions, password recovery/session revocation, separately granted staff scopes and privileged sessions are present. | Aligned delivered slices. |
| Adult Tutors and private evidence before publication | Current adult/Subject eligibility, scan state, evidence review and exact Listing approval gate discovery and request acceptance. | Aligned foundation; live scanner/operational setup still required. |
| Guardian-controlled children | Private minimal profiles, versioned consent and Trust review exist. Fictional verification is forbidden in production; live child collection remains gated. | Aligned boundary; approved live adapter/policy remain dependencies. |
| Covered requests and authorised Connections | Immutable coverage/deadline snapshots, atomic five-pending limit, targeted decisions, unique transactional membership/conversation creation and separate audited contact reads. | Aligned nonproduction slices; successful coverage currently uses isolated fixtures. |
| Preserve established access after ordinary pass expiry | Separate Connection grants preserve established access; current safety, consent and explicit grant restrictions still apply. | Aligned current tests. |
| Clean animated UI, name-only wordmark | Pink gradient hero, centered heading, pill search, subject shortcuts, responsive rounded cards and reduced-motion CSS. | Visual direction aligned; profile-photo workflow is missing. |
| VEER is owner, not brand | Public wordmark uses Tutor Marketplace; specification identifies VEER as owner. | Aligned; final business name remains undecided. |

## Findings and recommended action

### 1. Reproduced concurrency defect: inconsistent participant lock order

Priority: fix before extending Connection commands with chat/payment work.

`AuthService.authenticated` acquires participant user rows in UUID order (`apps/api/src/auth.ts:147`). Staff authorization instead first acquires only the operator's user row (`apps/api/src/staff.ts:40`); `ListingsService.staffRow` later acquires the target Tutor's user row (`apps/api/src/listings.ts:79`). Tutor evidence review uses the same operator-first pattern (`apps/api/src/tutors.ts:58`).

When a Trust operator also uses the permitted Learner role, a staff Listing operation and a request/Connection operation involving that same operator and Tutor can acquire the two users in opposite orders. For an operator UUID greater than the Tutor UUID, the staff transaction holds operator then waits for Tutor, while the participant transaction holds Tutor then waits for operator.

An isolated PostgreSQL reproduction invoked the actual `StaffService.authorize`, `ListingsService.staffRow` and `AuthService.authenticated` methods against a minimal fixture schema. It returned:

```json
{"operation":"request participant authorization","code":"40P01"}
{"operation":"staff Listing target authorization","code":"OK"}
```

PostgreSQL safely aborts one transaction; this reproduction establishes an action-failure/reliability defect, not an unauthorised disclosure or data-corruption finding. The current transaction helper rolls back and rethrows; it has no deadlock retry (`apps/api/src/database.ts:12`). This was a method-level reproduction, not a complete HTTP journey. The ignored script is `.local/alignment-lock-repro.ts`; its isolated cluster was stopped after the check. The owner's development database was not used.

Recommended correction: let scoped staff commands plan their target identity and acquire operator/target user locks in the same order before session/profile/Listing locks. Audit related evidence and Guardian commands, then add a meaningful concurrency regression through public commands. A bounded whole-transaction retry may provide additional resilience, but consistent locking should be the primary correction.

### 2. Accepted Tutor images have no implementation ticket

Priority: close the plan gap before declaring the public Tutor experience complete.

The specification explicitly keeps profile images in scope (`spec.md:119`), and the design map also includes Tutor images (`map.md:28`). None of the 28 current tickets explicitly owns the public photo upload/publication lifecycle. Cards currently render initials and gradient covers (`lovable-ui/src/components/public-offer.tsx`), and the UI refresh guide explicitly acknowledges that photo upload is unimplemented.

This is different from Reviews, which have task 21, and favourites, which are out of scope. Add a scoped photo work item with ownership, validated image upload/processing, publication/safety handling, public projection, mobile card display and deletion propagation. Public profile images must remain separate from private identity evidence. Connect that item to public UI and privacy/release readiness so it cannot be missed.

### 3. Header does not reflect an authenticated account

Priority: UI polish before the final end-to-end design review.

`SiteHeader` unconditionally renders Sign in and Join us in desktop/mobile navigation (`lovable-ui/src/components/account/ui.tsx:13`). It has no session-aware Account/Dashboard entry even on private pages. Existing sign-in/account flows work, but navigation does not reflect the user's signed-in state. Replace those entries with appropriate account navigation after checking the authoritative session; preserve anonymous navigation during signed-out use.

## Planned remaining work, not alignment defects

- Task 12: durable text messages, unread state and reconnect/realtime history. Conversation metadata already exists, but chat is not implemented.
- Task 13: user-facing blocks/reports and scoped safety investigations. Current block/safety permission foundations do not complete that workflow.
- Tasks 14–19: hosted checkout, verified capture, live activation, alternatives, cancellations/refunds and financial reconciliation.
- Task 20: actual availability-alert/service notification delivery. Task 09 currently records durable matching intents.
- Tasks 21–25: moderated Reviews, support/appeals, privacy/retention, supply-based SEO/metrics and operational alerts/replay.
- Tasks 26–28: deployment, complete backup/restore, accessibility/load evidence and controlled launch gates.

Current `ContactRequestsService.coverage` returns no coverage in production (`apps/api/src/contact-requests.ts:20`). `ConnectionsService.source` and Connection grants also reject production fixture access (`apps/api/src/connections.ts:24`). Tasks 14–15 must replace those intentionally closed seams with verified live coverage/grants. Local positive Connection tests must not be represented as working paid production access.

Live SMTP remains deliberately deferred until domain purchase. Brand/legal merchant identity, payment/bank credentials and invoice/tax approval, approved Guardian/privacy/retention procedures, real responsive Tutor supply, funded refunds and provisioned recovery/alert configuration remain release dependencies.

## Verification and limits

- Fresh `npm run typecheck` passed during this review across root workspaces and Lovable UI.
- Fresh isolated method-level PostgreSQL check reproduced the lock-order deadlock above and stopped its cluster afterward.
- Inspected the saved desktop/mobile UI refresh previews and current UI source. Those screenshots are previous visual evidence, not fresh browser captures from this review.
- Checked the saved task-11 logs: 80 API tests passed, nine UI tests passed and all eight Edge browser journeys passed. Those suites were not rerun during this audit. The latest ticket records passing build/typecheck evidence.
- Checked clean application Git state before the review. This review adds only this report to tracked workspace content; diagnostic files remain ignored. No commit, push, deployment or application fix was performed.
- No new load, restore, live email, provider sandbox or real payment verification was performed. Existing functional passes do not establish production capacity or readiness.

Recommended sequence: fix the concurrency defect, assign the missing photo scope, continue dependency-ready task 12, and retain tasks 14–28 and external launch dependencies as explicit release gates. Keep the accepted business model and architecture unchanged.

## Correction follow-up — 12 October 2026

All three findings have implementation and verification evidence:

1. Scoped staff commands plan target users and acquire operator/target user locks in the same UUID order before other mutable rows. Listing inspection/review/safety, Tutor inspection/claim review/private download access and Guardian review follow that order. The deterministic public HTTP regression first failed with one 500; after the correction both inspection and enquiry return 200. The original isolated lock reproducer, updated to use the corrected participant-aware authorization boundary, also returned OK for both operations.
2. [Ticket 29](./issues/29-public-tutor-photos.md) now owns the accepted photo slice and is complete. Bounded JPEG/PNG decoding, malware scan gating, metadata stripping, explicit public-display consent, encrypted processed image storage, owner preview/removal, separate Trust/MFA photo review and current-offer public delivery are implemented. Search cards and detail pages display approved photos with a fallback. Replacement/removal/rejection/revocation clear stored image bytes; paused/suspended/expired-evidence offers cannot deliver their photos. Tasks 23/24 explicitly depend on this slice for privacy/public invalidation coverage. [Photo guide](../../docs/api/tutor-photos.md).
3. Desktop/mobile headers query the authoritative cookie session and render My account/My enquiries for signed-in users. Login/logout cancel stale session fetches and update the shared in-memory query cache. Focus revalidation handles subsequently revoked sessions. No local token store or competing identity system was introduced.

Verification:

- Current API regression contains 85 scenarios. The full run passed 84/85; the only failure was the old assertion hardcoding 11 migrations after migration 012 was added. The test now compares the actual ledger/checksums/timestamps before and after restart; the entire corrected 13-test auth suite passed. All 85 API scenarios therefore have passing final evidence across the full run and corrected suite. The photo delivery scenario was further extended with direct suspension/expiry denial and passed on its final focused rerun.
- Nine UI unit tests passed. All eight Edge browser journeys passed together in 7.3 minutes, including desktop login/logout header assertions and Tutor photo upload, purpose-recorded staff inspection/approval and decoded mobile public card rendering.
- Final root build/typecheck passed; both runtime dependency audits reported zero vulnerabilities. Whitespace validation passed. The 390px public photo screenshot was inspected and the browser asserted no horizontal overflow.
- Migration 012 applied to the existing development database. The existing development stack was stopped with its session interrupt and restarted; UI/catalogue smoke checks returned 200, while unauthenticated owner/staff photo APIs returned 401. Browser fixture ports stopped. A fictional sample image is available under ignored `.local/fictional-tutor-photo.jpg`.

The correction adds no real payment/provider/deployment claim. Live photo scanning uses the configured ClamAV adapter; the test scanner and fictional photos remain excluded from production. Ticket 12 remains the next numbered dependency-ready marketplace task.
