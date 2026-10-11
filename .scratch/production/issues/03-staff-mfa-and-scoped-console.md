# 03: Sign in to a scoped staff console with MFA

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 02 — Manage roles, account recovery and sessions

**What to build:** The owner can enter a staff console using MFA and assigned support, trust or finance permissions, with an audited privileged session.

## Acceptance criteria

- [x] Staff bootstrap is an explicit secure operator action; public registration cannot create an administrator.
- [x] MFA enrollment, verification and recovery handling are demonstrable; secrets and recovery material are protected.
- [x] Support, trust and finance routes enforce their individual scopes even if one owner holds several.
- [x] The console displays only permitted navigation/data and privileged actions record actor, target and reason.
- [x] Tests deny missing MFA, unrelated staff scopes and reused/revoked privileged sessions.

## Verification evidence

Implemented and verified on 11 October 2026:

- Migration 003 adds independent staff assignments, encrypted MFA secrets/pending enrollment, hashed recovery codes and staff sessions. Existing migrations remain unchanged; development migration applied successfully.
- Explicit `staff:operator grant/revoke` commands require an environment label matching NODE_ENV and record operating-system operator, target identity, reason and scopes. Grant requires an active verified identity, does not register accounts and has no public HTTP endpoint. Revocation also works for disabled accounts. Grants/scope changes revoke existing privileged sessions. Public roles remain constrained to Learner/Tutor.
- Authenticator enrollment requires the account password, a ten-minute setup and confirmation from the original account session. TOTP uses six digits/30-second steps and records the accepted counter transactionally; repeated/concurrent codes cannot create another staff session. Secrets are encrypted and eight 128-bit recovery codes are returned once and stored only as digests.
- Staff sessions last thirty minutes, use a separate HttpOnly cookie and remain bound to the original ordinary account session. Password reset, account-session revocation, disabling, staff sign-out and operator revocation prevent subsequent scoped operations. Production cookies are Secure with the __Host- prefix, and raw tokens are not returned in JSON.
- Recovery requires password plus an unused backup code, invalidates all backups, clears the lost authenticator and revokes staff sessions. New enrollment is mandatory before scoped access. Ordinary password recovery retains the enrolled authenticator and cannot bypass MFA.
- The Lovable `/staff` route supports setup, one-time recovery-code display, reauthentication, recovery and sign-out. Its navigation includes only assigned Support/Trust/Finance areas; server routes separately enforce each scope, including an operator with all three. Initial scoped data is the access audit trail. Recording an access purpose audits actor, workspace target and reason. Case/evidence/financial actions remain later tickets and are not represented as implemented.
- `npm test`: 22 PostgreSQL/API tests and 9 UI unit tests passed. Security coverage includes RFC vectors beyond 2038, bootstrap/privilege rejection, setup expiration/session binding, OTP replay/concurrency, cross-session cookie copying, unrelated scopes, secret-free automatic audit metadata, session expiry/revocation, recovery replay, password reset without MFA bypass, rate limits and production cookie/token protection. The earlier recovery rate test now anchors its fake clock within one hourly bucket.
- `npm run typecheck` and `npm run build`: passed.
- After allowing operator revocation of disabled identities, all nine staff API tests were rerun and passed; build/typecheck were rerun and passed. The unchanged account and browser results remain applicable.
- Browser suite with Microsoft Edge: all 3 journeys passed. New staff journey grants only Support to a development fixture via the CLI, enrolls an authenticator, saves recovery material, checks hidden Trust/Finance navigation, records an access reason, signs out, recovers and enrolls a new authenticator, then revokes the fixture assignment. No owner account was automatically granted access.

Setup/API/security details: [docs/api/staff.md](../../../docs/api/staff.md). Live owner bootstrap and authenticator enrollment require the operator's selected verified account and private authenticator; they are documented, not invented or performed against the owner's identity. No paid/external MFA service is required. Live SMTP remains deferred until domain purchase. Deployment secret storage, time synchronization and infrastructure hardening remain release tasks.

## Comments

The owner instructed continuing after task 02; task 03 was the next dependency-ready ticket. Routine defaults are documented in the staff API guide. Task 04 is now the next numbered dependency-ready slice, followed by other catalogue/Tutor branches whose prerequisites are complete.


