# 27: Verify accessible journeys under pilot load

Status: ready-for-agent
Type: task
Resolution: completed (local software verification, 18 October 2026); deployed capacity remains a launch gate
Blocked by: 12 — Send durable text messages and recover after reconnect; 23 — Export or delete personal data with tracked retention; 24 — Publish useful pages and inspect delivered matching value

**What to build:** Users complete core mobile/keyboard journeys under realistic pilot traffic, and the owner receives reproducible performance and permission evidence.

## Acceptance criteria

- [x] Keyboard, focus, labels, error announcements and contrast are checked across discovery, checkout, Tutor, chat, support and privacy flows.
- [x] Exercise 100 concurrent sessions including realtime users and 20 dynamic requests/second with a representative read/write/payment-callback mix.
- [x] Measure proposed p95 first-party search/write ≤500 ms, durable chat acknowledgement ≤300 ms and agreed-profile p75 mobile LCP ≤2.5 seconds.
- [x] Suspended supply, blocked conversations and cross-account reads remain denied under load and reconnect.
- [x] Record actual bottlenecks and fix or resize before release; health-check throughput alone does not count.

## Verification evidence

Implemented reproducible isolated browser, mobile and traffic profiles in [the quality runbook](../../../docs/ops/pilot-quality.md). These checks never use the owner's database or credentials. The GitHub verification workflow runs functional browser journeys, the built-UI mobile profile and the load harness sequentially within a dedicated quality job and retains separate reports/traces for 14 days.

Accessibility: 8 complete browser journeys plus the added client-error regression pass locally. Axe checks WCAG 2 A/AA, 2.1 A/AA, 2.2 AA and best-practice rules across mobile/desktop discovery, authentication, checkout, Tutor onboarding/offers, populated private chat, support and privacy forms. Keyboard skip navigation, route focus, mobile-menu Escape/focus return, visible focus/input boundaries, error live regions, headings, labels and horizontal overflow are checked. Fixed missing skip/focus handling, input contrast (old 1.29:1), unannounced field errors, Access Pass heading order, chat report label/name mismatch and primary-button hover contrast. White photo captions now have a dark surface for legibility over bright images. Actual screen-reader/real-device review remains part of controlled pilot acceptance; automated checks do not certify full WCAG conformance.

Load: the [recorded PG16 local run](../../../docs/ops/evidence/task27-local-load.json) exercised 100 verified authenticated logical sessions, 20 simultaneous SSE streams and 3600 dynamic requests over 180 seconds at 20.003 requests/s. Setup includes 10 reviewed Tutors, 30 offers, 77 Connections, 1155 encrypted historical messages and 12 injected-provider purchase cycles. Search p95 56.4 ms, preference-write p95 25.6 ms, checkout-retry p95 42.3 ms and durable-chat acknowledgement p95 32.2 ms pass their respective 500/300 ms targets. Maximum generator lag was 31.2 ms; latencies include scheduling delay. Payment, notification/captured-mail and deadline workers run during traffic.

Permissions/durability: all 540 cross-account conversation/payment, blocked-history and suspended-supply/new-request probes were denied. Live streams revoked on blocking/suspension; forbidden history/contact/send/reconnect remained denied afterward. All 360 measured acknowledged messages were recovered through participant history/reconnect. Twelve provider captures produced one journal effect each despite replay, without premature activation.

Mobile: [five cold samples per populated route](../../../docs/ops/evidence/task27-local-mobile.json) under the adopted 390x844/DPR1, 4x CPU, 150 ms latency, 1.6/0.75 Mbps lab profile give home p75 LCP 2416 ms and search 2240 ms. Six photo-backed reviewed offers are present; the first home image is decoded and its responsive source checked. The initial uncompressed local proxy misrepresented deployment Caddy; matching gzip corrected that setup. Crucially, populated supply exposed a real 5064 ms home p75 with approximately 221 KB JPEGs. Local licensed fonts, bounded responsive WebP variants (about 87 KB in the textured fixture), first-image priority and immediate first-card visibility fix that bottleneck; later cards retain motion. Photo derivatives recheck current eligibility on every request, run processing outside the DB transaction, strip metadata and retain no new cache/copy. The API regression covers default JPEG compatibility, fixed variants, smaller transfers, suspension and withdrawal.

Release checks: 24 relevant Connection/discovery/public-page API scenarios and all 37 UI tests pass; root typecheck/build and runtime dependency audit pass (zero reported production vulnerabilities). The new client-error regression passes after its demonstrated failure. No migration or owner-data update was needed.

Limits: measured capacity is a local laptop result, not Mumbai VM/database sizing, public-internet latency or field Core Web Vitals. The local JSON mix excludes image-transform throughput and other workers/external-provider latency; the mobile profile measures real approved photo transfers separately. Repeat on isolated deployed staging, include the complete worker/image/provider mix and real devices, then record sizing/budget decisions before launch. Task 26's actual cloud deployment, budget/region/credentials and complete regional recovery/rollback evidence remain outstanding; Task 28 is not unlocked for live launch by these local results.

## Comments


