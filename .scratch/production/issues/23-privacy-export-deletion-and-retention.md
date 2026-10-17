# 23: Export or delete personal data with tracked retention

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 04 — Manage adult and guardian-controlled Learner profiles; 06 — Onboard an adult Tutor and review private evidence; 09 — Subscribe to availability in an empty category; 19 — Inspect receipts and reconcile payments to settlements; 20 — Deliver transactional notifications with preferences; 22 — Resolve support cases and appeals through scoped actions; 29 — Upload, review and publish Tutor portraits

**What to build:** An authenticated account holder requests export, deletion or consent withdrawal and sees completion while approved retained records remain restricted.

## Acceptance criteria

- [x] Include public Tutor photo records/assets in export, erasure, retention and deletion propagation.

- [x] Recent identity verification precedes export/deletion; expiring export downloads are authorised.
- [x] Withdrawal/deletion stop applicable new activity, revoke sessions/grants as required and propagate through public pages, assets, analytics and notifications.
- [x] Retention classes and legal/finance exceptions are explicit configured policy; no invented blanket deletion of financial obligations.
- [x] Approved evidence retention and Guardian authority/consent effects are enforced by tracked jobs.
- [x] Tests prove complete scoped export, unrelated-account denial, deletion tombstones and restoration reapplication.

## Verification evidence

Implemented on 17 October 2026. The account page links to `/privacy`; the MFA staff console links to `/staff/privacy`. Current-password proofs are single-use, session/account/action-bound and expire after five minutes. Export artifacts are encrypted, owned, capped at 50 MiB and available for 24 hours; another current proof is required for download. A separate HttpOnly receipt permits read-only status tracking for 30 days after sessions are revoked, with an explicit forget action. Receipt-only reads omit child profiles and never authorize download or a new request.

Owned inventory covers account/Learners/consents, Guardian/Tutor evidence and clean assets, current/old Tutor portraits, claim/Listing/Review decisions, submitted enquiries, own sent chat, reviews/appeals, user-visible support history, financial/access records, notifications/preferences/availability and safe session/audit metadata. Other adults' private contributions, staff notes, authentication secrets, unsafe assets and raw provider payloads are excluded. Privacy-authorized child IDs/aliases support withdrawal even when marketplace access is restricted.

Deletion acceptance disables the account, revokes account/staff sessions and Connection grants, pauses supply, withdraws Learners and suppresses notices. Tracked leased jobs redact personal source text/bytes and remove captured local mail. Guardian withdrawal snapshots the exact old consent/request scope; later explicit consent remains usable while old grants stay revoked. SMTP propagation remains EXTERNAL_REVIEW until Support records verified provider handling, with MFA/reason/reference; local completion is never presented as external completion. No external analytics/cache provider is configured.

Retention requires explicit immutable versioned class/purpose rules and approval metadata. Encrypted restricted snapshots enforce Support/Trust/Finance scopes, automatic financial/safety/support exceptions and audited manual holds. Expired payloads purge only after exceptions close; holds cannot resurrect purged data. Money facts/amounts and original source decisions remain immutable; only narrowly authorized privacy redactions can change designated free-text fields. Source evidence sweeps record policy/run/count/outcome, preserve current teaching/Guardian authority and paginate past held backlogs. Missing policy disables development erasure; production rejects missing, fictional or unapproved schedules and unconfirmed/missing signed ledger storage.

Signed independent tombstones and an atomic signed index precede erasure completion. Offline operator commands initialize, validate and reapply them before restored traffic. The complete ledger validates before restoration mutations; missing storage/signatures/indexed files fail closed. Original retention deadlines survive replay, purged snapshots stay purged, restored sessions/grants are revoked and newer consent is respected.

The complete API regression suite passed all 161 scenarios with zero failures (`.local/task23-api-regression.log`). Final isolated privacy verification: all eight public API/worker scenarios passed (`.local/task23-privacy-final.log`), including owned clean-photo export, unrelated-account denial, expiry, immediate account revocation, receipt tracking, scoped retention/manual release, preserved Finance facts with an outstanding obligation, withdrawal/fresh consent, restore reapplication, missing ledger, production gates, source retention past 100 held uploads and SMTP external review. All 34 UI scenarios passed (`.local/task23-ui-final.log`), with the final receipt-forget check recorded in `.local/task23-ui-receipt-final.log`. The real isolated Edge browser export/download/deletion/failed-login/mobile-overflow journey passed with runner exit 0 (`.local/task23-browser-verified.log`, `.local/task23-privacy-mobile.png`). These tests never delete owner records or send real SMTP mail.

Production build and workspace/UI typechecks passed (`.local/task23-verified-build.log`, `.local/task23-verified-types.log`). Migration 025 applied without reset: all 28 existing users remain, and no owner privacy erasure was requested (`.local/task23-local-migration.log`, `.local/task23-verified-smoke.log`). Both privacy pages return 200; unauthenticated private reads return 401. Development exports are available; the owner's unapproved retention configuration was not fabricated or enabled.

Guide: `docs/api/privacy.md`. Actual legal/privacy retention approval, provider handling procedures, independent storage/key recovery, a cross-host migration-compatible restore drill and measured RPO/RTO remain explicit launch/recovery dependencies (ticket 26). The local restore fixture proves deletion reapplication logic, not production deployment or regional recovery readiness.

## Comments


