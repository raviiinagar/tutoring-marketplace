# 16: Expire requests and offer learner-selected alternatives

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 15 — Activate paid access once and connect accepted Tutors

**What to build:** Learners and Tutors see consistent response deadlines/reminders, expired requests stop accepting, and the Learner can choose relevant alternatives.

## Acceptance criteria

- [x] Each request expires after 72 hours, capped by the capture-based first-purchase no-match deadline where applicable.
- [x] Workers and synchronous decisions enforce the same strictly-before-deadline acceptance rule.
- [x] Late webhook/capture receipt cannot silently extend the promised purchase deadline.
- [x] Suggestions match the intent and neither charge nor release contact without explicit Learner selection.
- [x] Tests cover deadline equality, delayed workers, covered requests after pass expiry and replacement selection.

## Verification evidence

Implemented immutable 72-hour/capture-capped deadlines with shared strict equality projection; a bounded SKIP LOCKED worker persists expiry and deduplicated minimal RESPONSE_DUE/EXPIRED events. In-app reminders and server-anchored deadlines close response actions even with an incorrect device clock. Delayed workers never extend acceptance. External notification delivery follows task 20.

Owner-only, paginated alternatives match domain, Subject, level, curriculum/exam, online mode and a shared language; exclude the original/self Tutor, blocks, ineligible supply and already pending/accepted peer enquiries. Viewing/choosing suggestions has no billing/contact effect. Explicit selection prefills the original usable Learner and goals/times; normal covered submission remains authoritative. No deadline resets or automatic replacement charges.

Verification: 39/39 related API integration tests (Contact Requests, Connections, payments), including deadline equality before/after worker, parallel ticks, capture lateness, covered requests after pass expiry, explicit replacement selection and privacy. All 20 UI tests passed; production build and typecheck passed. The real Edge Tutor/browser journey passed with mobile alternative empty-state and overflow checks. Logs: `.local/task16-api.log`, `.local/task16-ui.log`, `.local/task16-build.log`, `.local/task16-typecheck.log`, `.local/task16-browser.log`. New migration 017; no live payment/email credentials are supplied or enabled.

## Comments


