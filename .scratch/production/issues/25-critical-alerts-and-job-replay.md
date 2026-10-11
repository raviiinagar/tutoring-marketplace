# 25: Detect critical failures and replay durable work safely

Status: ready-for-agent
Type: task
Blocked by: 19 — Inspect receipts and reconcile payments to settlements; 20 — Deliver transactional notifications with preferences; 22 — Resolve support cases and appeals through scoped actions

**What to build:** The owner sees unhealthy payment/notification jobs and critical security/backup conditions, receives alerts and can perform audited safe recovery.

## Acceptance criteria

- [ ] Alerts cover unknown payments, capture without eligible activation, refund reserve failures, webhook disablement, queue age and repeated errors.
- [ ] Critical alert routing applies outside human support hours; secrets and message/document content are redacted.
- [ ] Dead-letter and durable-operation views support authorised replay with correlation IDs and one business effect.
- [ ] Checkout can be disabled through a controlled flag during unsafe billing/reconciliation conditions without losing records.
- [ ] Tests inject worker/provider outages, duplicate replay and unauthorised recovery attempts.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


