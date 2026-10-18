# Pilot accessibility and load verification

Task 27 uses isolated fictional data. It does not start the owner's development database, send real email, call a live payment gateway or grant production access.

## Reproduce

Use Node 24, locked root/UI dependencies, and the installed Playwright browser. The pilot PostgreSQL 16 package is separate from the owner's PostgreSQL 18 development cluster.

```powershell
npm ci
npm ci --prefix lovable-ui
npx playwright install chromium
npm run typecheck
npm run build
$env:LOCAL_POSTGRES_MAJOR='16'
npm run test:pilot-browser
$env:PLAYWRIGHT_BUILT_UI='true'
npm run test:pilot-mobile
# Run sequentially after the browser process has stopped. Do not build or run other tests during measurement.
npm run test:pilot-load
```

Windows can use an installed Edge browser by setting `PLAYWRIGHT_CHANNEL=msedge`. The runner always creates a fresh stack and refuses to attach to an existing server. Functional browser journeys use the development UI so captured-email links stay excluded from production builds. The mobile performance command explicitly uses the production UI. In that built stack, port 3100 is a test-only same-origin streaming proxy; 3101 serves the built Nitro UI, 4100 the isolated API and 5434 the browser database. Occupied ports fail rather than attaching to owner data. The load harness chooses an independent free PostgreSQL port and explicitly constructs its configuration without the caller's database, encryption or payment credentials.

## Profiles and gates

- Accessibility: axe WCAG 2 A/AA, 2.1 A/AA, 2.2 AA and best-practice rules, including contrast. Mobile 390×844 and desktop 1280×844. Scans use the existing reduced-motion preference for a stable rendered state; keyboard tests exercise skip navigation, route focus, mobile disclosure/Escape, visible control boundaries and focus. The Tutor journey also checks populated private chat and its report links. Sign-in failures and empty client-side submissions exercise live error announcements. Shared input boundaries meet 3:1 non-text contrast.
- Mobile lab: production build with six approved offers from two fictional Tutors and approved textured test images, five cold browser contexts per home/search route, Chromium CDP network emulation (150 ms latency, 1.6 Mbps download, 0.75 Mbps upload), 4× CPU slowdown, viewport 390×844, DPR 1, touch/mobile mode, no cache or service worker. The local proxy matches deployment Caddy's gzip text delivery and preserves streaming API responses. Nearest-rank p75 LCP must be ≤2500 ms. This is an adopted reproducible lab profile, not a field percentile or the performance of a particular physical phone.
- API load: 100 independent authenticated logical sessions, 20 simultaneous persistent authorized SSE streams, 180 seconds, open-loop one dynamic arrival every 50 ms. No health-check traffic counts toward the target. At least 19.5 completed requests/s; scheduler lag ≤250 ms; no unexpected response, timeout or worker error. Latencies include scheduling delay to avoid hiding coordinated omission. Search/preference-write/checkout p95 ≤500 ms; committed chat acknowledgement p95 ≤300 ms.
- Data: 100 fictional adults, 10 reviewed Tutors, 30 published Physics offers across classes 9/10/11, 77 established Connections and 1155 encrypted historical messages. Twelve additional purchase cycles use the injected provider, with their first signed captures processed during traffic. The setup is explicit test data, not a claim of available Tutor supply.
- Dynamic mix per second: 10 searches, 2 histories, 2 durable chat sends, 1 preference write, 1 checkout retry, 1 signed capture callback and 3 negative permission probes. Callbacks include repeated facts with distinct delivery IDs. Public purchase history must retain one ₹599 capture journal per cycle. Payment confirmation alone must not activate access.
- Permission probes alternate cross-account conversation/payment reads; blocked history; suspended public discovery/new Contact Request attempts. Already-open blocked/suspended streams must revoke, reconnection/history/contact/send stay denied, and every measured acknowledged message must be recovered through authorized history and an SSE reconnect.
- Background work during load: payment processing, captured notification delivery, captured verification email and request deadlines. Other workers and real external latency are outside this local profile and must be included in staging sizing before launch.

## Evidence and interpretation

The browser JSON report is `.local/pilot-browser-results.json`; axe attachments retain violations and incomplete checks. `.local/pilot-mobile-lcp.json` retains the measured LCP samples; the built-run browser report and traces use separate `.local/pilot-mobile-browser-results.json` and `.local/pilot-mobile-results/` paths so they cannot overwrite functional accessibility evidence. Each load run creates `.local/pilot-load/<run>/report.json`, including failures, host profile, every latency group, generator lag, actual throughput and permission outcomes. The GitHub `pilot-quality` job retains fictional reports and browser traces for 14 days, separately from the deployable artifact. Do not upload database directories, test environment files or captured mail directories.

Automated axe checks do not certify complete WCAG conformance. Gradient/photo text and assistive-technology usability still require visual/screen-reader review. Test positive focus, labels and announcements on real supported devices during the controlled pilot. A laptop loopback result or hosted CI result does not establish Mumbai network latency, application/database VM sizing, production provider latency or field Core Web Vitals. Repeat the profile against an isolated deployed staging environment before approving rollout; preserve failures and record any resize decision within the approved budget.

Method references: [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing), [Deque axe API](https://www.deque.com/axe/core-documentation/api-documentation/), and [Chrome mobile throttling methodology](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md).

## Fixes found by verification

Added skip navigation, main-content targets and route focus, Escape/focus return for the mobile disclosure, announced inline field errors and stronger control boundaries. Fixed Access Pass heading order, chat report label/name mismatch and the primary-button hover contrast. Interface fonts are locally served unmodified licensed WOFF2 files. Populated-page testing exposed large full-size portraits on cards; responsive metadata-free WebP variants now reduce transfers while rechecking live publication/privacy permissions on every delivery. No image cache or new retention store was introduced.

The uncompressed-proxy baseline (empty home p75 4008 ms) was not representative of deployment Caddy; reproducing its gzip delivery yielded 1620 ms home and 2372 ms empty search before further font/image work. Crucially, adding six photo-backed offers exposed a real populated-home p75 of 5064 ms with approximately 221 KB JPEGs. Keep these diagnostic failures distinct from final populated-page measurements. The first concurrent browser/load trial also missed its latency/scheduler targets; final load evidence must come from the sequential run, with those failures retained locally.

The accepted local 180-second run is [recorded as JSON](evidence/task27-local-load.json): 3600 dynamic requests, 100 sessions and 20 streams, 20.003 requests/s, maximum generator lag 31.2 ms, search p95 56.4 ms, preference-write p95 25.6 ms, checkout-retry p95 42.3 ms and durable-chat p95 32.2 ms. All 540 negative probes denied access; all 360 measured acknowledgements survived history/reconnect; 12 captures remained single-effect despite callback replay. These numbers describe the recorded local host only.

Card images use fixed 384px/640px responsive WebP variants, with no derivative cache. The first home card is rendered eagerly with high image priority and immediate content visibility; later cards keep the existing reveal motion. A translucent name surface keeps white Tutor names legible over bright portraits. The JSON load mix does not include image transformation throughput; the populated mobile run measures real approved photo transfers separately, and staging sizing must include this CPU/network work.

The final [populated mobile evidence](evidence/task27-local-mobile.json) records home p75 LCP **2416 ms** and search **2240 ms**, both within 2500 ms. The photo-backed home baseline was 5064 ms; responsive images alone reached 3024 ms, then critical first-card loading/visibility met the target. All 24 relevant API regressions, 37 UI tests, 8 core browser journeys and the added client-error regression pass locally, as do typecheck/build and runtime audit (zero production vulnerabilities). No owner-data migration was needed.
