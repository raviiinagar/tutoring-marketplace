# 27: Verify accessible journeys under pilot load

Status: ready-for-agent
Type: task
Blocked by: 12 — Send durable text messages and recover after reconnect; 23 — Export or delete personal data with tracked retention; 24 — Publish useful pages and inspect delivered matching value

**What to build:** Users complete core mobile/keyboard journeys under realistic pilot traffic, and the owner receives reproducible performance and permission evidence.

## Acceptance criteria

- [ ] Keyboard, focus, labels, error announcements and contrast are checked across discovery, checkout, Tutor, chat, support and privacy flows.
- [ ] Exercise 100 concurrent sessions including realtime users and 20 dynamic requests/second with a representative read/write/payment-callback mix.
- [ ] Measure proposed p95 first-party search/write ≤500 ms, durable chat acknowledgement ≤300 ms and agreed-profile p75 mobile LCP ≤2.5 seconds.
- [ ] Suspended supply, blocked conversations and cross-account reads remain denied under load and reconnect.
- [ ] Record actual bottlenecks and fix or resize before release; health-check throughput alone does not count.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


