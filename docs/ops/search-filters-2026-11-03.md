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

The owner explicitly approved pushing to `raviiinagar/tutoring-marketplace` and deploying both existing Netlify sites after the initial automatic publication review rejection. The approved publication subsequently succeeded.

| Target | Hosted commit | Ready Netlify deploy |
|---|---|---|
| Main | `e1a2da977e7122045afd6e0d935757ae3f26ab32` | `6ae8ef847b5f424bcda91f2f` |
| Payment sandbox | `6c8c8fdc14252058b9afcefe503795bb31c2076c` | `6ae8ef772dfb053e0c6cb41c` |

The feature branch contains component/helper commit `531e782` and route/research commit `5e6da73`. Hosting branches received those two code commits while preserving their existing environment-specific routing and sandbox notice. This report and final acceptance evidence are maintained on the feature branch and synchronized into the owner's workspace.

## Live acceptance

Anonymous real-browser checks passed on both main and payment-sandbox sites, at desktop and 390px mobile widths, with no API mocks or real-account changes. Each run observed five successful search API responses and checked applicable rate-unit, maximum-price and free-trial constraints on returned offers. Apply/Cancel/Escape, focus return, complete filter request payloads, offer/profile separation, dependent chip removal, browser Back and clear-all passed with zero page errors or horizontal overflow. Compatible hero refinements are covered by local browser fixtures and helper tests; they were not independently exercised in the live anonymous run.

- [Main result evidence](evidence/search-filters-main-2026-11-03.json)
- [Sandbox result evidence](evidence/search-filters-sandbox-2026-11-03.json)
- [Main desktop](evidence/search-filters-main-desktop-2026-11-03.png) and [main mobile](evidence/search-filters-main-mobile-2026-11-03.png)
- [Sandbox desktop](evidence/search-filters-sandbox-desktop-2026-11-03.png) and [sandbox mobile](evidence/search-filters-sandbox-mobile-2026-11-03.png)

These checks establish the tested anonymous discovery interactions; they do not establish every authenticated workflow or a capacity benchmark.
