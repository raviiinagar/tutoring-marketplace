# 20: Deliver transactional notifications with preferences

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 09 — Subscribe to availability in an empty category; 12 — Send durable text messages and recover after reconnect; 17 — Cancel unactivated purchases and refund unmatched payments

**What to build:** Users receive verified service email and configured critical SMS, while preferences, availability consent and durable retry preserve reliable delivery.

## Acceptance criteria

- [x] Committed requests, messages, access and refund events enqueue durable minimal notification payloads.
- [x] Template versions and preferences distinguish mandatory service messages, optional availability notices and marketing.
- [x] Delivery attempts deduplicate logically, retry failures and display operator-visible pending/failed states.
- [x] Notifications avoid sensitive child details, message bodies and private evidence; provider keys stay server-side.
- [x] Tests simulate provider outages, duplicate events, unsubscribe and preference changes; production cannot use a fake sender.

## Verification evidence

Implemented atomic, minimal source-event hooks and immutable `service-v1` templates for requests/responses/deadlines, unread chat, captures, activation, cancellation and refund decisions/progress. Logical source/channel keys deduplicate replays; leased delivery records retain attempts and fenced outcomes. SMTP uses stable Message-ID and bounded retry, with at-least-once transport semantics explicitly documented.

Verified adults manage versioned enquiry/chat/availability/marketing preferences at `/notifications`. Financial/security email remains mandatory; marketing starts off and no campaigns are sent. Turning availability off withdraws existing own-email subscriptions. Availability delivery rechecks consent, generation, expiry and current matching supply, includes unsubscribe, and cannot create paid access or a request.

Current Guardian consent, participant safety/grants, account state and chat read positions are checked before interaction delivery. Payloads and operator views exclude child aliases, learning goals, message text, evidence, addresses and keys. Local email capture is clearly labelled; production refuses capture/fake delivery.

Support/MFA staff inspect pending/failed/configuration/unknown states and audit retries at `/staff/notifications`. Configured critical refund SMS goes only to the verified operations owner; no child/student phone collection. Daily reservations serialize send attempts. Unknown SMS and abandoned leases require original-provider confirmation before resend; provider lookup binds the account, destination, operation and alert UUID. Provider acceptance does not claim bank credit, inbox placement or handset delivery.

Task-specific verification: all eight real-PostgreSQL/API/worker scenarios passed (`.local/task20-full-verified.log`), external-adapter contract passed (`.local/task20-adapter-green.log`), all 24 UI tests passed (`.local/task20-ui-final.log`), all nine browser journeys passed including preference persistence/mobile overflow and scoped staff delivery access (`.local/tasks16-20-browser.log`). Root production build and all workspace/UI typechecks passed (`.local/task20-final-build.log`, `.local/task20-all-types-verified.log`). The owner database has all 22 migrations and retains its 28 existing accounts and one Listing (`.local/tasks16-20-local-verified.log`); no reset or credential change occurred.

Broader regression exposed two fixture assumptions: the production photo test needed SMTP configuration to reach its intended asset-isolation assertion, and a financial worker test must wait for its own operation rather than assume the first global due job belongs to it. The corrected photo case and all seven financial scenarios passed (`.local/task20-production-photo-verified.log`, `.local/tasks16-20-finance-verified.log`). The broad run completed 143 API scenarios: 141 passed on that run and these two previously loaded fixture versions failed (`.local/tasks16-20-regression.log`). Both were corrected and verified by the subsequent photo rerun and full seven-scenario finance rerun. All 143 distinct API scenarios are covered by passing results across those runs; the initial `npm test` command itself is not claimed as a green single run. UI verification was run separately because that initial API exit prevented its chained UI command. No unresolved regression remains.

A money-display correction separates unexpected foreign-currency capture facts from INR summary totals while preserving their actual currency in history/refunds. Its public regression passed (`.local/task20-currency-green.log`).

External dependencies remain actual SMTP sender/domain and delivery verification; optional SMS provider account, approved sender/template and verified owner contact/budget; real payment merchant/provider credentials and finance setup. No real payment, SMTP email or SMS was sent by these tests. Full security/backup alerting and launch monitoring remain later operations work. See [notification setup and API](../../../docs/api/notifications.md).

## Comments


