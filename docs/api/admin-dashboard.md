# Unified administration and anonymous audience observations

The existing `/staff` entry is now the Admin dashboard. All scoped tools retain their routes, share an admin sidebar/header and require the existing account/staff MFA session checks. No public account can grant itself staff access. The header can lock staff access without signing out the normal account. FINANCE controls finance/coupon aggregates; SUPPORT controls the private account directory. Existing Trust, Support, Privacy, Finance, Operations and Catalogue command boundaries remain authoritative.

## Reporting

`GET /v1/staff/admin/overview?days=7|30|90` requires enabled staff assignment and active MFA bound to its ordinary account session. Reports use IST calendar days through the server observation instant. Read auditing records the actor, selected period and aggregate-report purpose. It never stores directory search text or credentials.

- Audience: all registered/verified accounts, new accounts in the period, successful SESSION_CREATED login events, distinct signed-in accounts and currently valid sessions. Deleted-account tombstones are excluded from account/login cohorts. Valid sessions do not prove somebody is online. Accounts include staff and unverified signups, not just paying customers.
- Enquiries: submitted/accepted in the creation cohort, plus current unexpired pending requests; current Learner/withdrawal/deletion exclusions follow the marketplace reporting rules. Existing test/live entitlement mode is respected.
- FINANCE only: expected actual captures by original capture timestamp, unexpected captures separately, provider refund facts by journal recording time, coupon reservations and zero-price redemptions. Coupon uses can include pending discounted checkouts; full coupons never become captured revenue. Tuition is excluded.
- Current review queues, assigned support-case scopes, open operational alert groups, worker signals and redacted event labels. The activity stream carries no actor contact, evidence, token or note payload. It is latest recorded marketplace activity, not a date-filtered cohort.

`POST /v1/staff/admin/accounts/search` accepts `{query,cursor?}`. SUPPORT and MFA required; query is a literal case-insensitive name/email substring, at most 80 characters. Returns at most 25 owned-environment account records ordered by creation instant and UUID, with a stable next cursor. Fields are name/email, verification/status, public account roles, join and last successful-login timestamps. No password/session hashes, OTPs, tokens or private Learner/evidence content. Search is POST to avoid putting contact values into URLs, and the audit records only whether a filter was used. Deletion tombstones are excluded. There are no new account mutation or staff-assignment endpoints.

## Anonymous public audience measurement

`POST /v1/public/traffic` accepts only `{event_id:UUID,session_id:UUID,page:HOME|BROWSE|TUTOR|CATEGORY|SIGN_IN|SIGN_UP}`. Existing exact Origin/JSON checks and a PostgreSQL-backed hashed-IP rate limit apply. No client timestamp is accepted. Retry UUID/fingerprint receipt conflicts return 409; concurrent retries count one page observation and concurrent views of one session count one daily visit.

The client observes public route transitions after hydration. It excludes all staff/account/chat/child/private/recovery/verification routes. Only a fixed page category is sent: no raw URL, route parameters, query/hash, referrer, identity, evidence or child information. Requests omit cookies. Browser DNT and Global Privacy Control suppress observations; blocked sessionStorage/network failures leave browsing usable. No third-party analytics provider, persistent cross-site ID or fingerprinting.

SessionStorage carries a random first-party tab-session ID which rotates after 30 minutes of observed inactivity; refresh/navigation have fresh event IDs. Browser tab behavior, automated callers, opt-outs and blocking affect counts. **Observed visits are browser sessions, not unique people or certified humans.** Page views and visits are separate counters.

Migration 031 adds anonymous IST daily page/visit aggregates and daily HMAC-salted retry receipts, plus login reporting indexes. Neither supplied UUID nor IP/contact is stored in these analytics tables. Receipt cleanup lazily deletes up to 500 rows older than two days per committed new observation; a cleanup backlog can extend physical receipt retention. Aggregate history remains anonymous. No historical visits can be reconstructed: traffic before tracking started is returned/displayed as unavailable rather than zero. No account export/erasure link exists for these unlinked daily observations; account-derived reporting still honors deletion tombstones.

## Verification

Real PostgreSQL/public HTTP tests cover enabled staff/MFA and role boundaries, stale-session revocation, no finance for non-Finance roles, Support-only literal directory search and stable paging, concurrent retry/session deduplication, rejected private payloads, no raw UUID persistence, IST midnight and lazy receipt cleanup. UI tests cover unavailable history, chart/period changes, stale-report removal, deliberate directory load and role-filtered navigation; tracker tests cover public-only categories, ID lifetime, corrupt storage, DNT/GPC and cookie omission. Hosted acceptance must use fictional sandbox staff; real owner MFA/credentials are never bypassed or reset.
