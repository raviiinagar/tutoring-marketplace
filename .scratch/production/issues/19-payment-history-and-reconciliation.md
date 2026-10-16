# 19: Inspect receipts and reconcile payments to settlements

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 18 — Review refunds after connection and reconcile chargebacks

**What to build:** Payers view accurate payment/refund history and configured receipts, while finance staff reconcile provider settlements, fees and bank receipts through an exception queue.

## Acceptance criteria

- [x] Issued documents use immutable merchant/price/tax snapshots; only the authorised owner can view them.
- [x] Provider and bank imports deduplicate; journal postings balance and preserve capture/refund/chargeback facts.
- [x] Unknown payments/refunds and missing callbacks are fetched/reconciled without creating fresh charges.
- [x] Exceptions distinguish gross payments, fees/tax, reversals and settlement timing; correcting outcomes are audited.
- [x] Tests prove one imported effect, exact totals and owner/staff financial isolation; direct Tuition Fees are not platform revenue.

## Verification evidence

Owner-only payment history and immutable payment-confirmation documents use the original merchant/base/tax/price snapshot. Test records are visibly fictional; no unconfigured legal tax invoice is invented. Direct tuition never enters platform money history.

Immutable balanced journal entries post capture, refund/chargeback, inclusive gateway fee/tax and verified bank-receipt facts. Finance/MFA controls read-only provider statement runs, stable retries, bank imports and audited exception resolutions. Imports deduplicate references/fingerprints; conflicting rows preserve prior facts and enter review. A processed settlement is not bank credit: matching UTR, amount and currency require separate bank evidence.

Provider reads recover missing payment/refund callbacks without fresh charges. Missing capture timestamps remain an explicit exception until Finance records provider-confirmed evidence; the original purchase and 72-hour deadline are preserved. Refunds with an old unknown result require a provider reference rather than an indefinite blind POST. Live configuration defaults to daily overlapping current/previous-month read-only reconciliation, deduplicated across worker restarts; nonproduction requires explicit enablement.

Verification: initial five API scenarios passed in `.local/task19-api.log`; the strengthened missing-refund and daily scheduling regressions passed in `.local/task19-final-boundaries.log` (six distinct scenarios). Root build/typecheck and all 22 UI tests passed (`.local/task19-build.log`, `.local/task19-types.log`, `.local/task19-ui.log`). Migrations 020?021 are additive and preserve existing financial facts. Final cross-task regression is also required before the task-20 batch is delivered.

External dependencies: actual merchant/tax/invoice details, provider credentials and credentialed account verification; real bank statement evidence and provider calendar/settlement conventions. Payment confirmations are implemented; issuing compliant tax invoices remains gated by the merchant finance setup already recorded in the production specification.

## Comments


