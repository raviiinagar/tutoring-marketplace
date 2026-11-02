# Compact Tutor search refinements

Status: ready-for-agent

Owner request: use REA MCP to understand Superprof search/filters, show evidence, and implement a similar feature. Preserve the Lovable UI and light-yellow theme.

## Decisions

- Record successful REA browser actions after the owner manually opened the normal Chrome session. Separate observations from adopted defaults and unknown competitor internals.
- Subject/location autocomplete already exists. Replace the long offer-filter sidebar with a compact toolbar for class mode, budget, level, more preferences and explicit price ordering.
- Stage dialog edits until Apply; Cancel/Escape discard. Expose applied chips with individual removal and clear-all. Keep URL state shareable and browser Back/Forward compatible; clear pagination after any filter change.
- Preserve all existing exact-offer filters, INR paise, per-hour/per-lesson separation, real trial terms and server eligibility. Retain free identity-reviewed profiles when their supported filters apply; hide the profile projection for offer-only filters.
- Preserve compatible refinements when the hero subject/location search changes; clear incompatible domain/learning fields.
- Do not add geographic-distance, response-time, AI ranking or competitor totals without the required data/semantics. City/area and declared weekly availability remain our supported behavior.
- No API, database, payment, authentication or account changes.

## Acceptance

Accessible keyboard-operable dialogs and focus restoration; staged Apply/Cancel; price-unit/range validation; dependent chip resets; URL navigation; compact desktop/mobile layout; honest empty/error/loading states; existing UI checks and production build; anonymous live smoke after frontend deployment.
