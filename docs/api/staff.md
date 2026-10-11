# Staff access: task 03

The NestJS staff module owns assignment, authenticator enrollment, recovery and privileged sessions. Public Learner/Tutor roles never grant staff permissions. Staff assignment requires direct operator access to the database and application configuration; there is no public assignment endpoint.

## Operator setup

First register, verify and sign in through the ordinary account flow. With the development database running, explicitly grant only the required scopes:

```powershell
npm run staff:operator -- grant --email your-verified-email@example.com --scopes SUPPORT,TRUST,FINANCE --environment development --reason "Owner bootstrap for marketplace operations"
```

Use the actual verified email, not the example. Grant refuses inactive, pending and missing identities; it does not create accounts or skip verification. Revocation can remove an existing identity's permissions even while the account is disabled. `--environment` must match `NODE_ENV`. Grant and revoke record the operating-system operator, target identity, reason and scopes in audit history. Grant changes revoke existing staff sessions and require MFA again; privileges are not automatically assigned to an owner email or public signup.

```powershell
npm run staff:operator -- revoke --email your-verified-email@example.com --environment development --reason "Remove staff access for this account"
```

Production uses the built `apps/api/dist/staff-operator.js` with secrets injected through the operator environment and `--environment production`. Database/config access is a privileged deployment responsibility. Do not pass account passwords or MFA secrets in command arguments. In development, `npm run db:local` can keep the database available without starting the UI, API or worker. Stop that process with Ctrl+C.

Open `/account`, then **Open staff console**. Enter the account password to start MFA setup, add the displayed setup key to an authenticator app and confirm its current code. Setup lasts ten minutes and is bound to the account session that requested it. Save the eight recovery codes in private storage; they are returned only on successful enrollment and never retrievable from the API afterward. The UI keeps setup material only in temporary component state.

## Security defaults

- TOTP uses independent 160-bit random secrets, HMAC-SHA1, six digits and 30-second steps, with one adjacent step allowed for clock skew. Accepted counters are recorded under an account lock; codes cannot be reused across sessions, including concurrent submissions. Published SHA1 test vectors, including times beyond 2038, are checked against [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).
- Secrets, including pending setup, are AES-256-GCM encrypted using the application secret. Recovery codes have 128 random bits and are stored as SHA-256 digests. Changing the application encryption key needs a migration plan for staff secrets as well as outbox mail.
- Staff MFA attempts, including failed account-password checks, consume shared PostgreSQL limits of ten/account and thirty/IP per fifteen minutes. Public sign-in has its existing separate limits.
- Enrollment completion immediately creates a staff session. Subsequent staff sign-in requires both account password and an unused authenticator code. A staff session expires after thirty minutes and requires its original, still-valid account session. It cannot be copied to another account session.
- Staff sessions use a separate HttpOnly, SameSite=Lax cookie; production adds Secure and the `__Host-` prefix. Only token digests are stored. No staff token is returned in JSON or stored in localStorage.
- Each staff operation rechecks active verified account, ordinary session, enabled assignment, required scope and MFA session. Account logout, individual-session revocation, password reset or account disabling prevents further staff access. Scope changes and explicit staff revocation invalidate existing staff sessions.
- Recovery requires the account password and an unused recovery code. It invalidates all recovery codes, clears the lost authenticator and revokes every staff session. The account must enroll and confirm a new authenticator before any scoped access. Email/password recovery alone cannot bypass an already-enrolled authenticator. An owner who loses both authenticator and recovery material needs a separately verified operator process; no public bypass/reset-secret endpoint exists.

## API

All writes use strict JSON bodies, the existing Origin/CSRF checks and cookie credentials. MFA-related responses are no-store; capture mail has no role in MFA setup.

| Method/path | Body | Result |
|---|---|---|
| GET `/v1/staff/access` | None | Assigned scopes, `mfa_enrolled`, `authenticated`, `expires_at` |
| POST `/v1/staff/mfa/enrollments` | `{password}` | Temporary `secret`, `otpauth_uri`, `expires_at` |
| POST `/v1/staff/mfa/confirmations` | `{code}` | Staff cookie and one-time `recovery_codes` |
| POST `/v1/staff/sessions` | `{password,code}` | Staff cookie and `expires_at` |
| POST `/v1/staff/mfa/recoveries` | `{password,recovery_code}` | `MFA_ENROLLMENT_REQUIRED`; staff cookie cleared |
| DELETE `/v1/staff/sessions/current` | `{}` | 204 and cleared staff cookie |
| GET `/v1/staff/workspaces/:scope` | None | Only that scope's workspace access audit records |
| POST `/v1/staff/workspaces/:scope/access-checks` | `{reason}` | Audited access purpose; updated scoped history |

Scopes are `SUPPORT`, `TRUST`, `FINANCE`. An assigned account can hold any combination. The UI renders only its permitted navigation; every route also checks permissions on the server. Unauthenticated ordinary sessions return 401; unassigned/unrelated scopes return `STAFF_ACCESS_DENIED` (403); missing or expired staff MFA returns `STAFF_MFA_REQUIRED` (403). Invalid/replayed/expired codes return `INVALID_MFA` (400). An enrolled authenticator cannot be overwritten through the enrollment endpoint (409).

The initial workspaces show the access audit trail. Recording an access purpose requires a trimmed 10–240 character reason and audits the actor identity, workspace target and reason. Credentials and private evidence must not be entered in reasons. Automatic audit metadata contains identifiers and event facts, never passwords, authenticator secrets, OTPs, recovery material or session tokens. Case handling, evidence review and money operations remain their own tickets; no fabricated case/payment data or placeholder privileged finance actions are exposed.

## Verification

Use root `npm test`, `npm run typecheck`, `npm run build` and `npm run test:browser`. API tests use a separate fresh PostgreSQL cluster; browser fixtures are development accounts granted through the operator CLI and revoked in cleanup. The browser test does not provision the owner's real account or add live privileges.
