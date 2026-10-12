# 09: Subscribe to availability in an empty category

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 08 — Find eligible Tutors and inspect public offers

**What to build:** A visitor sees honest empty-category information and can optionally subscribe to relevant Tutor availability without being charged.

## Acceptance criteria

- [x] No eligible Tutor means no enabled paid request/checkout for that category.
- [x] Signup captures the requested offer dimensions and explicit availability-notification consent with abuse controls.
- [x] Verification and unsubscribe flows work; subscriptions are not silently repurposed as marketing consent.
- [x] Relevant approved supply creates a durable notification intent without fabricating availability.
- [x] Tests prove empty-state accuracy, duplicate signup handling, consent withdrawal and no checkout bypass.

## Verification evidence

Implemented on 12 October 2026:

- Empty public search offers an optional adult-owned email signup after choosing a Learning Domain or Subject. Exact filter dimensions, price unit/range and explicit unchecked purpose-specific consent are captured. Browsing and alerts are free; no enabled paid request/checkout is added. Guests do not become account records or receive sessions, Access Passes or payment authority.
- Migration 009 stores keyed email deduplication hashes, canonical filter keys, encrypted contact data, consent version, lifecycle/deadlines and generations. Anonymous confirmation mail uses a separate outbox owner foreign key, preserving existing account-mail constraints. Raw link tokens appear only in encrypted mail/contact payloads and private development capture; audit metadata excludes email, filters and tokens.
- Signup requires current empty supply, strict active taxonomy and validated same-offer dimensions. Limits persist in PostgreSQL: 20/IP/hour, 3/normalized-email/hour and ten live subscriptions per email; confirmation/withdrawal each allow 30/IP/15 minutes. Email/filter deduplication and advisory locks prevent simultaneous duplicate confirmations. Active duplicates do not renew consent; renewed withdrawn/expired subscriptions rotate tokens and start a new generation.
- Fifteen-minute single-use verification activates one optional alert for up to 90 days. Explicit POST buttons prevent email-link GETs from changing consent; fragment tokens are removed from the browser address bar. Idempotent unsubscribe invalidates pending verification, clears contact data and cancels queued mail/intents. An already in-flight email cannot be recalled. Expiry also clears encrypted contacts; task 23 remains responsible for approved retention/deletion of historical consent/outbox records.
- The worker uses durable subscription rows, due times, row locks and SKIP LOCKED. It traverses discovery pages and rechecks locked current Listing eligibility and filter values before committing one notification intent per generation. Pause, wrong Subject/Exam combination and price mismatch do not match. Withdrawal and matching serialize on the subscription row. Intent creation is complete; actual availability-alert delivery, final eligibility revalidation, retries and monitoring remain task 20, as specified by this ticket's intent boundary.
- All 62 current API tests have passing evidence: the regression run passed all 54 existing tests and five then-present new tests, with two new fixture failures; after fixes and the additional cap test, the complete eight-test availability suite passed in one final run. The fixes selected the current pending confirmation instead of an older outbox item, assigned deterministic fixture IDs before review foreign keys existed and used isolated database fixture copies to avoid unrelated request limits. No failed product assertion remains. New tests cover strict consent/filter/privacy rules, captured mail, account/payment exclusion, duplicate races, exact expiry, withdrawal/token rotation, same-offer eligibility and current price checks, empty projected-page traversal, worker races and email fanout caps.
- Nine UI tests passed. All eight Edge browser journeys passed together (6.2 minutes), including mobile anonymous signup, captured confirmation, fragment removal, unsubscribe, existing accounts, catalogue, discovery, Guardian, staff and Tutor flows. A 390px local screenshot was inspected and showed no horizontal overflow.
- Root build/typecheck passed; the API build was repeated after the final worker cap change. Migration 009 was applied to the existing local database and the development stack restarted successfully on ports 3000/4000/5433. Browser fixture ports stopped. Local environment/database/mail/screenshots/logs remain ignored.

API semantics, testing steps and delivery limitations: [availability guide](../../../docs/api/availability.md). Real sender-domain/SMTP verification, approved privacy/retention notices and operational worker monitoring remain release dependencies. No marketing, payment, Contact Request or child-data authorization is inferred from this feature.

## Comments


