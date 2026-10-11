# 19: Inspect receipts and reconcile payments to settlements

Status: ready-for-agent
Type: task
Blocked by: 18 — Review refunds after connection and reconcile chargebacks

**What to build:** Payers view accurate payment/refund history and configured receipts, while finance staff reconcile provider settlements, fees and bank receipts through an exception queue.

## Acceptance criteria

- [ ] Issued documents use immutable merchant/price/tax snapshots; only the authorised owner can view them.
- [ ] Provider and bank imports deduplicate; journal postings balance and preserve capture/refund/chargeback facts.
- [ ] Unknown payments/refunds and missing callbacks are fetched/reconciled without creating fresh charges.
- [ ] Exceptions distinguish gross payments, fees/tax, reversals and settlement timing; correcting outcomes are audited.
- [ ] Tests prove one imported effect, exact totals and owner/staff financial isolation; direct Tuition Fees are not platform revenue.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


