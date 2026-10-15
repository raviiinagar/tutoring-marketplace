# Hosted Access Pass checkout

Task 14 adds server-priced Razorpay Standard Checkout and durable captured-money accounting. Task 15 now connects confirmed purchases to [covered enquiries and first-acceptance activation](paid-access.md). Verified capture enables matching enquiries; the first eligible acceptance starts the fixed 30-day pass and grants a Connection. Refund execution, reconciliation/support tooling and production release checks remain tasks 17–19, 22 and 25–28. Keep live checkout disabled until those dependent release gates pass.

## Purchase and payment authority

`access-v1` is an immutable PostgreSQL policy: 59900 paise, INR, 30 access days and a 72-hour initial matching window. The customer total includes the configured tax breakdown; tuition and trial fees remain payable directly to Tutors. There is no recurring billing. Client-supplied amounts, currency, payer identity and payment-status flags are rejected by strict input validation.

Before a purchase or resumed hosted checkout, the server checks the current verified payer, usable owned Learner profile (including current Guardian authority/consent for a child), exact Listing revision, current Tutor/evidence/catalogue availability and adult account blocks/restrictions. An unavailable recipient cannot authorize checkout. Restricted verified adults can still inspect their own financial status; inspection cannot grant marketplace access.

One open purchase cycle per payer owns its policy, amount, provider account/mode, initial eligibility context and frozen merchant/tax/invoice disclosures. Concurrent submissions and changed retry keys reuse that cycle until an activated pass expires and the payer explicitly requests another purchase. The original request key always replays its historical cycle. An unavailable original recipient can still return owner financial history on retry, with hosted checkout omitted. A reservation commits before the external Order POST. An uncertain create outcome remains UNKNOWN (or CREATING after a crash), blocks replacement and is never blindly retried. A verified webhook can recover a lost local Order binding from the provider-fetched receipt. If no payment/event exists, an operator must reconcile the stable cycle receipt before any future replacement; a time-out or closing the browser is not proof of no charge. Operator reconciliation/replacement tooling is later work, not an automatic timeout reset.

Checkout callback verification computes HMAC-SHA256 from the **stored** Order ID and returned Payment ID, then fetches the provider payment and verifies identity, Order, amount and currency. This may show VERIFYING; it never writes a capture or activates access by trusting the browser. Only the raw-body-signed `payment.captured` event combined with provider-fetched captured/refunded state produces a capture journal fact.

The payment entity's `created_at` is payment creation, not capture time. The signed capture-event `created_at` is persisted as the provider capture-event instant, and the original matching deadline is that instant plus 72 hours. Callback-only verification waits for that event rather than substituting local receipt time. Provider production timestamp behavior must be checked in the credentialed sandbox contract run before live launch; no stronger timestamp precision is claimed. A late event preserves its original deadline and flags an expired window for resolution. It does not automatically execute a refund in task 14.

## Durable webhooks and money journal

Configure **POST `/v1/payments/razorpay/webhooks`**, subscribing to `payment.captured`, `payment.authorized` and `payment.failed`. This exact route alone accepts provider POSTs without browser Origin, authenticates an HMAC over the exact raw JSON body and requires `x-razorpay-event-id`. The limit is 64 KiB. Browser writes elsewhere retain strict Origin/JSON validation.

Acknowledgement (202) follows a committed inbox insert. The separate worker performs provider reads outside transactions, then locks inbox/purchase rows and commits immutable journal facts plus status together. Retry leases, bounded backoff and `SKIP LOCKED` support worker/process outage and concurrent delivery. Duplicate event IDs require identical body hashes; replay with different bytes conflicts. Different events for one Payment ID cannot duplicate its capture. Delayed failed/authorized events cannot demote confirmed money. Unsupported event families are acknowledged and recorded as IGNORED without retaining their payload.

Only whitelisted event/payment financial fields and a raw-body hash are retained, never raw card, bank, VPA, contact or acquirer payloads. Provider errors use fixed redacted codes. Unknown receipts remain UNMATCHED for reconciliation and cannot fund another purchase. Unexpected amounts/currency or excess capture are preserved as UNEXPECTED_CAPTURE journal facts with REVIEW/resolution status. No replacement or access is granted. Purchase commercial terms, capture deadlines, policies and journal entries have database immutability guards.

