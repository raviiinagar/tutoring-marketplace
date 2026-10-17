# Critical alerts and safe recovery

Task 25 adds `/staff/operations`, linked from the MFA staff console. Finance controls billing/financial recovery; Support controls delivery, worker, security and backup observations. Every inspection or command requires current staff MFA and an audited purpose. Public registration never grants these permissions. Private pages and APIs remain unindexed and uncached.

## Conditions and routing

The separate worker scans durable facts every 30 seconds. Heartbeats are persisted at most once per 15 seconds on success and on every uncaught loop error. No raw exception, message, learning requirement, identity document, destination, provider credential or webhook body enters the alert projection.

| Condition | Detection |
|---|---|
| Unknown payments | Creating, unknown or verifying purchase unchanged for at least five minutes. |
| Captured without timely activation | Captured, still-unreversed money past its original matching deadline without an activated entitlement. Matching before the deadline is normal and does not trigger this condition. |
| Refund failure/reserve | Failed/review refund or recorded insufficient reserve. Refunds unfinished for 15 minutes also raise a backlog condition. |
| Billing/reconciliation | Open financial exceptions other than normal pending bank evidence, repeated inbox errors/review, 15-minute inbox backlog and reconciliation review/backlog. |
| Delivery | Unfinished non-operations notification older than 15 minutes; failed/configuration/unknown deliveries; unexpired failed or five-minute-old account mail. |
| Worker | Three consecutive uncaught errors or a recorded heartbeat older than three minutes. Provider failures caught inside business modules are detected through their durable operation states. |
| Security | Recent staff authenticator recovery (24-hour inspection window), or an unhealthy/stale scoped security observation. This is not a general intrusion-detection system. |
| Webhook/backup | Explicit unhealthy observations or expired evidence. Production also raises missing webhook evidence when payments are configured, and missing backup evidence. |

One open episode exists per condition/scope. Repeated scans update its count; recovery closes that episode. A later recurrence gets a new reference. Counts describe affected records and do not expose their private payloads. A healthy health observation does not resolve unrelated payment, reserve or worker facts.

Set `OPERATIONS_OWNER_USER_ID` to the UUID of an existing active, verified staff account. The owner should have SUPPORT and FINANCE scopes so both alert families can route. The configured account's verified email is resolved immediately before delivery and permissions are checked again. The console shows **CONFIG_REQUIRED** for an absent, disabled, unverified or wrongly scoped owner; configuration is not silently invented from sample accounts. Existing operator instructions are in [staff setup](./staff.md).

Alerts enqueue mandatory minimal owner email through the durable notification outbox, independently of human support hours. Development captures mail locally. No real owner address, credentials or external delivery was provisioned during implementation. One logical notice is queued per episode/recipient/channel. A new owner configuration may route an existing open episode to its newly authorized recipient. If a condition resolves or the owner loses access before send, the queued alert is suppressed.

Optional general critical SMS requires the existing verified owner-phone/Twilio configuration **and a separate approved `OPERATIONS_SMS_CONTENT_SID`**. It must describe a general platform condition, with variables 1 = alert reference, 2 = private operations-console URL, 3 = unique notification UUID. The refund-specific template is not reused for security/backup alerts. Both alert families share the existing conservative daily SMS budget. Unknown SMS outcomes require original-provider confirmation; they are never blindly resent. See [notification delivery](./notifications.md).

## Health evidence and limits

`POST /v1/staff/operations/observations` accepts a UUID `request_key`, `kind: WEBHOOK_DELIVERY | BACKUP | SECURITY`, `healthy`, ISO `observed_at`, an 8–160-character opaque `evidence_reference`, and `reason`. Finance owns webhook observations; Support owns backup/security observations. Timestamps must be current and not in the future. Webhook/security evidence expires 15 minutes after observation; backup evidence expires after 24 hours. Command retries preserve the original observation and do not refresh its age. Missing development observations are not presented as healthy.

These are scoped operator attestations backed by an evidence reference, not automatic queries to a provider dashboard or proof that a backup was created. Actual backup/export scheduling, durable storage, independent watchdog integration and restore proof belong to deployment/recovery task 26. Keep evidence references opaque; put no secrets or document contents in them or reasons.

