# Search, locality, filters and sorting completion - 3 November 2026

The owner requested REA MCP inspection and similar search/location/filter/sort features. Most functionality already existed and was verified in the [earlier release](search-filters-2026-11-03.md). This pass audited and retained it, then completed concrete gaps. [Reference evidence](../research/superprof-search-refinements-2026-11-03.md) separates same-day prior REA scenarios, new passive observations and adopted defaults. A sort control was not observed on the selected Superprof results page; its ranking logic remains unknown.

## Changes

- Subject and location clear buttons preserve keyboard focus. Explicit Anywhere removes locality/country and location-implied mode on the next search; Online likewise clears locality.
- Explicit Subject/Exam choice retains its identifier and type, including duplicate labels; suggestions visually distinguish the types.
- Location suggestions are bound to the current query, with loading/error/retry feedback. Late responses for an earlier query cannot replace the current location list. Manual city entry and fallback search choices remain usable during suggestion failures; labels do not imply available supply.
- Applied goal/location appears in the heading. Price ordering explicitly describes hourly or per-lesson teaching offers; current server-backed ordering and unit validation remain unchanged.
- Empty-offer actions can remove only locality, reset the search, or remove offer-only constraints to browse free public introductions. Supported Subject/mode/locality/schedule preferences survive the latter; introductions are not represented as satisfying exact offer combinations/prices/trials.
- Existing staged filter dialogs, chips, dependent resets, compatible hero refinements, exact-offer separation and browser history are retained. No backend/database, payment, staff-authentication or compute-window changes.

## Local acceptance

- 125 UI tests passed in 30 files, with bounded workers after an unrelated class test hit its 5-second timeout under concurrent build/browser load. No test timeout or unrelated product source was changed.
- Focused search/filter tests pass, including chosen Exam identity, clearing, location retry/stale responses, scope-safe recovery and requested-goal headings.
- Final TypeScript check and production Vite/Nitro build passed.
- New browser journey passed at desktop/390px/320px with zero page errors: loading/failure/retry, typed Subject/city, price asc/desc payloads and displayed server-response order, hourly-unit comparison, empty recovery, clear/Anywhere/Online and browser Back.
- The established filter regression journey also passed Apply/Cancel/Escape, focus, unit/range semantics, compatible refinements, chip dependencies, history and mobile layout.
- [New browser JSON](evidence/search-refinements-local-2026-11-03.json), [mobile preview](evidence/search-refinements-local-mobile-2026-11-03.png), [filter regression](evidence/search-refinements-regression-2026-11-03.json).

The new local journey consumes the actual public catalogue and isolated synthetic offer response fixtures to exercise both orderings. It proves UI/wire integration with the existing API, not new database ordering correctness or current production availability. The established regression uses its existing isolated fixtures. No live accounts or commercial records were modified. Preliminary browser failures came from initial Vite/load timing and a harness sort label mismatch; realistic waits and the actual accessible label resolved them without changing product behavior.

## Release

Prepared on isolated branch `feature/search-refinements-rea` from `9833a16`. Hosting commits/deploy IDs and actual-API acceptance will be recorded after promotion.
