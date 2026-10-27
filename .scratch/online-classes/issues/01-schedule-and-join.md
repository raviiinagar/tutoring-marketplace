# 01: Schedule and join a private Google Meet class

Status: ready-for-agent
Resolution: in progress
Type: task

Build the Class Invitation slice described in ../spec.md. Show clear saved, rescheduled and cancelled outcomes in Connection details; link from private chat. Keep the existing marketplace payment and authorization boundaries.

## Acceptance criteria

- [ ] Tutor-only, Connection-scoped encrypted invitations with strict Google Meet URL/time validation.
- [ ] Idempotent create; revision-checked reschedule/cancel; authoritative Join permission/window.
- [ ] Export and erasure/retention cover the new private fields.
- [ ] Accessible scheduling form, status cards and Join action; no stale private links after denied access.
- [ ] Meaningful API/UI tests and hosted fictional sandbox verification.
- [ ] Document the separate real host-created Meet link/admission dependency.

## Comments

27 October 2026: owner selected website scheduling and a Join class button that opens Google Meet. Supplied meeting links are the initial implementation; no Google OAuth client or automatic room creation is assumed.