The console shows the last completed monitor scan and warns after two minutes without a recent scan. A stopped application/worker, unavailable database or unavailable shared mail service cannot reliably deliver an alert through that same failed infrastructure. Independent external uptime/backup monitoring and a verified out-of-band route remain launch dependencies. This implementation does not certify a production RPO/RTO or 24-hour human response.

## Checkout control

Task 26 adds an independent recovery hold: ordinary checkout resume cannot bypass it. Finance/MFA must first release a privacy-complete recovery using fresh provider reconciliation and an audited refund/bank review; a separate checkout command is still required afterwards. `/staff/operations` displays this review. Recovery decisions appear only in their actor's personal-data export, without fingerprints. Follow the [deployment/recovery runbook](../ops/pilot-deployment-recovery.md).

Finance uses `POST /v1/staff/operations/checkout` with `{request_key,revision,paused,reason}`. The database control survives restart; stale revisions and conflicting key reuse return 409. Same-command retries return the original correlation/result. This is an explicit operator control, not automatic checkout enablement when an alert disappears.

Pausing prevents new purchase reservations and stops returning hosted checkout options, including for existing ready Orders. Payment-policy and request-access projections reflect the pause. Original purchase-key retries still return existing status. Existing capture confirmation, webhook processing, refunds, history and established communication continue; no money record is removed. Already reserved provider requests or an already opened provider window may complete, so reconciliation must continue during a pause. The flag cannot remotely recall a provider window or substitute for disabling a compromised merchant credential at the provider.

## Durable operations and replay

`GET /v1/staff/operations?scope=SUPPORT|FINANCE&reason=...` returns up to 100 unfinished operations, prioritizing failure/review, plus scoped alerts, health observations, recent recovery commands, routing state and scan time. Records contain opaque references, attempts, state, queue/lease times and the allowed recovery mode. Other case-specific work, including privacy jobs, retains its existing scoped console.

`POST /v1/staff/operations/replays` accepts `{request_key,kind,id,reason}`. Supported kinds are NOTIFICATION, AUTH_MAIL, PAYMENT_EVENT, REFUND and RECONCILIATION. Recovery of notifications/refunds/reconciliation delegates to their existing business commands. Payment-event replay schedules the original validated inbox record for provider refetch; it never posts a replacement charge. Unknown purchase creation stays in manual provider reconciliation rather than repeating an Order POST. Expired verification mail, active leases, review-only financial events and uncertain SMS cannot be forcibly replayed here.

Recovery receipts are actor/key/target-bound, leased and correlated with audit records. Repeated completed commands return their original result. If scheduling succeeds but its acknowledgement fails, a later retry can recognize the original operation's terminal state, complete the same receipt and report `scheduled: false`. No new financial operation is invented. Leases fence scheduling; business-key uniqueness, original purchase locks and immutable journals enforce one business effect under repeated worker delivery. SMTP remains at-least-once transport: a crash after provider acceptance can duplicate an email even while the logical notice is unique.

Minimal owned staff command/replay/observation metadata is included in privacy exports without fingerprints or lease secrets. Historical operator references remain audit/financial accountability records under the existing retention and exception policy; disabling/deleting a configured owner prevents future alert delivery to that account.

## Verification and operator use

Use fictional isolated fixtures to test outages and recovery. Integration coverage includes scope/MFA denial, versioned pause/retry, original-purchase preservation, out-of-hours email deduplication, stale observations, provider outage and duplicate event replay, notification dead-letter recovery, reserve failure and a real PostgreSQL-injected acknowledgement outage after scheduling. UI/browser checks cover purpose gating, command results, private indexing, mobile overflow and access revocation. Relevant payment, refund, Finance, notification and privacy regressions are recorded on ticket 25.

For a real incident: inspect the correct scope with a case reference, pause unsafe new checkout if appropriate, restore the failed dependency or funded reserve, reconcile uncertain provider outcomes, replay only the original eligible operation, and inspect its recorded result. Resume checkout deliberately after reconciliation. Never edit immutable money history or restore an old financial database as an application rollback.
