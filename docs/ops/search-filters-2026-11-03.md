# Compact Tutor search filters - 3 November 2026

## Change

Replaced the long search-sidebar form with a compact toolbar and accessible, staged filter dialogs. Added applied chips and dependency-safe removal/reset; retained price-unit semantics and all prior exact-offer filters. Subject/location searches now preserve compatible refinements. Offer-only filters omit the separate public-introduction projection. Existing large cards and light-yellow theme remain.

The [REA research record](../research/superprof-search-filters-2026-11-03.md) links successful competitor action evidence and screenshots, and separates direct observations from our defaults and unimplemented distance/response-time behavior.

## Verification

- 95 UI tests passed in 27 files, including 12 new helper/component checks.
- TypeScript and production Vite/Nitro build passed.
- Local browser verification with isolated public-data fixtures passed desktop and 390px mobile: staged Apply/Cancel/Escape, focus return, hourly default and explicit range, complete discovery request payloads, compatible hero refinements, profile scope, dependent chip resets, browser history, clear-all and no page errors/overflow.
- The first browser run had an overly strict exact-label selector for the native level select; the corrected role selector passed. No product fix or result-filtering claim was inferred from that test failure.
- No API source, database migration, account, payment or cloud compute change is needed for this release.

## Hosting

The feature is committed locally on `feature/search-filters-rea` (component/helper commit `531e782`, route/evidence commit `5e6da73`). An attempted push/promotion command was rejected before execution by automatic approval review. The review required explicit approval for external publication to the existing `github.com/raviiinagar/tutoring-marketplace` remote and deployment branches. Neither hosting branch was changed; no deployment or live-after-change acceptance is claimed.

The owner must approve publishing this concrete feature to that repository and the existing main/payment-sandbox Netlify deployments. The existing live website remains on its prior compact-card release. Local work and verification are complete; hosted acceptance is pending publication approval.
