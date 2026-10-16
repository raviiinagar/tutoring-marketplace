# Razorpay refunds, disputes and settlement reconciliation

Research date: 2026-10-15. Scope: the India Payment Gateway APIs for production Tasks 17–19. This report records provider contracts and implementation recommendations; it does not enable payments, change product policy, or demonstrate live merchant verification. Read alongside [ADR 0007](../adr/0007-one-time-hosted-payments-and-separate-access.md).

## Refund requests and retry safety

Use `POST https://api.razorpay.com/v1/payments/{payment_id}/refund` with HTTP Basic API-key authentication. Send the exact approved integer amount in currency subunits, `speed: "normal"`, a durable `receipt`, and minimal non-sensitive correlation `notes`. Full refunds should explicitly send the full approved amount rather than rely on an omitted amount. Only captured payments can be refunded. Insufficient merchant balance produces HTTP 400; the documented remedy is to add funds and retry. The error table does not specify a stable machine-readable insufficient-balance reason. Unknown 400s must not all be classified as reserve shortage. [Normal refund API](https://razorpay.com/docs/api/refunds/create-normal/)

`X-Refund-Idempotency` is the documented refund idempotency header. Its key must contain at least 10 characters using letters, digits, hyphens or underscores. Persist a UUID before sending; preserve that key and the identical request body across network failure, timeout and retry. Concurrent processing can return 409; wait and retry the same operation. A different body under the same key is rejected. The reviewed documentation states safe retry following an unknown network outcome but does not document key expiry/retention, scope across merchant/key rotation, or caching of rejected requests. Its error-table suggestion to use another key while a request is processing conflicts with its safe-retry guidance; this integration should keep the original key. [Idempotent normal refunds](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent)

Recommended local operation shape, independent of provider field names:

```ts
type RefundOperation = {
  id: string;                 // durable UUID and provider idempotency key
  purchaseId: string;
  paymentId: string;
  amountPaise: number;        // integer, immutable once submitted
  requestBody: string;        // frozen serialized provider payload
  state: "RESERVED" | "SENDING" | "UNKNOWN" | "PENDING"
       | "PROCESSED" | "FAILED" | "REVIEW";
  providerRefundId: string | null;
};
```

Reserve funds transactionally before outbound I/O, using the same purchase lock as acceptance/cancellation. Keep an ambiguous operation reserved. Never release its reservation merely because a worker timed out, and never manufacture a new key to escape a pending result. Retry network/409/5xx failures with bounded backoff; escalate authentication, mismatched payload, unrecognized failures and persistent ambiguity. These are recommended application invariants, not additional provider guarantees.

## Refund reads, status and event contracts

Available reads are `GET /v1/refunds/{refund_id}`, `GET /v1/payments/{payment_id}/refunds/{refund_id}`, and `GET /v1/payments/{payment_id}/refunds`. The payment collection defaults to the last 10 refunds; paginate `count` (1–100) and `skip`, optionally using `from`/`to` Unix seconds. Never infer that no refund exists after checking only the default page. [Refund API overview](https://razorpay.com/docs/api/refunds/), [Payment refund collection](https://razorpay.com/docs/api/refunds/fetch-multiple-refund-payment)

The relevant refund entity fields are `id`, `entity: "refund"`, `payment_id`, integer `amount`, `currency`, `status`, `receipt`, `notes`, `created_at`, and `acquirer_data`. States are `pending`, `processed`, and `failed`; `processed` is the provider's final refund state. Banking references can be ARN, RRN or UTR and can initially be absent. The documentation describes normal refunds as taking 5–7 working days. Keep initiation, provider processing and bank receipt distinct in the payer interface. `created_at` is creation time, not a guaranteed bank-credit timestamp. [Refund entity](https://razorpay.com/docs/api/refunds/entity)

Subscribe to `refund.created`, `refund.processed` and `refund.failed`; `refund.speed_changed` is additional information. The envelope includes `account_id`, `event`, `created_at`, and `payload.refund.entity`; examples also include `payload.payment.entity`. A `refund.created` example already has `status: "processed"`, so do not derive financial outcome from event name alone. Validate refund ID, payment ID, amount and currency against the stored operation. Correlation `receipt`/`notes` help identify a missing response but are not a substitute for idempotency or amount validation. [Refund webhook payloads](https://razorpay.com/docs/webhooks/refunds)

Recommended ambiguity recovery: fetch the known refund ID first; otherwise paginate refunds for the original payment and match durable operation correlation plus payment/amount/currency. Quarantine conflicting or multiple matches. An absent match does not prove the original POST never executed; resume only the original idempotent request, or retain review if the provider's retention behavior has not been established. Do not reconstruct a refund from a browser success callback.

## Webhook authenticity and replay

Validate `X-Razorpay-Signature` as HMAC-SHA256 over the raw bytes with the configured webhook secret. Retain the appropriate old secret for retried events after rotation. The `x-razorpay-event-id` header identifies duplicate events; delivery order is not guaranteed. Persist the authenticated inbox before acknowledgement and make financial projections idempotent as well as the inbox. Test and live payload structures are the same, so payload shape alone cannot distinguish their environment. [Webhook validation and ordering](https://razorpay.com/docs/webhooks/validate-test/)

Application recommendation: compare `account_id` to the configured merchant account and segregate test/live credentials, secrets and imported records. Reject mismatched payment/order/currency/amount associations even with a valid signature. Refund/dispute API objects do not provide an independent merchant identity field in the reviewed entity contracts; authenticated API context and verified event envelope supply that boundary. For reordered events, refetch current provider state and preserve already posted immutable facts; do not assume webhook arrival time is business-event time.

## Disputes and chargebacks

Read `GET /v1/disputes/{id}`; `?expand[]=payment` and `?expand[]=transaction.settlement` are documented expansions. `GET /v1/disputes` can enumerate disputes. Provider APIs also expose acceptance and contest operations, but neither should be invoked automatically by an import/reconciliation routine. [Dispute APIs](https://razorpay.com/docs/api/disputes/)

The dispute entity includes `id`, `payment_id`, integer `amount`, `currency`, `amount_deducted`, `status`, `phase`, `respond_by`, and `created_at`. Statuses are `open`, `under_review`, `won`, `lost`, `closed`. `amount_deducted` records the debit when lost and is otherwise zero. Phases include fraud, retrieval, chargeback, pre-arbitration and arbitration. A won chargeback can be challenged again in later phases; a closed fraud dispute can reflect evidence supplied or a refund. Therefore neither `won` nor `closed` alone proves a new cash credit, and do not model all disputes as forever-terminal on first apparent closure. [Dispute entity](https://razorpay.com/docs/api/disputes/entity)

Subscribe to `payment.dispute.created`, `.under_review`, `.action_required`, `.won`, `.lost`, and `.closed`. Envelopes carry `account_id`, payment and dispute entities. `action_required` is an event name; its sample entity status remains `open`. Correlate the dispute's payment ID and currency with the stored capture; disputed amount may be less than the original payment. [Dispute webhook payloads](https://razorpay.com/docs/webhooks/disputes/)

Recommended local accounting: reserve exposure for unresolved disputes before approving additional refunds; count a confirmed chargeback debit once by provider dispute identity. Preserve raw amount versus actual `amount_deducted` separately. Race refund reservation against dispute processing under the purchase lock. If a provider debit overlaps a previously processed refund, retain both observed facts and raise an excess-reversal exception; do not suppress the actual debit or issue another refund. A restored financial position must never silently restart the historical Access Pass clock. Provider event data does not decide the platform's safety or access policy.

## Settlements, fee components and bank reconciliation

Use `GET /v1/settlements` with `from`, `to`, `count` (1–100) and `skip`, or `GET /v1/settlements/{id}`. Settlement objects include `id`, integer `amount`, `status` (`created`, `processed`, `failed`), `fees`, `tax`, `utr` and `created_at`. Normal settlement-level fees/tax can be zero; these fields do not substitute for per-payment charges. [Settlement list API](https://razorpay.com/docs/api/settlements/fetch-all/), [Settlement APIs](https://razorpay.com/docs/api/settlements/)

For transaction allocation use `GET /v1/settlements/recon/combined?year=YYYY&month=M`, optionally `day`, with `count` (1–1000) and `skip`. Rows expose `entity_id`, `type` (payment/refund/transfer/adjustment), `amount`, `debit`, `credit`, `currency`, `fee`, `tax`, `settled`, `on_hold`, timestamps, `settlement_id`, `settlement_utr`, and related payment/order/dispute identifiers where populated. For payment rows, `payment_id` is null and `entity_id` identifies the payment. Preserve row debit/credit as provider-reported amounts. The reviewed API does not promise snapshot isolation across pages or specify the calendar filter timezone. Paginate completely and use overlapping re-import plus conflict detection. [Settlement recon API](https://razorpay.com/docs/api/settlements/fetch-recon/)

**Fee pitfall:** `payment.fee` includes GST; `payment.tax` is its GST component. Subtracting both from gross double-counts GST. For a payment fee of 118 and tax of 18, fee excluding tax is 100 and the total provider cost remains 118. These are provider transaction charges, separate from the platform's own merchant tax snapshot. [Payment entity](https://razorpay.com/docs/api/payments/entity/)

`settlement.processed` carries the settlement ID, amount, fees, tax, UTR and merchant account ID. The same page explicitly warns that processed is transfer initiation and does not guarantee credit has reached the bank. Use the UTR to match a bank statement, and retain a timing exception until bank evidence is present. [Settlement webhook](https://razorpay.com/docs/webhooks/settlements/)

Recommended import rules: scope identities by provider account and environment; deduplicate settlement IDs and recon `(type, entity_id, settlement_id)` identities; compare re-imports rather than silently replacing changed monetary data. Keep an immutable normalized row fingerprint and raise conflicts. Sum signed `credit - debit` for provider settlement allocation, retain adjustments separately, and compare the complete group with the settlement amount. Use provider allocation as evidence rather than assuming every settlement contains only this application's payments. Bank import identifiers/fingerprints, UTR, amount, currency and date matching are local design choices; the reviewed Payment Gateway APIs do not fetch the merchant's bank statement. Failed/pending transfers are not bank receipts. Direct Tuition Fees never enter platform revenue.

## Explicit integration gaps

- Confirm refund idempotency retention, replay after authentication-key rotation, and behavior after a rejected request with the live merchant account before relying on indefinite automatic retry. Do not rotate keys or create a new money operation merely to resolve ambiguity.
- Merchant credentials, account ID, funded refund reserve, enabled events and an accessible webhook endpoint remain external prerequisites. No live call was made for this research.
- Calendar timezone, historical recon corrections and merchant-specific settlement conventions require provider/account verification; retain import provenance and exceptions meanwhile.
- Financial document issuance still requires real merchant and tax configuration. An internal payment history record is not evidence that a compliant tax invoice has been issued.
