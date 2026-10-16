# Cancellation and refunds

The owner can `POST /v1/me/purchases/:id/cancellations` with an empty body before activation. `GET /v1/me/purchases/:id/refunds` returns cancellation, eligibility, refund operations and bank timing guidance. Restricted adult owners retain financial-history access; unrelated users receive 404.

The purchase lock coordinates acceptance and cancellation. Cancellation cannot undo an already activated pass. Unmatched captured purchases cancel at capture + 72 hours, including delayed capture receipt; late money for a cancelled purchase creates a full refund liability. Current coverage is revoked and pending unconnected enquiries end. No deadline is extended.

Refund intents freeze amount, currency, original capture and provider request body. The operation UUID is the Razorpay `X-Refund-Idempotency` key. Reserve is held across timeouts and unknown results. A leased worker runs provider calls outside transactions, reuses the same operation and validates the result before posting immutable reversal facts. A processed refund closes a fully reversed cancelled cycle; bank credit timing remains separate. Failed/rejected operations and repeated ambiguity require Finance review. No fee is deducted from the customer refund.

Finance scope plus MFA authorizes `GET /v1/staff/refunds?reason=...`, `POST /v1/staff/refund-reserve/funding` (`reference`, integer `amount_paise`, `reason`) and `POST /v1/staff/refunds/:id/retries` (`reason`). Funding references deduplicate and require already verified provider funding. They are accounting evidence, not a bank/provider transfer. The queue shows confirmed/reserved/spent reserve and pending, unknown, failed and review operations. Retry schedules the existing key; it cannot change the refund amount.

No production credentials or funded reserve are fabricated. See [official-provider contract research](../research/razorpay-refunds-reconciliation.md) for idempotency, provider-state and integration limitations. Live setup and merchant-specific sandbox checks remain launch dependencies.


## Post-connection review and provider reversals

`POST /v1/me/purchases/:id/refund-cases` accepts a stable UUID `request_key` and private `reason`; owner GET on the same path returns cases, dispute summaries and reversal history. Case text is encrypted. No provider charge/refund is made when opening a case.

Finance/MFA uses `GET /v1/staff/refund-cases?reason=...` and `POST /v1/staff/refund-cases/:id/decisions`. APPROVE requires integer `amount_paise`, decision `reason` and explicit `access_treatment: KEEP|REVOKE_FUTURE`; DECLINE records its reason. Decisions replay identically and cannot be rewritten. Capture reservations, external refunds and dispute exposure bound recovery. Full cumulative recovery requires acquisition revocation. Historical capture and established conversation grants remain separate facts.

`refund.*` and supported `payment.dispute.*` events use the existing signed raw-body webhook inbox, followed by provider reads. Event names alone do not determine money movement. Lost/duplicate callbacks, stale dispute events and unknown operations preserve existing journal facts; excess recovery or changed identity/debit facts produce Finance exceptions. Unmanaged provider refunds are recorded and held for review. Live configuration requires `RAZORPAY_ACCOUNT_ID`; test/live identities remain isolated. Provider processing does not prove bank receipt.
