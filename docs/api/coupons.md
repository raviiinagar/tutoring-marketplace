# Access Pass coupons

ADR-0010 extends paid-only access with separate fully discounted, non-cash coverage. Existing Guardian, verified account, approved recipient, participant and safety boundaries apply. Ordinary users redeem on an eligible Tutor's page after choosing a usable Learner profile. Staff privileges are never required to redeem.

## Endpoints

All mutations require the existing exact Origin, JSON and session protections.

| Endpoint | Behavior |
| --- | --- |
| POST `/v1/me/coupons/quote` `{code}` | Advisory original/discount/final paise, percentage and expiry. Case-insensitive ASCII code. Rate limited. |
| POST `/v1/me/purchases` existing input plus optional `coupon_code` | Locks payer and recipient, verifies eligibility/current coverage, then locks campaign and commits its one-use reservation. Partial discount returns existing purchase response. Full discount returns `{purchase:null,promotion:...}`. No user-supplied amount. |
| GET `/v1/me/coupon-redemptions` | Own latest 50 redemption snapshots with current matching/active/expired/cancelled status. |
| POST `/v1/me/coupon-redemptions/:id/cancellation` `{}` | Own unused free pass only; serializes with acceptance, revokes future acquisition and cancels pending requests. No refund or restored coupon use. |
| GET `/v1/staff/coupons` | FINANCE scope and current MFA; codes, availability, usage cap/count, dates. |
| POST `/v1/staff/coupons` | FINANCE/MFA: code, integer percent_off 1-100, starts_at, expires_at (within next year), max_uses 1-100000, reason. Immutable terms; duplicate code conflicts. |
| POST `/v1/staff/coupons/:id/disable` `{reason}` | FINANCE/MFA; audited. Stops new reservations, preserves already committed passes/orders. |

Codes contain 4-32 ASCII letters/digits/underscore/hyphen, normalized uppercase. One redemption per account per campaign, one code per pass, no stacking. Discount is `floor(original_paise * percent_off / 100)`; the final positive balance is sent to Razorpay and verified against capture. Immutable invoice disclosures split the discounted amount proportionately using the confirmed original tax breakdown; partial refunds remain bounded by actual capture. A reserved partial checkout consumes a use even if not completed, because uncertain external money cannot safely release capacity.

100% discounts require no payment provider/config, checkout script, card/UPI, provider Order or journal capture. A COUPON entitlement references its zero-price redemption, has `captured_at=null`, and uses `issued_at` for the 72-hour first matching window. The first eligible acceptance fixes 30 days; retries and concurrent acceptances do not extend it. Deadline equality is expired. Existing safe Connections survive ordinary expiry. Active/matching coverage and unresolved paid purchases block replacement. Expired coverage can be replaced by an explicit different eligible code/manual purchase; the original code remains used.

Campaigns and coverage are environment-scoped. The ordinary hosted preview uses production auth/runtime protections on its isolated staging database, so real adult testers receive non-fixture coupon coverage; this does not enable paid checkout or imply live merchant readiness. The separate fictional sandbox retains test-only coverage. Full redemptions have visible history but never a paid receipt, refund or revenue. Personal exports include owned coupon terms; erasure revokes entitlement through the existing worker and retains the minimal immutable commercial history under finance retention. Recovery inventory guards archives predating migration 030.

An operator with host/database authority may bootstrap an explicitly bounded campaign during the authorized deployment, with an `ACCESS_COUPON_CREATED` audit record identifying the operator reason; no HTTP staff-MFA bypass exists. Routine campaign management uses the staff Finance UI.
