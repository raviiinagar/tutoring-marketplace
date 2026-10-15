# 14: Purchase the ₹599 Access Pass through hosted checkout

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 04 — Manage adult and guardian-controlled Learner profiles; 08 — Find eligible Tutors and inspect public offers

**What to build:** A payer reviews platform-versus-tuition pricing and creates one server-priced hosted checkout with verified payment status and honest pending/failure screens.

## Acceptance criteria

- [x] One stable membership/cycle owns the versioned amount, currency and policy; client amounts are ignored.
- [x] Only an eligible Tutor recipient allows checkout; customer total and configured invoice/tax disclosures are visible.
- [x] Server verifies Checkout signatures and captured provider state; browser redirect alone grants no access.
- [x] Webhook raw-body validation, durable inbox, replay protection and captured financial journal are included.
- [x] Sandbox/adapter tests cover forged amounts, bad signatures, lost callbacks, unknown attempts and no duplicate replacement charge.

## Verification evidence

Implemented immutable `access-v1` server pricing (59900 paise/INR), one stable open purchase per payer, committed reservation before external Order creation and provider-account/mode-bound disclosure snapshots. Strict checkout input rejects client price/currency/payment flags. Current usable owned Learner, Guardian consent, recipient/evidence/catalogue eligibility, Listing revision, blocks and restrictions gate Order exposure. Concurrent retries share one cycle/Order; ambiguous outcomes remain UNKNOWN and never blindly retry the provider create call.

Razorpay Standard Checkout uses server Orders, stored-Order HMAC verification and provider-fetched payment facts. An exact-path raw-body-signed durable webhook inbox acknowledges only after commit. Separate-worker leases/retry, whitelisted financial payloads, event hash replay checks, per-Payment journal uniqueness and row locks preserve committed captures through callback loss, duplicate/out-of-order delivery and restart. Unexpected/extra captures become immutable financial facts requiring resolution. The signed capture-event timestamp fixes the 72-hour matching deadline; local receipt time and payment creation time never extend it.

The responsive enquiry checkout and `/payments` account entry show server total, frozen merchant/invoice/tax breakdown, explicit separate-tuition acknowledgement, test-mode label and pending/failure/resume/confirmed states. Unknown payment cannot expose a replacement Pay action. Capturing money never grants access in task 14; paid request/Connection activation remains task 15. Current local configuration remains disabled, and the hosted script is not loaded without an explicit permitted Pay action.

Verification on 15 October 2026:

- `npm test`: **106 API scenarios and 14 UI tests passed**, zero failures. Includes six public HTTP/real-PostgreSQL payment/worker scenarios and two Razorpay transport/config contracts. The final full run includes concurrent webhook processing, current safety block checkout denial and durable restart recovery. `.local/task14-full-tests.log`.
- `npm run test:browser` with Microsoft Edge: **all nine browser journeys passed in one run**, including mobile checkout, both loopback account flows and the complete Tutor/evidence/Listing/enquiry/Connection/chat/safety journey. `.local/task14-browser-all.log`.
- `npm run build` and root `npm run typecheck`: passed. `.local/task14-build.log`, `.local/task14-types-final.log`.
- Mobile full-page screenshot inspected at `.local/task14-mobile-payments.png`; price/terms visible, no horizontal overflow, no payment script loaded while disabled.
- `npm run db:migrate`: migration 015 applied to the ordinary local database without altering existing accounts or approvals. Updated local stack is running. `/v1/payments/policy` returns 59900/INR with checkout disabled; `/payments` returns HTTP 200.
- `git diff --check`: passed. No credentials or real merchant/tax identity were added. Provider/merchant setup remains separate from completed software verification.

## Comments




## External dependencies and rollout boundary

See [payment setup/API guide](../../../docs/api/payments.md). No actual provider credentials, account capabilities, capture setting, merchant/bank details, tax treatment, invoice identity or public webhook endpoint were invented. Actual Razorpay test-mode card/UPI capture, event timestamp contract and webhook delivery/replay remain credentialed sandbox verification dependencies. Adapter tests are not represented as a real provider sandbox transaction. Live checkout additionally requires explicit configuration/launch approval and completion of activation, refund/reconciliation and deployment gates. Unknown Order creation with no callback/event remains held for operator reconciliation by stable receipt; this slice adds no unsafe timeout replacement or finance resolution UI.
