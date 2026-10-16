# Empty-category availability alerts

Implemented for task 09 on 12 October 2026. Browsing and this optional alert are free. They do not create an account, Access Pass, payment or Contact Request.

## Test locally

1. Open `/tutors` and select a Learning Domain or Subject with no available offers. Apply filters.
2. Enter a fictional adult email, confirm ownership/adult status and explicitly consent to one availability alert within 90 days. Both checkboxes start unchecked.
3. Select **Notify me when available**, then **Open captured availability email**. Local emails are captured at `/dev/inbox`, not delivered to a real inbox.
4. Open the availability verification link and explicitly confirm it. A GET does not activate anything. Confirmation expires after 15 minutes and is single-use; link tokens are removed from the address bar.
5. The unsubscribe link in the same email works before or after confirmation. It clears the encrypted contact and cancels queued confirmation mail and pending notification intents. An already in-flight email cannot be recalled, but withdrawn confirmation tokens no longer work.
6. Publish an approved exact matching offer through the Tutor/Trust flow. The worker checks due subscriptions and persists one pending notification intent for that subscription generation. Task 20 now delivers that intent through the notification outbox after rechecking current eligible supply and consent, with retries, unsubscribe and operational status. See [notifications](notifications.md).

## API

| Method/path | Behaviour |
| --- | --- |
| `GET /v1/availability/policy` | Versioned purpose-specific consent notice; no marketing consent. |
| `POST /v1/availability/subscriptions` | Accepts email, selection, explicit `consent: true`, `adult_confirmed: true` and `consent_version: availability-v1`. Returns generic 202 for eligible/suppressed signups. Returns 409 if matching supply is already available. |
| `POST /v1/availability/confirmations` | Accepts `{token}`; changes a valid pending subscription to active for up to 90 days. |
| `POST /v1/availability/unsubscriptions` | Accepts `{token}`; idempotent generic result for syntactically valid tokens. |

All writes require allowed Origin and JSON. Selection contains exact offer filters: domain, Subject, Learner Level, Curriculum, Exam Track, Teaching Language, rate unit and optional integer-paise price bounds. At least domain or Subject is required; prices require a rate unit. Pagination fields, unknown properties, inactive terms and incompatible domain selections are rejected. Supply checks traverse later pages when age filtering leaves an earlier page empty.

The server normalizes email, stores its keyed hash for deduplication and encrypts the delivery address and unsubscribe token. Verification/unsubscribe lookup uses token hashes; confirmation email payloads are encrypted in the durable outbox. Audits record subscription ID and purpose/version, without address, filters or secret tokens. Guests have a separate outbox owner foreign key and never become unverified account records.

Signup limits are 20/IP/hour and 3/normalized-email/hour, persisted in PostgreSQL; confirmation and withdrawal each allow 30/IP/15 minutes. A normalized email/filter pair has one record, protected by a transaction/advisory lock. Pending duplicates do not resend or rotate tokens; active duplicates do not silently renew consent. A withdrawn or expired signup explicitly starts a new generation, and old links cannot withdraw it. Ten live subscriptions per email bounds fanout; suppressed signups use the same generic response.

The worker claims due subscriptions with row locks and `SKIP LOCKED`. It uses exact-offer discovery and rechecks current locked Listing/profile/account/evidence eligibility and filter values before creating an intent. One intent per subscription generation is enforced by a unique constraint. Withdrawal and intent creation serialize on the subscription row. Pending and active expiry clear encrypted contacts and cancel pending intents; minimal hashed consent metadata remains for later task-23 retention/deletion policy integration. Matching is polled every minute, not a guarantee of immediate notification or continuing availability.

Production dependencies remain real SMTP/sender-domain delivery verification, approved privacy/retention notice and operational worker monitoring. The adult ownership declaration is a scoped signup restriction; it is not an identity verification adapter or authorization to collect child information. There is no marketing subscription, automatic charge or payment bypass in this feature.
