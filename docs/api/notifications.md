# Transactional notifications and preferences

Task 20 adds committed, minimal notification intents for Contact Requests, responses and deadlines, unread chat, verified capture, Access Pass activation, cancellation and refund outcomes. Domain-table triggers insert the versioned outbox record in the same transaction as the source event. Rollback cannot leave an orphan notice; source/channel uniqueness deduplicates replays. Existing pre-migration events are not retrospectively emailed.

## Use locally

Run local setup/migrations and `npm run dev`. Open **Notification preferences and updates** from `/account`, or `/notifications`. Optional enquiry, chat, availability and marketing preferences are separate; marketing starts off and there are no marketing campaigns. Financial/security service email cannot be disabled. Turning availability off also withdraws existing subscriptions for the verified account email; turning it on requires fresh purpose-specific signup and confirmation.

With `MAIL_TRANSPORT=capture`, email is saved only in `.local/mail` and inspectable at `/dev/inbox`. It is never sent to a real mailbox. Local UI and test records state this explicitly. Production requires SMTP and refuses a fake/capture sender, including dependency injection.

## HTTP boundary

All private endpoints require the verified account cookie. Writes require an allowed Origin and JSON. Unrelated accounts cannot select another recipient or inspect their history.

| Method/path | Behaviour |
| --- | --- |
| `GET /v1/me/notifications` | Latest 50 own delivery metadata records; no message body, destination or credentials. |
| `GET /v1/me/notification-preferences` | Versioned preferences, mandatory service-email policy. |
| `POST /v1/me/notification-preferences` | Four explicit booleans (`enquiry_email`, `chat_email`, `availability_email`, `marketing_email`) and `notice_version: notification-preferences-v1`. Extra fields, including `service_email`, are rejected. |
| `GET /v1/staff/notifications?reason=...` | Support scope, current staff MFA and audited 10–240-character purpose; latest 100 records prioritising unfinished/failed delivery. |
| `POST /v1/staff/notifications/:id/retries` | Audited `{reason}` requeues the existing logical job; never resends a completed/suppressed notice. Unknown/processing SMS must be reconciled first. |
| `POST /v1/staff/notifications/:id/provider-confirmations` | `{provider_reference, reason}` refetches the original Twilio `SM...` resource, verifies account, owner destination, alert UUID and operation reference, then records its outcome without sending a new SMS. |

Staff UI: `/staff/notifications`, linked from an MFA-enabled Support console. Provider acceptance is labelled separately from inbox/handset delivery or reading. Failed/configuration/unknown states remain inspectable, with bounded retry and explicit operator recovery.

## Delivery and privacy

The separate worker runs independent loops for auth mail, availability matching, payment/refund/reconciliation, deadlines and notifications. Slow settlement calls do not block notification polling. Jobs use `SKIP LOCKED`, 60-second leases and fenced updates; external I/O is outside database transactions. Email failures back off and become `FAILED` after five provider failures. Preference/availability deferrals do not consume that failure budget. A stable email Message-ID follows the logical job. SMTP is at-least-once: a crash after provider acceptance may duplicate transport delivery; this is not an exactly-once email guarantee.

Queued payloads contain IDs, audience, immutable template version and message sequence, never child aliases, chat text, learning goals, private documents or destination addresses. Addresses are resolved server-side immediately before delivery. Current blocks, account/Listing/evidence restrictions, Guardian consent, Connection grants and message read positions suppress stale interaction notices. Content stays behind authenticated private links. Availability additionally requires current confirmed purpose consent/generation/expiry, current optional preference and a currently eligible matching offer; the email includes an unsubscribe link. Withdrawal cancels queued retries. An already in-flight provider submission cannot be recalled.

`SENT` means accepted by the configured delivery service (or captured locally), not bank credit, inbox placement or confirmed handset delivery. Payment/refund templates instruct the payer to inspect current recorded facts rather than assert a stale financial outcome.

## Optional critical owner SMS

The original slice sends critical failed/review/insufficient-reserve refund alerts to the configured operations owner only. Task 25 adds [general critical operation alerts](./operations.md), verified owner email routing, an optional separately approved general SMS template and scoped safe recovery. It collects no student, child or payer phone number. External watchdog/backup automation and actual launch monitoring still require deployment/recovery setup.

Leave `CRITICAL_SMS_MODE=disabled` until production configuration is ready. The Twilio adapter requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, approved `TWILIO_ALERT_CONTENT_SID`, verified `SMS_OWNER_PHONE`, `SMS_OWNER_CONTACT_VERIFIED=true` and `SMS_DAILY_LIMIT` (default 5, allowed 1–20 attempts per UTC day). Template variables are **1: refund-operation reference**, **2: private staff-console URL**, **3: unique notification UUID**. These must appear in the approved template, including both references for later identity confirmation. No child/customer details enter the SMS. Budget reservations serialize concurrent workers and count uncertain attempts conservatively. Over-budget notices wait for audited operator retry after budget/configuration correction.

Timeouts, server failures, malformed successful responses and abandoned SMS leases become `UNKNOWN`; they are not blindly resent. A provider reference must be recovered from the original account and confirmed via read-only lookup. Known rejected attempts use bounded retry within the same budget. All credentials stay server-side; no live SMS was sent during implementation. Provider onboarding, Indian sender/template requirements, actual charges and a credentialed delivery smoke test remain launch dependencies.

The create/fetch resource and acceptance semantics follow the official [Twilio Message resource](https://www.twilio.com/docs/messaging/api/message-resource), checked 17 October 2026. Local contract tests cover uncertain provider responses and mismatched alert proof; they do not claim a credentialed provider test.

## Verification

`apps/api/test/notifications.test.ts` exercises the public APIs, committed real-PostgreSQL events and worker boundary with an isolated external sender: outage recovery, request replay, preferences, mandatory financial notices, chat read/block checks, verified availability unsubscribe, Support/MFA isolation, unknown-SMS reconciliation, Guardian withdrawal, production fake refusal and concurrent budget enforcement. Adapter tests cover malformed success, server uncertainty and unique-alert binding. UI/browser tests cover explicit preference saving, mandatory controls, persistence, mobile overflow and scoped staff monitoring. Final results are recorded on ticket 20.
