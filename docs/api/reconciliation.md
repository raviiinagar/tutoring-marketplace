# Payment documents and reconciliation

Payers use `GET /v1/me/payment-history?cursor=<uuid>` and `GET /v1/me/purchases/:id/receipt`. Financial ownership is checked with the verified cookie session, including restricted-adult financial access. Documents freeze the original merchant, plan price, base/tax breakdown and capture reference. Test confirmations are clearly fictional. A payment confirmation is not presented as a legal tax invoice; approved merchant invoice details remain a live setup dependency. Direct tuition is excluded.

Finance scope plus current staff MFA and an explicit reason protect all `/v1/staff/finance` commands:

- `GET /reconciliation?reason=...`: balanced operational journal totals, provider runs and settlement/bank matching.
- `POST /reconciliation-runs`: UUID `request_key`, integer `year`, `month`, optional `day`, `reason`. Read-only provider imports use leased, fenced, paginated work; stable retries never create Orders or charges.
- `POST /reconciliation-runs/:id/retries`: retry the same reviewed read operation with a recorded reason.
- `POST /bank-receipts`: verified statement rows (`reference`, `utr`, integer `amount_paise`, `currency: INR`, ISO `received_at`) plus purpose. References deduplicate; conflicts preserve existing evidence.
- `POST /exceptions/:id/resolutions`: record the reviewed outcome/reason without rewriting money history.
- `POST /purchases/:id/capture-confirmations`: `provider_payment_id`, provider-confirmed ISO `captured_at`, `reason`. Provider payment/Order identity and captured state are refetched outside the transaction, then Finance authority and the purchase lock are rechecked. Existing capture times cannot be rewritten.

Captured money, reversals, fees and bank receipts remain distinct facts. Every operational journal entry has at least two postings and balances at database commit; posted entries are immutable. Gateway `fee` includes its tax component: the component is shown separately and not deducted twice. Provider rows preserve reported credit/debit allocation, rather than guessing bank settlement from gross payments.

Provider settlement processing is separate from bank receipt. The system matches verified UTR, exact amount and currency before posting bank receipt. Unknown transactions, conflicting imports, missing capture-time evidence and settlement/bank timing remain visible exceptions. Provider refund reads feed the durable financial inbox; unknown outcomes can complete without replacement refunds. Old ambiguous refunds without a provider reference enter review instead of blind long-lived POST retry.

`PAYMENT_DAILY_RECONCILIATION_ENABLED` defaults on for configured live payments and off in nonproduction. Daily jobs overlap the current and previous provider calendar month; stable daily keys prevent duplicate scheduling after restart. Provider calendar conventions and complete merchant-specific reconciliation must be verified during credentialed setup. Bank evidence is imported separately; a provider callback does not fabricate it.

See [provider research](../research/razorpay-refunds-reconciliation.md) and [refund operations](refunds.md). Root tests use fictional external provider adapters with real isolated PostgreSQL and do not move real money.
