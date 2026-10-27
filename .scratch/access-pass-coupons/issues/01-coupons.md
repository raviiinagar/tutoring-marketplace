# Access Pass coupon checkout and non-cash coverage

Status: ready-for-agent
Dependencies: production checkout, paid activation, staff MFA (implemented)
Implementation: complete, 27 October 2026; ordinary and sandbox deployed.

Acceptance: staff campaign management; quote and server-authoritative redemption; normal user 100% discount without provider calls; discounted paid capture; concurrency, idempotence, expiry, caps, one-use and permission checks; matching/activation/chat regression; clear pricing/status and history; ordinary preview and sandbox rollout with evidence.

## Comments

Implementation in progress, 27 October 2026. Preserve existing unrelated workspace changes.

Completed: percentage and 100% coupons; FINANCE/MFA campaign management; immutable atomic redemption and exact discounted capture; free matching/activation and cancellation; normal production-mode account authority; clear price and coupon history. Six coupon API scenarios, fourteen existing payment scenarios, eleven refund/finance scenarios and 51 UI tests pass. Hosted fictional mobile journey passed through enquiry, acceptance, active Pass and chat without Razorpay or purchase. Ordinary BETA100 campaign provisioned for human testers; normal real-user redemption remains the owner's hands-on check. [Rollout evidence](../../../docs/ops/access-pass-coupons-2026-10-27.md).
