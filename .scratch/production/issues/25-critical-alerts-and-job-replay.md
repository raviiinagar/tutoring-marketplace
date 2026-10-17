# 25: Detect critical failures and replay durable work safely

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 19 — Inspect receipts and reconcile payments to settlements; 20 — Deliver transactional notifications with preferences; 22 — Resolve support cases and appeals through scoped actions

**What to build:** The owner sees unhealthy payment/notification jobs and critical security/backup conditions, receives alerts and can perform audited safe recovery.

## Acceptance criteria

- [x] Alerts cover unknown payments, capture without eligible activation, refund reserve failures, webhook disablement, queue age and repeated errors.
- [x] Critical alert routing applies outside human support hours; secrets and message/document content are redacted.
- [x] Dead-letter and durable-operation views support authorised replay with correlation IDs and one business effect.
- [x] Checkout can be disabled through a controlled flag during unsafe billing/reconciliation conditions without losing records.
- [x] Tests inject worker/provider outages, duplicate replay and unauthorised recovery attempts.

## Verification evidence

Implemented on 17 October 2026 using the TDD and codebase-design skills. `/staff/operations` provides separate FINANCE and SUPPORT areas with active staff MFA and an audited purpose. The separate worker scans durable facts every 30 seconds, persists bounded heartbeats and tracks redacted alert episodes. Conditions cover unknown payments, unreversed captured money past its original matching deadline without activation, insufficient reserve/refund failure, financial exceptions, inbox/refund/reconciliation backlog, notification/auth-mail failure, repeated worker errors, stale workers, recent staff authenticator recovery and scoped security/webhook/backup observations. Duplicate scans update one open episode; observed recovery resolves it without modifying underlying money facts.

Critical routing runs independently of published human-support hours. An explicitly configured active verified owner with the relevant current staff scopes receives minimal mandatory email through the durable notification outbox. Optional general SMS requires its own approved template and shares the existing conservative budget/unknown-result rules; refund-specific wording is not reused. No credentials, document/message content, child data or provider error payloads enter alert projections or bodies. An unconfigured/disabled/unverified owner is visibly CONFIG_REQUIRED rather than silently replaced with a sample identity.

The durable-operation view shows up to 100 prioritized records with opaque IDs, attempts, queue/lease times and the permitted recovery mode. Actor/key/target-bound replay receipts retain one correlation and delegate existing notification/refund/reconciliation commands. Validated payment inbox events are refetched under their existing purchase locks; unknown Order creation remains manual reconciliation. Active leases, uncertain SMS, expired verification and review-only financial facts cannot be forcibly replayed. Recovery also recognizes an already completed original operation when command acknowledgement storage failed, without posting a replacement charge. SMTP transport remains at-least-once, not an exactly-once delivery promise.

Finance's revision-checked durable checkout control pauses new reservations and returned hosted-checkout options while preserving original purchase-key status retries, webhook/capture processing, refunds and history. Stale revisions/key conflicts reject changes; duplicate commands return the original correlation/result. Already in-flight provider work is still reconciled. Observation commands require current scoped evidence, reject future/stale timestamps and retain original observation age on retry. Webhook/security evidence expires in 15 minutes and backup evidence in 24 hours; they are operator attestations, not invented cloud backup/provider health. Minimal owned staff operations metadata joins privacy exports without scheduling secrets.

All 57 relevant API regression scenarios passed with zero failures (`.local/task25-api-regression.log`): seven operations scenarios plus payments, refunds, Finance, reconciliation, notifications/adapter and privacy regressions. The tests include out-of-hours alert deduplication, provider and notification outages, scope/MFA rejection, mature unmatched capture/reserve conditions, unknown SMS safety, template isolation, conflicting/duplicate recovery, and a real isolated PostgreSQL trigger fault after scheduling but before acknowledgement. The acknowledgement tracer first returned 404 after its event completed (`.local/task25-replay-ack-red.log`) and then safely recovered the original receipt with `scheduled: false` and one capture (`.local/task25-replay-ack-green.log`). External sends use isolated fictional adapters/capture only.

All 36 UI tests passed (`.local/task25-ui-final.log`); the new test verifies purpose/MFA gates, routing configuration, versioned checkout commands and report removal after access expiry. Production build and all workspace/UI typechecks passed (`.local/task25-build-final.log`, `.local/task25-typecheck-verified.log`). The isolated Edge browser journey passed verified signup, scoped staff enrollment, purpose entry, pause/resume, a durable unhealthy webhook observation observed by the actual worker, private noindex/no-store, mobile overflow and access revocation (`.local/task25-browser-final.log`, `.local/task25-operations-desktop.png`, `.local/task25-operations-mobile.png`). Its initial final assertion was corrected to the actual denied-access message; the authorization behaviour remained unchanged.

Migration 027 applied online without reset: 28 users, zero purchases and zero captured money were preserved (`.local/task25-local-migration.log`). The development PostgreSQL shutdown checkpointed cleanly before restarting the application/worker. Final local smoke verifies migration 027, ten worker heartbeats, a recent completed monitor scan, existing checkout control unchanged, public health/policy 200, private operations 401, unauthorized control 401 without mutation, and the UI's noindex/no-store shell (`.local/task25-final-smoke.log`). The updated localhost stack remains available. Owner credentials, payment settings, retention approval and operational health evidence were not fabricated or enabled.

Guide: `docs/api/operations.md`. Actual verified owner routing/contact, approved SMS template/budget and delivery smoke test remain configuration dependencies. Independent watchdog/out-of-band monitoring, automated verified backup/provider observations, recovery storage and measured restore/deployment evidence belong to ticket 26. A failed shared database or completely stopped application cannot deliver its own alert through that failed infrastructure. This slice does not claim a live launch, automated backups, production RPO/RTO or 24-hour human support.

## Comments


