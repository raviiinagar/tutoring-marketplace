# 18: Review refunds after connection and reconcile chargebacks

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 13 — Block communication and investigate safety reports; 17 — Cancel unactivated purchases and refund unmatched payments

**What to build:** A payer raises a post-connection refund case and authorised finance staff record an outcome while preventing excess reversal across refunds and chargebacks.

## Acceptance criteria

- [x] Cases record reason, approver, amount, provider references and permission-limited audit history.
- [x] Full refunds revoke future acquisition rights and cancel outstanding unconnected requests; established conversations follow current safety policy.
- [x] Partial adjustments explicitly record access treatment; no silent prorating or historical payment overwrite.
- [x] Pending/completed refunds and chargebacks are reconciled against captured funds, including duplicate and out-of-order events.
- [x] Tests cover concurrent partial/full intents, overlapping chargebacks, excess capture compensation and unauthorised approval.

## Verification evidence

Owner-only encrypted refund cases and Finance/MFA approval decisions record amount, reason, approver and explicit KEEP/REVOKE_FUTURE treatment. Purchase serialization bounds concurrent partial/full reservations; cumulative full recovery, including partial chargebacks, requires revocation of acquisition and pending enquiries. Existing authorised conversation grants remain subject to current safety checks.

Signed durable refund/dispute events are normalized without contact/card payloads, refetched using bound provider credentials and deduplicated by financial identity. Unknown refund outcomes can complete from verified provider facts. Unresolved disputes reserve exposure; actual chargeback debits are immutable, while overlapping/excess recovery and changed facts enter the Finance exception queue. Unexpected captures create separate refund liabilities without replacing the original capture. Production live configuration now requires the verified provider account ID.

Verification: five API scenarios passed in `.local/task18-api.log`; two additional provider-webhook/cumulative-recovery regressions passed in `.local/task18-recovery-verified.log`. All 22 UI tests passed, including nested-enquiry submission isolation; root typecheck and build passed (`.local/task18-types.log`, `.local/task18-build.log`). Provider facts came from fictional external fixtures with real isolated PostgreSQL. Migration 019 is additive. Real merchant/dispute capabilities, configured event delivery, reserve funding and credentialed verification remain launch dependencies.

## Comments


