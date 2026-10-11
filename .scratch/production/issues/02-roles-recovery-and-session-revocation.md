# 02: Manage roles, account recovery and sessions

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 01 — Create a verified account and first session

**What to build:** An account holder can use Learner and Tutor roles, recover access and revoke sessions without gaining staff privileges.

## Acceptance criteria

- [x] The same identity can have Learner and Tutor roles; self-service cannot grant staff roles.
- [x] Password recovery is expiring, single-use, enumeration-resistant and reflected in the account UI.
- [x] Session revocation takes effect on subsequent authenticated operations and the user can inspect active sessions.
- [x] Disabled accounts lose private access; ownership and role changes are audited without secrets.
- [x] Integration tests cover duplicate identities, recovery replay, privilege escalation and revoked sessions.

## Verification evidence

Implemented and verified on 11 October 2026:

- Migration 002 adds constrained Learner/Tutor roles, hashed password reset tokens and audit metadata; migration 001 stays unchanged. Existing accounts default to Learner. Development migration applied successfully without replacing configuration or data.
- One identity holds one or both roles; strict request schemas reject staff values, duplicate/empty roles and extra privilege fields. Role changes audit the actor and previous/new roles. Tutor role does not grant publication approval. Account ownership/email changes are not exposed; registration and password recovery ownership events retain user/correlation identifiers without secrets.
- Recovery gives the same response for eligible, unknown and disabled identities; only active verified identities get encrypted outbox mail. Links expire after 15 minutes, use URL fragments, and require explicit password submission. A successful reset consumes every outstanding reset token and revokes every session atomically. Concurrent use succeeds once; disabled accounts cannot reset themselves into access. Login rechecks the password hash under the account lock against concurrent resets.
- Session inventory exposes only the caller's active sessions with creation/expiry dates and a current-session marker. Individual revocation and sign-out of other sessions enforce ownership; foreign IDs return 404. Subsequent reads and role writes reject revoked/disabled access. No session tokens are returned.
- Lovable account UI supports role selection and session controls. Sign-in links to password recovery, local inbox shows reset emails, and reset success directs the user to sign in with the new password. Backend remains authoritative; cookies are HttpOnly and no credentials are stored in localStorage.
- `npm test`: 13 real-PostgreSQL HTTP integration tests and 9 existing UI unit tests passed. Covers duplicate identities, staff escalation, cross-account session IDs, revoked/disabled access, reset deadline equality/replay/concurrency, sibling reset invalidation, multi-session revocation, encryption and secret-free audit events.
- `npm run typecheck` and `npm run build`: passed.
- Browser tests using Microsoft Edge: 2 complete journeys passed, on localhost and 127.0.0.1. Each covers registration/verification, login/refresh, persistent Tutor role selection, a separate browser session and revocation, logout, recovery through captured mail, password reset and login with the new password. Expanded journeys have a 120-second limit and wait for committed writes before checking persistence/revocation.

Live SMTP/domain verification remains deferred by the owner. Local mail capture tests recovery delivery; real inbox delivery remains a launch dependency. Staff provisioning/MFA is ticket 03; Tutor approval and profiles remain later tickets.

## Comments

The owner authorized starting task 02. Routine security/UI defaults follow the production specification and ADR-0009. Next dependency-ready ticket: 03, scoped staff console with MFA.


