# Complete search, location, filters and sorting

Status: ready-for-agent
Resolution: completed and deployed (3 November 2026)
Type: task

## Acceptance

- Existing filters/sorting preserved; selected Subject/Exam identity, clearing and Anywhere generate correct URL/API fields.
- Location responses are scoped to the current text; loading/failure/retry are visible without blocking manual city or Online search.
- Price units remain comparable and no-results recovery preserves relevant subject/location preferences.
- Keyboard/mobile/history and staged Apply/Cancel verified; evidence distinguishes observed reference behaviour from our design defaults.

## Comments

3 November 2026: existing implementation/evidence audited. Improvement work begins from 9833a16 with no backend/schema change planned.

Local acceptance: 125 UI tests; new desktop/390px/320px browser journey and established filter/history regression pass. Evidence, fixture boundaries and pending hosting acceptance: docs/ops/search-refinements-2026-11-03.md.

Main and sandbox deployments are ready and passed actual-API desktop/390px/320px search/recovery/history checks. Existing four sandbox hourly offers verified both server price orders; main empty-query limits are explicitly documented. Final deployment IDs, commits and artifacts: docs/ops/search-refinements-2026-11-03.md.
