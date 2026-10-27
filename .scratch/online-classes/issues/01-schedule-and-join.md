# 01: Schedule and join a private Google Meet class

Status: ready-for-agent
Resolution: completed (27 October 2026; supplied-link integration)
Type: task

Build the Class Invitation slice described in ../spec.md. Show clear saved, rescheduled and cancelled outcomes in Connection details; link from private chat. Keep the existing marketplace payment and authorization boundaries.

## Acceptance criteria

- [x] Tutor-only, Connection-scoped encrypted invitations with strict Google Meet URL/time validation.
- [x] Idempotent create; revision-checked reschedule/cancel; authoritative Join permission/window.
- [x] Export and erasure/retention cover the new private fields.
- [x] Accessible scheduling form, status cards and Join action; no stale private links after denied access.
- [x] Meaningful API/UI tests and hosted fictional sandbox verification.
- [x] Document the separate real host-created Meet link/admission dependency.

## Comments

27 October 2026: owner selected website scheduling and a Join class button that opens Google Meet. Supplied meeting links are the initial implementation; no Google OAuth client or automatic room creation is assumed.

Implemented migration 029 and the participant-authorized Class Invitation API. New API tests: 5 passed; existing chat/privacy regression scenarios: 19 passed; full UI suite: 48 passed. API/UI typechecks and focused UI lint passed. Browser verification on the hosted sandbox covered Tutor scheduling, Learner visibility, authenticated navigation to the canonical Meet URL, reschedule persistence, early-Join controls, cancellation, unrelated-account denial and 390px layout. The external Google navigation was intercepted for the automated fixture; no real video call or working room is claimed.

The reviewed API source was deployed as a checksum-verified portable overlay on the existing verified Linux release with identical dependency lock; no Windows native modules were shipped. Independent staging backups completed before and after the additive migration. Both sandbox and ordinary staging use migration 029; the production-runtime staging gate keeps real payments disabled. See docs/ops/google-meet-classes-2026-10-27.md for release and acceptance evidence. Manual Learner/Tutor class windows were opened; the Tutor supplies their own real Google Meet link to perform the final human video-call test.
