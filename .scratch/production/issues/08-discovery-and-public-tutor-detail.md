# 08: Find eligible Tutors and inspect public offers

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 07 — Publish approved teaching offers and manage availability

**What to build:** Visitors search across all domains using accurate offer filters and inspect public Tutor pages without seeing private contact or evidence.

## Acceptance criteria

- [x] Search filters Subject, Learner Level, Curriculum, Exam Track, Teaching Language and price with deterministic pagination.
- [x] A Tutor offering CBSE Physics and JEE Mathematics does not falsely match JEE Physics.
- [x] Suspended/paused offers are excluded; sensitive request actions recheck authoritative eligibility.
- [x] Detail pages show rate units, trial terms, declared evidence labels and public availability without private data.
- [x] API/browser tests cover representative offers across eight families, empty results and private-field exclusion.

## Verification evidence

Implemented on 12 October 2026:

- Public `/tutors` search supports domain, Subject, Learner Level, Curriculum, Exam Track, Teaching Language and inclusive integer-paise price filters with an explicit hourly/per-lesson unit. Filters are reflected in the URL; changing filters resets pagination. Loading, error/retry, clear/first/next-page and honest empty-result states are implemented with responsive mobile layouts and existing motion/reduced-motion styling.
- `GET /v1/discovery` applies all filters to the same exact Listing. A Tutor's CBSE Physics and separate JEE Mathematics offer cannot satisfy JEE Physics. Strict validation rejects malformed/repeated/unknown fields, inactive/mistyped catalogue options, incompatible domain filters, ambiguous price units and invalid ranges. Stable UUID keyset pagination is bounded to 1–24 entries (12 default) with no fabricated total Tutor count.
- Search and `GET /v1/discovery/:id` read one read-only repeatable-read snapshot of published/approved/unsuspended Listing, current approved profile revision, active verified Tutor account/role, clean/unexpired adult identity and matching Subject evidence, non-test production evidence and active taxonomy. Decrypted adult age is checked internally. Paused/suspended/expired/revoked/disabled/stale-profile offers are excluded or return 404. Sensitive future actions retain the locked `ListingsService.requireAvailable` command seam; a browsing snapshot never authorizes requests/payment.
- `/tutors/:listingId` shows safe public Tutor name and exact offer, online availability, languages, rate/unit/lesson duration, no/free/paid trial terms, controlled evidence-review labels with reviewed/expiry dates and the outcome/quality disclaimer. Whitelisted public responses exclude account/contact IDs/emails/phones, dates of birth, private evidence/claim IDs/bytes, staff identities, free-text review/safety reasons and tokens. Obvious contact patterns in a profile name fall back to `Tutor`. Detail rechecks on focus/explicit refresh; sequenced requests prevent stale response replacement.
- Homepage/header and catalogue dialogs link to real search while keeping catalogue breadth distinct from Tutor availability. Browsing remains free and tuition/trial fees remain direct to Tutors. There are no fake Tutor/review cards or placeholder checkout/request actions. Availability subscriptions are task 09, requests task 10, rendered SEO task 24.
- Migration 008 adds published-offer partial indexes for domain, Subject/Exam, price/unit and Teaching Languages plus approved claim lookups. This is index support, not measured capacity or performance certification. Migration was applied to the existing development database and the verified stack restarted. Local `/tutors` returned 200; search returned an honest empty list because no local eligible published supply was present.
- Full `npm test` run passed all 53 then-present PostgreSQL/API tests and 9 UI tests. A subsequently added production/age gate test passed separately with `--test-name-pattern="production discovery excludes"`; together all 54 current API tests have passing evidence. Six Discovery tests cover exact-offer false-match prevention, inclusive prices/unit separation, strict filters, deterministic multi-page traversal, private-field/controlled-label projection, eligibility removal/detail parity, representative offers in all eight domains, honest empty results and exclusion of fictional evidence in production.
- Initial Discovery tests accidentally counted earlier still-eligible fixture offers. The isolated test clock now advances eight days between cases, expiring earlier fixture approvals/sessions; targeted rerun and full verification passed. This was fixture isolation, not a search predicate change.
- `npm run typecheck`, `npm run build` and `git diff --check` passed. `PLAYWRIGHT_CHANNEL=msedge npm run test:browser` passed all seven browser journeys in one run (3.6 minutes). The expanded Tutor journey includes anonymous mobile filters/price empty result, public detail/privacy/evidence labels, no horizontal overflow at 390px and unavailable detail after safety suspension/revocation; a separate mobile empty-search journey exercises all eight domains, URL filters/clear and unavailable detail. Existing account, catalogue, Guardian and staff flows passed. The isolated browser stack stopped; normal development ports remain running.
- Common credential-pattern checks found no matches in staged files; local environment, database, captured mail and test artifacts remain ignored.

API, snapshot/pagination semantics and release limits: [docs/api/discovery.md](../../../docs/api/discovery.md). No new external credentials are needed. Live scanning/privacy/provider/deployment dependencies remain unchanged; public browsing does not claim payment, contact release, rendered SEO or measured release readiness.

## Comments


