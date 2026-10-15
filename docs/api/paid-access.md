# Paid Access Pass and Connections

Task 15 connects verified captured payments to enquiries and first-acceptance activation. Tuition and any trial fee remain payable directly to Tutors. A Contact Request is an enquiry, not a lesson booking.

## Customer flow

1. Select a currently eligible offer and usable adult or Guardian-controlled Learner profile. Explicitly acknowledge the separate platform charge before hosted checkout. The server owns the price and payment authority; see [payment configuration](payments.md).
2. After verified capture, open or refresh the enquiry form. The payer can send up to five pending enquiries against the same funded purchase. Matching ends exactly 72 hours after the stored provider capture instant, regardless of webhook arrival time. There is no active 30-day period yet.
3. The first eligible Tutor acceptance, strictly before the request deadline, atomically fixes the Access Pass start and end, establishes the Connection and grants its adult participants contact/chat permission. `access-v1` lasts exactly 30 days. Concurrent later acceptances share that purchase and entitlement; they neither reset dates nor charge again.
4. `/payments` shows matching, active dates, expired access or financial review. Payment status refresh/focus rechecks enquiry eligibility without replacing a typed enquiry. `/requests`, `/tutor/requests` and `/connections` retain the existing private workflows.
5. Ordinary pass expiry stops new requests, while requests covered at submission remain eligible until their recorded deadline. Existing safe Connections continue. Explicit new checkout against a currently eligible offer/profile can purchase a new cycle after an activated pass expires; there is no automatic renewal. A retry using a historical purchase's original key returns that purchase, even after repurchase.

If the original Tutor/offer or Learner becomes unavailable during provider work, actual captured money remains recorded. The unavailable context cannot establish a Connection. During the unchanged matching window, the payer must explicitly choose another eligible offer/profile; the same purchase can cover it. An unmatched expired window, uncertain payment or financial review cannot authorize a replacement charge. Cancellation, no-match refund execution and coordinated refund races are task 17; the current software does not claim a refund has been initiated or received.

## Authority and transaction rules

The shared paid-access module verifies the purchase's CAPTURED status, immutable matching capture journal, provider environment, policy and lack of financial resolution hold. There is one PAYMENT entitlement per purchase, bound to the same payer. Database constraints and a trigger protect its capture identity and fixed activation interval. Only verified funding can create matching coverage, and only an eligible Tutor decision can activate it; there is no public grant/activation endpoint.

Commands serialize sorted adult participants, current beneficiary/Guardian/Tutor/offer authority, then purchase, entitlement and request transitions. Activation and grant creation commit with the decision, Connection, adult memberships and conversation; failure rolls back the whole operation. Future cancellation/refund commands must coordinate on that same purchase row. Provider calls remain outside database transactions.

Current roles, Guardian consent, evidence, account restrictions, blocks and Listing/Connection safety still govern each action. Acquisition revocation or financial review prevents new acquisitions without silently removing an established Connection's separate grant. Explicit grant revocation and current safety/consent restrictions deny established contacts and chat. Replaying a recorded decision cannot bypass these read checks.

Production admits PAYMENT coverage only when `test_only=false`. Fictional FIXTURE and provider-test coverage cannot authorize production enquiries, decisions, Connections, chat or safety evidence. Local isolated fixtures remain test tools, not real purchases.

## Interface additions and verification

`GET /v1/me/request-access` reports authoritative `can_request`, coverage status, purchase reference, fixed dates and test labeling. Owner purchase responses include `access: {status, starts_at, ends_at, test_only}`, `access_active` and `requires_alternative`. Financial history is readable by its owner even when a former checkout recipient is unavailable; hosted checkout options are independently rechecked and omitted when ineligible.

Public HTTP tests use real isolated PostgreSQL and a controlled external payment-provider adapter. They cover capture gating, fixed activation, concurrent Tutors, replay/restart, expiry and explicit repurchase, deadline equality, suspension during provider work, role withdrawal, financial review and production test-data isolation. UI adapter tests cover authoritative confirmation refresh, active dates and safe repurchase/uncertainty states. Browser regression uses isolated fictional coverage; it does not perform a credentialed Razorpay payment.

Live credentials, merchant/invoice/tax approval, a credentialed sandbox run, refunds and the remaining release gates are still required. Default local payments remain disabled.
