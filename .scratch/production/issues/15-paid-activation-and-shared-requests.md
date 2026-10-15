# 15: Activate paid access once and connect accepted Tutors

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 11 — Accept a Contact Request and establish an authorised Connection; 14 — Purchase the ₹599 Access Pass through hosted checkout

**What to build:** After confirmed capture, a payer sends requests against one purchase and eligible acceptance activates one 30-day pass and authorised Connections.

## Acceptance criteria

- [x] First-purchase requests require capture; access starts only with eligible acceptance and its interval is fixed once.
- [x] Two Tutors accepting concurrently share one funded cycle, entitlement and charge; each eligible Connection is created once.
- [x] Acceptance and activation lock the same purchase records used by cancellation; external calls occur outside transactions.
- [x] Suspension or abandonment in flight records actual money but prevents contact release and routes to resolution.
- [x] Tests replay/out-of-order events and crash after provider success, asserting correct ledger/access and no duplicate logical charge.

## Verification evidence

Implemented a shared paid-access module behind the existing public HTTP interfaces. Verified CAPTURED purchase/journal facts create one payer-bound PAYMENT matching entitlement. First eligible acceptance atomically fixes the 30-day interval, Connection, adult participants, conversation and independent contact grant. Database constraints/immutability protect purchase ownership, source isolation and fixed dates. Later acceptances do not reset dates or create another charge.

Acceptance locks the purchase before entitlement/request transitions, resampling the server deadline after waiting. This is the coordinator record that task-17 cancellation/refund commands must also lock; the cancellation endpoint and cancellation-versus-activation race are not implemented or claimed tested in this ticket. Provider operations remain outside transactions. Supply suspension during provider work and Learner-role withdrawal preserve captured money while preventing an ineligible Connection; an explicitly chosen eligible alternative can use the unchanged matching window. Financial review stops new acquisition and preserves safe established grants.

Ordinary expiry preserves already covered requests and established safe contacts/chat. Explicit repurchase is permitted only after an activated pass expires; uncertain, unmatched expired and financial-review purchases cannot create a replacement charge. Historical original-key retries return the original purchase, with checkout omitted if its recipient is unavailable. Production rejects fictional/provider-test coverage in enquiries, decisions, Connections and safety contexts.

UI status exposes awaiting acceptance, fixed active dates, expiry, alternative selection and safe manual repurchase. A server-confirmed callback or payment-status refresh rechecks enquiry eligibility without resetting typed goals/times. Test mode remains labeled; no real credentials or merchant identity were added.

Verification on 15 October 2026:

- Public HTTP/real-PostgreSQL payment suite: **14/14 passed**, including capture gating, two concurrent Tutors, fixed dates, replay/restart, unknown provider success, supply suspension in flight, role withdrawal, deadline equality, ordinary expiry/repurchase, financial review and production test-data isolation. Command: `node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json --test --test-concurrency=1 apps/api/test/payments.test.ts`. Final evidence: `.local/task15-payments-verified.log`.
- Related Connection, Contact Request and chat suites: **35 scenarios passed** in the earlier four-file integration run (`.local/task15-integration-final.log`). That run also found an outdated payment retry assertion, corrected and verified in the final 14/14 payment run. The two runs are not represented as a single clean full-suite run. A journal assertion now checks both financial kinds without assuming UUID ordering for equal timestamps.
- `npm --prefix lovable-ui test`: **18 tests passed** across three files, including a failing-then-passing callback refresh regression and active/expired/unmatched payment states. `.local/task15-callback-red.log`, `.local/task15-ui-verified.log`.
- Root `npm run typecheck` and `npm run build`: **passed**. `.local/task15-types-verified.log`, `.local/task15-build-verified.log`.
- `npm run test:browser` with `PLAYWRIGHT_CHANNEL=msedge`: **all nine journeys passed in one run (4.4 minutes)**, including both loopback account flows, mobile payments and the Tutor/evidence/Listing/enquiry/Connection/chat/safety journey. `.local/task15-browser-verified.log`. These browser flows use isolated fictional coverage; actual paid activation is verified through the public HTTP provider-adapter scenarios above.
- Mobile payment screenshot inspected: `.local/task15-mobile-payments.png` (copied from the browser suite's shared screenshot output). Price, payment-versus-tuition terms and disabled checkout fit the viewport; the browser also verified no horizontal overflow or payment script while disabled.
- Migration 016 applied to the ordinary local database with `npm run db:migrate`, preserving existing accounts/approvals. Local UI/API/worker are running on 3000/4000 with PostgreSQL 5433. `/payments` returns HTTP 200; policy returns 59900/INR, 30 days/72 hours and `checkout_available: false`.
- `git diff --check` passed; changed source/docs decode as UTF-8 and checked local README/paid-access links resolve. No independent sub-agent review was performed or claimed.

See [paid access](../../../docs/api/paid-access.md) and [payment setup](../../../docs/api/payments.md). Tests use a controlled external provider adapter, not an actual Razorpay sandbox transaction. Live credentials, merchant/invoice/tax details, credentialed capture/webhook verification, refunds, finance reconciliation and deployment/release gates remain external or later-ticket dependencies. Interrupted runs are excluded from passing evidence.

## Comments