## API and UI

| Method/path | Behavior |
|---|---|
| GET `/v1/payments/policy` | Server price, duration/window, configuration availability and configured disclosures |
| POST `/v1/me/purchases` | `{request_key,listing_id,listing_revision,learner_id,policy_version}`; reserve/reuse purchase and create at most one Order |
| GET `/v1/me/purchases/current` | Current payer's stable open purchase reference |
| GET `/v1/me/purchases/:id` | Owner-only financial status, frozen disclosures, journal and currently permitted hosted checkout options |
| POST `/v1/me/purchases/:id/confirmation` | `{razorpay_order_id,razorpay_payment_id,razorpay_signature}`; signed callback plus provider verification |
| POST `/v1/payments/razorpay/webhooks` | Raw signed provider inbox; no account cookie authority |

Create/confirmation have per-session rate limits. Cookie sessions, strict schemas and cross-account ownership checks remain authoritative. Responses exclude provider secrets, private Tutor contacts, child details and other payer IDs.

The available Tutor's enquiry form shows checkout after selecting a usable Learner. `/payments`, linked from My account, recovers the existing purchase after reload/navigation. The UI shows price/disclosures before an explicit unchecked acknowledgement and Pay action. It loads Razorpay's official hosted script only on an authorized Pay/resume click; it never collects card details. Dismissal, failed attempts, network failure, UNKNOWN, VERIFYING and CAPTURED have distinct truthful copy. Only the server can confirm payment; uncertain purchases expose status refresh rather than a new purchase button. Test mode is labeled explicitly. Ordinary local development remains disabled without credentials.

## Configuration and rollout

`PAYMENT_MODE=disabled` is the default. For **Razorpay's actual test account**, explicitly set `PAYMENT_MODE=razorpay_test`, matching `RAZORPAY_KEY_ID=rzp_test_…`, `RAZORPAY_KEY_SECRET` and a separate `RAZORPAY_WEBHOOK_SECRET`. Configure automatic immediate capture in the provider dashboard and a reachable HTTPS webhook forwarded to the exact API route. Do not use the fictional secrets from tests. A publicly reachable tunnel/domain is an external setup step; do not expose the development mail inbox or staff tooling through an unrestricted tunnel.

Live mode requires production isolation, `PAYMENT_MODE=razorpay_live`, matching live keys, `PAYMENT_MERCHANT_NAME`, `PAYMENT_INVOICE_NOTICE`, integer `PAYMENT_BASE_PAISE` plus `PAYMENT_TAX_PAISE` totaling 59900, `RAZORPAY_AUTO_CAPTURE_CONFIRMED=true` and explicit `PAYMENT_LAUNCH_APPROVED=true`. These flags record operator confirmation, not automatic proof of legal/finance approval. Approved merchant/bank identity, real invoice/tax treatment and all dependent launch gates are required. VEER is the owner and is not assumed to be the merchant business name. Restart API and worker with the same configuration. A pending cycle is bound to its provider key ID; key/webhook-secret rotation needs a reconciliation/drain plan before retiring old verification credentials.

Tests run isolated PostgreSQL with a controlled external provider adapter. They exercise public HTTP and the same worker interface, including forged amounts/signatures, concurrent retries, callback loss, durable restart recovery, unknown attempts, expired capture, financial anomalies, ownership and unavailable supply. The Razorpay transport contract is exercised with a fake external fetch transport; this is **not** a credentialed Razorpay sandbox transaction. A real sandbox card/UPI test, capture-time contract check, raw webhook delivery/replay and provider dashboard capture configuration remain external verification dependencies.

Provider references checked 15 October 2026: [Standard Checkout and signatures](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [raw webhook validation and duplicate event IDs](https://razorpay.com/docs/webhooks/validate-test/), [Order creation](https://razorpay.com/docs/api/orders/create/), [payment entity](https://razorpay.com/docs/api/payments/entity/), [capture and out-of-order payment events](https://razorpay.com/docs/webhooks/payments/).
