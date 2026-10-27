# Access Pass coupon rollout - 27 October 2026 IST

The owner requested discounted coupons and 100% off so ordinary verified users can test without payment. ADR-0010 extends the paid-only policy; free redemptions are separate non-cash coverage and never fabricated Razorpay capture, revenue or refunds. Both the ordinary preview and fictional payment sandbox have the coupon backend and UI.

## Tester instructions

Ordinary site: https://tutoring-marketplace-ravii-preview.netlify.app . Sign in with a verified account, create/select a usable adult Learner profile, open an available approved Tutor offer, and apply **BETA100** in Access Pass checkout. Review the original ₹599, 100% discount and ₹0 final amount, acknowledge the separate Tuition Fee terms and select **Redeem coupon · ₹0**. No card, UPI or Razorpay payment is required. Send an enquiry; the first eligible Tutor acceptance starts the 30-day Access Pass. Chat and Classes remain subject to current participant and safety permissions.

The initial bounded campaign is 100% off, **100 redemptions per environment**, at most once per account, expiring **29 October 2026 at 23:59 IST**. Ordinary and sandbox counters are independent. One fictional sandbox redemption was used for hosted acceptance; ordinary real accounts were not redeemed by the agent. Existing usable coverage or an unresolved paid purchase cannot be replaced by another coupon. A free pass without an eligible first acceptance expires after its own 72-hour matching window; no money was collected or refundable. `/payments` shows coupon history and current pass state.

Staff Finance offers Load/Create/Disable coupons after the existing FINANCE scope and MFA gate. Codes support integer 1-100% discounts, expiry and a total cap. A host operator bootstrapped only the bounded BETA100 campaign during the authorized deployment, recording an ACCESS_COUPON_CREATED audit with the owner request and operator reason. Routine HTTP staff actions still require MFA; owner login/password/MFA were not changed. The previously saved bootstrap owner credential was already invalid at the earlier Class Invitation rollout; current owner credential/MFA login is not claimed reverified here.

Paid checkout remains disabled on the ordinary preview. A partial discount can be quoted, but a nonzero balance still needs the configured, enabled payment provider. The isolated fictional sandbox retains Razorpay Test Mode. No live merchant mode, live payment, AWS resource, hosting upgrade or paid video service was enabled.

## Acceptance evidence

- Six real PostgreSQL/authenticated HTTP scenarios passed: full coupon without provider and no money facts; retry/idempotency, matching/activation/Connection/chat; atomic total capacity and FINANCE/MFA; invalid/future/expired/cancelled/one-use boundaries; partial discounted Order and capture; matching deadline equality and replacement with another code; normal production-mode accounts with paid checkout disabled. Production-mode evidence uses isolated fictional fixtures, never modifications to hosted evidence approval.
- Fourteen existing payment/activation regression scenarios passed (a combined earlier run reported 19 with the first five coupon scenarios). Eleven refund/finance regression scenarios passed. These preserve actual captured-balance refund limits, unknown-payment behavior and current activation rules.
- UI suite: **51 tests across 16 files passed**. API build/typecheck, UI typecheck and focused UI lint passed. Coupon acknowledgement is tied to the current purchase/recipient/code terms, removing an asynchronous checkbox reset race during explicit repurchase.
- Hosted sandbox mobile browser: applied BETA100, saw ₹0/no payment, redeemed without a purchase or Razorpay script, submitted enquiry, received fictional Tutor acceptance, observed active pass and sent chat. No mobile horizontal overflow. Screenshot was inspected; only fictional accounts were changed. Actual real-user redemption on the ordinary preview remains the owner's human check.
- Ordinary and sandbox health 200 and anonymous coupon history 401; ordinary checkout false, sandbox test checkout true; all API/worker/Caddy services active. Only RELEASE_ID changed in ordinary API/backup config; auth/database/SMTP/payment settings stayed equal to protected pre-rollout copies.

Sanitized evidence: [coupon rollout](evidence/access-pass-coupons-2026-10-27.json). API semantics: [coupons.md](../api/coupons.md).

## Backend rollout and operational limits

Backend release `coupons-20261027-d25043d1ab92`, implementation source `d25043d1ab92da2fae6e23d96928371335f89da5`. A portable API overlay on verified Class Invitation release `classes-20261027-50b4c92c6243`, reusing the previously verified Linux dependencies with matching package-lock. This is not a fresh full CI/Linux build claim. Twenty-one allowlisted JS/declaration/migration files were hashed, archive paths/types constrained, source compared to the committed branch, a real Linux import validated, and the derived 427-file manifest verified. Archive SHA256 `b7134ab0738f2da95771aadd77d7768252972b9292ec3ea6aa14e105352ce2b4`.

Migration 030 was applied separately to both databases after verifying the previous 29 migrations. New table DML was granted only to each application role, and SELECT to the ordinary independent backup role. Ordinary backup succeeded before migration and after promotion. No existing payment terms, captures or Tutor evidence were rewritten.

Initial ordinary startup briefly failed because the new nonsecret provenance JSON inherited root-only read permission. Correcting that one file to 0644 restored manifest verification and both services; installer now sets its permission explicitly. No verification bypass or financial DB rollback was used.

The operator network IP changed; a reviewed CloudFormation previous-template parameter update modified only the SSH Security Group without replacement to the new operator IPv4 /32. HTTPS, compute and teardown deadline were preserved. Expired local AWS authentication was renewed using aws login only after the owner's explicit confirmation; account identity was checked. No credential values were printed.

Existing VM stop remains **30 October 2026 at 00:23:31 IST**. Do not advertise testing availability past that deadline without an owner-approved extension. Older application releases lacking migration 030 cannot be blindly restarted against this schema. Use a compatible forward fix; full launch, regional restore, deployed rollback, merchant/legal/tax/Guardian approval gates remain separate.
