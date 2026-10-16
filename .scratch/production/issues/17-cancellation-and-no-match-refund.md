# 17: Cancel unactivated purchases and refund unmatched payments

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 16 — Expire requests and offer learner-selected alternatives

**What to build:** A payer can cancel before activation, and unmatched captured purchases automatically initiate a full refund at the matching deadline with visible progress.

## Acceptance criteria

- [x] Cancellation ends relevant unconnected requests; reversal/activation races cannot both connect an unactivated purchase and reverse it.
- [x] Full no-match/cancellation refund intents reserve the refundable amount and use stable provider operation keys.
- [x] Insufficient reserve, provider timeout and failed/unknown refunds remain visible, retriable and escalated.
- [x] UI distinguishes initiation, confirmed provider result and bank timing without reducing the full customer refund by gateway costs.
- [x] Race/failure tests prove one refund effect, no late resurrection and correct ledger/access outcome.

## Verification evidence

Cancellation locks the same purchase as activation, revokes acquisition coverage and cancels unconnected pending requests. A worker creates capture-specific full-refund intents at no-match equality and for late captures of cancelled purchases. Frozen provider bodies/UUID idempotency keys, leased attempts and reserved funds survive unknown responses. Provider facts are validated before immutable reversal posting. Completed cancellations close the old cycle for a fresh explicit purchase.

Finance MFA controls audited reserve funding, visible exception/status queues and retries of the same operation. Reference replays do not add reserve twice. Unknown results retain reservations; provider failures/rejections are visible for review, and retries never create a new financial key. Payer UI distinguishes cancellation, reserve wait, provider processing/result and bank-credit timing. No gateway cost reduces the approved refund.

Verification: cancellation/retry, no-match equality/late capture and activation-race tests passed in `.local/task17-verified.log` (the initial fourth test exposed an expired test MFA session, then passed using a within-session retry clock in `.local/task17-finance-verified.log`). All 21 UI tests passed (`.local/task17-ui.log`); root typecheck/build passed (`.local/task17-types.log`, `.local/task17-build.log`). Migration 018 is additive. Provider verification used a fictional external adapter with real isolated PostgreSQL; no real money was moved.

External launch dependencies: merchant credentials, enabled refund capabilities/webhooks, confirmed funded provider reserve and credentialed sandbox checks. Reserve entries record verified funding evidence; the software does not transfer funds into the provider account.

## Comments


