# Unified admin dashboard - 28 October 2026 IST

The owner requested a professional admin dashboard combining audience/account reporting with all staff-console work. The ordinary preview's **[Admin dashboard](https://tutoring-marketplace-ravii-preview.netlify.app/staff)** and Account → Open admin dashboard are the entry points. Existing assigned staff scope and MFA are required; no new public admin access, real-owner credential reset or privilege bypass.

## Delivered workspace

- Responsive navy sidebar/coral selection, common header, readable overview cards and chart, current queues, activity, finance strip, account directory and worker/alert panel. Mobile menu, horizontal table scrolling, keyboard focus/labels and per-field password controls remain supported.
- All existing staff review, privacy, support, finance/coupon, report, notification, catalogue and operations pages share this workspace. Links are filtered by current MFA/scopes. A common header lock ends staff access; ordinary account login remains intact. The original access-purpose audit is available under a collapsed section.
- Audience uses 7/30/90 IST calendar-day controls, actual signup and successful-login history, distinct signed-in accounts and separately labelled valid sessions. Directory search/load is deliberate, SUPPORT-only, audited without query/contact payloads, and supports stable 25-row pagination. Deleted accounts are excluded.
- FINANCE-only captures/refunds/coupon facts remain separate from tuition and from free Passes. Current review/case queues and operations links retain their existing command permissions. No invented growth percentages, users, revenue or demand.
- Anonymous public visit/page observations now start collecting through the first-party API. Browser DNT/GPC opt-outs, private/recovery/child/staff-route exclusion, no cookies in observation requests, fixed page categories, 30-minute inactive tab-session rotation, daily salted retry receipts and bounded lazy cleanup. No external analytics service or raw URL/query/referrer/account/contact/IP/child payload in the analytics tables. Visits are observed sessions, not unique humans, and may include automated traffic. Earlier visits are unavailable, not reconstructed as zero.

Reference: [API and measurement definitions](../api/admin-dashboard.md).

## Verification

- **Five** real PostgreSQL/authenticated HTTP scenarios passed: ordinary/staff/MFA/expired/revoked boundaries, Finance versus Support/Trust scope, all review-queue queries, private directory literal search and stable pagination, retry/concurrency deduplication, no supplied IDs persisted, rejected private/extra payloads, IST midnight and lazy receipt cleanup.
- **Twelve** existing staff/MFA and marketplace-report regression scenarios passed.
- **61 UI tests across 20 files** passed; final visual-polish dashboard tests (4) passed again. API build/typecheck and UI typecheck passed. Focused new UI lint passed; the pre-existing shared account-module fast-refresh warning remains unrelated.
- Hosted fictional sandbox used an actual verified test admin, all three explicitly assigned scopes and real TOTP MFA. Browser acceptance passed overview, Finance facts, deliberate private directory load, period and chart controls, shared Finance/Tutor navigation, mobile navigation, no horizontal overflow, a real public observation reflected in reporting, and common-header lock followed by report 403. Screenshot desktop/mobile views were visually inspected. Acceptance-generated audience activity is explicitly fictional and can include browser automation.
- Ordinary preview anonymous report returned 401 and /staff redirected to sign-in without showing report data. Its public observation was intercepted during this guard check to avoid creating synthetic main-site visits. No real account or owner MFA was used/bypassed; owner login remains a human check with the current real credentials.

REA was optional but its connector was unavailable in this session. Source inspection, real PostgreSQL/HTTP tests and Playwright provided the implementation/runtime evidence instead; no REA execution is claimed.

Sanitized machine-readable evidence: [admin rollout](evidence/admin-dashboard-2026-10-28.json).

## Published release and operations

- Implementation source `c1e3a5132224e1873a5e5f3b0c287c38d52477cb`, UI polish `da925b7`, branch `feature/admin-dashboard`.
- Backend `admin-20261028-c1e3a5132224` on both API/worker pairs. Reviewed nine-file portable API/migration overlay on verified password release `password-20261028-62e31fdde21f`, reusing verified Linux dependencies with matching lock. This is not a fresh full CI/Linux build claim. Archive SHA256 `5ba772bbf9fb0ca81f9e12e91310da96c80b9e39b097904ada31569c2b7e6563`; per-file/archive allowlist/type/path checks, Linux import and derived 434-file manifest verified.
- Migration 031 applied separately after verifying all prior 30 migrations. Adds only anonymous traffic tables/receipts and login-report indexes. Application DML/backup SELECT grants scoped to new tables. Ordinary independent encrypted backups succeeded immediately before and after promotion.
- Ordinary UI `d4cc9bfd959c9b006755fdd13f20056972823878`, ready Netlify deploy `6ae219dd09ef0878c6cbae8a`. Sandbox UI `369eb7c38118edfc86889608a0b666158df72eee`, ready deploy `6ae219cdb49c391d2e7b7274`; sandbox-only notice patch `b126f27be6d36e4688959c1de77e90b3b9edfaf4`, ready deploy `6ae21ac70d286a321f42f297`, preserves the existing Fictional accounts / No real money notice inside all admin tools and was checked on Finance.
- Both health endpoints 200, all API/worker/Caddy services active, protected ordinary API/backup config changed only RELEASE_ID. Ordinary paid checkout remains disabled; isolated sandbox remains test-only. Real-owner password, scope assignment and MFA untouched. Private temporary browser-state transfer copy removed after acceptance.

No new AWS resource, paid service, hosting upgrade or infrastructure deadline extension. Existing VM stop remains **30 October 2026 at 00:23:31 IST**. Older releases without migration 031 must not be blindly restarted against this schema; use a compatible forward fix. Full launch, regional restore, compatible rollback, legal/merchant/Guardian and other pre-existing launch gates remain separate.
