# 18: Review refunds after connection and reconcile chargebacks

Status: ready-for-agent
Type: task
Blocked by: 13 — Block communication and investigate safety reports; 17 — Cancel unactivated purchases and refund unmatched payments

**What to build:** A payer raises a post-connection refund case and authorised finance staff record an outcome while preventing excess reversal across refunds and chargebacks.

## Acceptance criteria

- [ ] Cases record reason, approver, amount, provider references and permission-limited audit history.
- [ ] Full refunds revoke future acquisition rights and cancel outstanding unconnected requests; established conversations follow current safety policy.
- [ ] Partial adjustments explicitly record access treatment; no silent prorating or historical payment overwrite.
- [ ] Pending/completed refunds and chargebacks are reconciled against captured funds, including duplicate and out-of-order events.
- [ ] Tests cover concurrent partial/full intents, overlapping chargebacks, excess capture compensation and unauthorised approval.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


