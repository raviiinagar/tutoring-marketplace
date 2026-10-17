# 24: Publish useful pages and inspect delivered matching value

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 09 — Subscribe to availability in an empty category; 15 — Activate paid access once and connect accepted Tutors; 19 — Inspect receipts and reconcile payments to settlements; 21 — Submit and moderate connection-linked Reviews; 29 — Upload, review and publish Tutor portraits

**What to build:** Visitors find useful public Tutor/category pages and the owner sees search coverage, response, Connection and refund outcomes by domain.

## Acceptance criteria

- [x] Include public Tutor photo records/assets in eligible public projection and suspension/removal invalidation.

- [x] Rendered metadata, canonical URLs and sitemaps reflect real approved supply; private dashboards and data are excluded from indexing.
- [x] Stable slugs/redirects preserve public navigation while suspension/deletion invalidates public exposure.
- [x] Server-side facts distinguish requests, acceptances, Connections, capture, refunds and estimated teaching outcomes.
- [x] Dashboard reports category coverage and response/fulfilment with clear denominators and mature cohorts.
- [x] Tests verify public/private indexing boundaries and event deduplication; national populations are not summed as unique customers.

## Verification evidence

Implemented on 17 October 2026 using the TDD and codebase-design skills, with diagnosing-bugs for the served robots-file collision. Canonical `/teachers/<subject>-<Listing UUID>` and `/learn/<domain>/<subject ID>` pages and the homepage render real eligible supply and metadata in initial HTML. Legacy UUID/prefix URLs redirect only after current eligibility checks. Approved portrait URLs and social metadata share existing publication/safety checks; removal stops asset reads and suspension/deletion invalidates canonical/legacy exposure. Empty categories remain honest and noindex. Canonical origins use configuration rather than Host. The supply-only sitemap uses one snapshot, excludes private data and refuses to truncate above the explicit 5,000-offer pilot limit. Development has an empty sitemap and blocks crawling; private/error pages send noindex, and public responses use no-store.

The private `/staff/metrics` console requires FINANCE, active MFA and an audited purpose. It separates current supply, anonymous observed search executions, created-request cohorts and expected-capture purchase cohorts. Request response/Connection and paid-match/refund rates display explicit mature denominators; no mature denominator remains null. Migration 026 freezes the original checkout domain and conservatively backfills only provable historical revisions. Capture, unexpected capture, refund intent, confirmed provider refund and chargeback remain distinct. Later Listing edits cannot rewrite attribution. Teaching outcomes, unique people, direct tuition, bank arrival and profit remain unmeasured; national populations are not added as customers.

Search retries deduplicate through expiring hashed request receipts; ordinary GETs, internal probes and pagination are excluded. Daily counters contain no account/child identifiers, raw query, IP, email or cookie. Erased/withdrawn contexts are excluded from operational cohorts, while financial obligations and anonymous counters remain appropriately distinct. Owned checkout-domain financial facts are exported through the privacy inventory. No external analytics provider is introduced.

All 50 relevant API regression scenarios passed with zero failures (`.local/task24-api-regression.log`), covering discovery, public pages, metrics, payments, refunds, Finance, reconciliation and privacy. New scenarios prove photo/suspension invalidation, canonical Host isolation, sitemap boundaries, search deduplication/key conflicts, immature/mature rates, duplicate capture, original-domain refund attribution and operational exclusion after erasure with preserved money obligations. All 35 UI tests passed (`.local/task24-ui-final.log`); workspace/UI typechecks and production build passed (`.local/task24-types.log`, `.local/task24-build.log`, final static-file correction rebuild `.local/task24-ui-build-final.log`).

The extended isolated Edge Tutor journey passed, including no-JavaScript canonical/category rendering, approved portrait, legacy 301, fresh unavailable 404 and desktop/mobile Finance reporting (`.local/task24-browser.log`, the Tutor scenario). The separate eight-domain mobile search journey passed after allowing a 20-second initial cold-hydration wait (`.local/task24-discovery-browser-final.log`). The served indexing test first reproduced the imported static `public/robots.txt` overriding the dynamic route; removing that duplicate fixed it. The exact HTTP regression passed against both the dev server and built Nitro server (`.local/task24-indexing-green.log`, `.local/task24-indexing-built-green.log`). Screenshots: `.local/task24-category-no-javascript.png`, `.local/task24-metrics-desktop.png`, `.local/task24-metrics-mobile.png`. Browser/test fixtures use isolated PostgreSQL, fictional identities and test-only approvals.

Migration 026 applied online without reset, preserving all 28 owner users, zero purchases and zero captured money (`.local/task24-local-migration.log`). Final localhost smoke confirms public HTML/sitemap/robots availability, nonproduction crawl blocking, no-store, private noindex and unauthenticated metrics 401 (`.local/task24-final-smoke.log`). Owner payment/retention/merchant approvals were not fabricated or enabled. Existing development stack remains available.

Guide: `docs/api/public-pages-and-metrics.md`. Real public domain/deployment, credentials, approved privacy/merchant policies, independent recovery storage and the measured restore/load/release gates remain external or later-ticket dependencies. This slice does not claim production deployment, remotely erased search-engine caches or verified teaching outcomes. Applied migration bytes remain frozen; cross-host checksum compatibility remains part of ticket 26 recovery verification.

## Comments


