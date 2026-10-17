# Public pages and delivered marketplace value

Task 24 publishes currently eligible teaching offers and reports recorded matching outcomes. It does not measure lesson attendance, teaching results, unique customers or direct tuition revenue.

## Public navigation and indexing

The homepage, `/teachers/<subject>-<Listing UUID>` and `/learn/<domain>/<subject ID>` render their initial content, title, description, canonical link and social metadata on the server. Public cards use the canonical teacher path. Legacy `/tutors/<Listing UUID>` and obsolete slug prefixes redirect with HTTP 301 only after checking current eligibility. A paused, suspended, deleted or otherwise ineligible offer returns 404 instead of redirecting to an exposed profile. Empty valid categories show an honest empty state and availability signup with `noindex`; inactive or invalid taxonomy returns 404.

The public projection checks the approved Listing revision, current adult Tutor and matching evidence approvals, active taxonomy, availability and safety restrictions. Only an eligible approved portrait can appear in HTML or social metadata. Removing approval or public eligibility also invalidates its public asset URL. Private evidence, birth dates, account identifiers, contact details and staff notes are excluded.

`/sitemap.xml` lists the homepage, supplied category pages and canonical available offers, deduplicated from one eligible-supply snapshot. It invents neither supply nor modification dates. Canonical origins come from configured `WEB_ORIGIN`, never the incoming Host header. The pilot index supports up to 5,000 offers and fails with 503 above that bound; it does not silently publish a partial index.

Production indexing requires actual eligible live supply. Development/test pages are `noindex`, their sitemap is empty and `robots.txt` disallows crawling. Production robots exclude private routes and the API, while explicitly permitting eligible public photo paths. Private/search pages and error responses also send `X-Robots-Tag: noindex`. Authorization still protects private APIs; robots directives are not access controls.

Public responses use `Cache-Control: no-store` and recheck eligibility. There is no application/CDN response cache to purge. External search engines may retain old copies until recrawling; this implementation cannot remotely erase those copies or downloaded files. Configure the reverse proxy to preserve the no-store policy and avoid caching public personal content.

The UI server calls the API through `API_INTERNAL_URL` (default `http://127.0.0.1:4000`) with a five-second timeout. Set it for the deployment network. These SSR loaders request only public data and do not forward browser session cookies. Framework reference: [TanStack Start server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes).

## Search observations

`POST /v1/discovery/searches` executes the same structured discovery query and records a first-page search execution. The client supplies a stable UUID request key for retries of the same filters. An HMAC key receipt and normalized filter fingerprint deduplicate retries for seven days; reusing an unexpired key for different filters returns 409. Receipt cleanup is bounded and lazy, so a cleanup backlog can extend deduplication beyond seven days. Expired receipts are removed during subsequent observations.

Daily counters contain UTC day, selected domain (or unclassified), environment mode, searches, matched results, empty results and partial pages. They contain no account/child identifiers, raw query, email, IP or cookie. The existing independent IP rate limiter protects the endpoint; IPs do not enter the metrics tables. Pagination, ordinary discovery GETs and internal availability probes do not count as new search executions. Automated callers can still submit POST observations, so these counts describe observed executions rather than unique people or certified human demand.

## Private Finance reporting

Open `/staff/metrics` through **Inspect delivered marketplace value** in the staff console. An explicitly granted FINANCE scope, active staff MFA and a 10–240 character audited purpose are required. Registration does not provision this permission. Choose a UTC creation/capture interval of 1–90 days; the end date is exclusive. The default includes today and the previous 29 calendar days. The report records its observation time and reads one database snapshot. Test-mode reports are explicitly fictional and exclude live-mode facts.

The tables deliberately use separate populations:

| Population | Attribution and interpretation |
|---|---|
| Current coverage | Eligible offers, distinct Tutors within each domain and covered Subjects at observation time. Cross-domain Tutor totals are not unique people. |
| Observed searches | First-page executions in the UTC interval, classified only by the selected domain. A result rate is matched executions divided by observed executions. |
| Contact Requests | Requests created in the interval, using their offer snapshot. Responses, acceptances, declines, cancellations and issued Connections remain distinct facts. |
| Mature requests | Requests whose recorded response deadline has elapsed. On-time response and Connection rates show their numerator and mature denominator; cancelled requests stay in that denominator. |
| Captured purchases | Distinct purchases with an expected capture in the interval, attributed to the original checkout Listing revision. A later Listing edit cannot move the purchase into a new domain. |
| Mature paid purchases | Captured-cohort purchases whose original matching deadline has elapsed. A timely first activation counts as a match; a confirmed provider refund counts separately. |
| Financial outcomes | Gross INR capture, unexpected INR capture, refund intents, provider-confirmed refunds and chargebacks are separate. Outcomes include facts observed after the capture interval up to report time. |

Rates with no mature denominator return `null` and display **Not yet measurable**. A Connection records an established relationship, not current communication permission or attendance. Current safety/consent checks continue independently. Provider-confirmed refund does not prove bank arrival; gross capture is not net profit. National enrolment or exam participation figures are never added as marketplace customers. Teaching outcomes and unique-customer estimates remain explicitly unmeasured.

Migration 026 freezes checkout domain facts for new purchases. Historical attribution is backfilled only when the original Listing revision still matches; otherwise the purchase stays unclassified. It does not modify money history. The owned domain fact is included in financial privacy exports.

Account erasure and withdrawn Learner contexts are excluded from operational request/Connection cohorts. Immutable financial obligations remain reportable under the existing approved retention/exception policy. Anonymous daily counters cannot be linked back to an erased account. No external analytics provider is configured.

## HTTP surface and verification

Public: `GET /v1/public/home`, `GET /v1/public/teachers/:slug`, `GET /v1/public/categories/:domain/:subject`, `GET /v1/public/sitemap`, `GET /v1/public/robots` and `POST /v1/discovery/searches`.

Private: `GET /v1/staff/marketplace-metrics?reason=...&from=...&to=...`.

API integration tests use isolated real PostgreSQL clusters. They exercise supply removal, approved-photo indexing, Host poisoning, redirect eligibility, search deduplication, mature denominators, immutable purchase attribution, duplicate capture, confirmed refund and privacy erasure. Browser checks exercise initial HTML, JavaScript-disabled category/detail rendering, legacy redirects, private noindex, fresh 404, and desktop/mobile Finance reporting. Local development remains deliberately unindexed. A real public domain, actual production deployment and the existing payment/privacy/recovery approvals remain release dependencies.
