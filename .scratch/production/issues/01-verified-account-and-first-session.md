# 01: Create a verified account and first session

Status: ready-for-agent
Resolution: completed (11 October 2026)
Type: task
Blocked by: None (can start immediately)

**What to build:** A user can register, verify an email address, sign in and reach an account screen in a runnable local application. Establish the web/API/worker/database foundation through this working journey.

## Acceptance criteria

- [x] Local startup and migrations produce the sign-up, verification and sign-in journey; clean setup is documented.
- [x] Verification tokens expire, are single-use and rate-limited; unverified users cannot perform private marketplace actions.
- [x] Passwords are securely hashed; session cookies and authenticated API access have appropriate security controls.
- [x] Tests prove normal verification, invalid/expired/replayed tokens and unauthorised access against PostgreSQL.
- [x] Development mail capture is visibly isolated from production; production rejects missing provider/secret configuration.

## Verification evidence

Implemented a runnable npm workspace with NestJS API, a separate durable mail worker, shared validation contracts, PostgreSQL migrations and Next.js account integration screens. The owner selected Lovable for the final product UI; [ADR-0009](../../../docs/adr/0009-lovable-ui-and-authoritative-api.md) records the updated choice and [the Lovable prompt](../../../docs/lovable/task-01-prompt.md) consumes the implemented API.

Checks run on Windows on 11 October 2026:

- `npm run setup:local`: initialized real native PostgreSQL and applied migrations with random local credentials. No Docker or operating-system user changes.
- `npm test`: **8 passed**, against a fresh PostgreSQL database. HTTP registration/verification/session journey; malformed/unknown/expired/replayed tokens; concurrent consumption (one 200, one 400); fresh verification email recovery; unverified/disabled/unauthenticated access; session expiry/revocation; duplicate signup and rate limits; strict inputs/Origin checks; password/token hashing and encrypted outbox; capture isolation and fail-closed production configuration; worker retry/expiry; database restart and idempotent migration ledger.
- `npm run test:browser` with `PLAYWRIGHT_CHANNEL=msedge`: **1 passed**, real signup → captured email → explicit verification → sign-in → account refresh → sign-out → private-route rejection. Fixed a Strict Mode fragment-read bug found by this test.
- `npm run typecheck`: passed across API/web/contracts.
- `npm run build`: passed API/contracts compilation and Next.js production build.
- `npm audit --omit=dev`: **0 vulnerabilities**. Updated the mail dependency before delivery.

The local PostgreSQL helper uses graceful `pg_ctl` shutdown on Windows; restart persistence was retested after replacing the wrapper's forced shutdown. Startup detects an already occupied PostgreSQL port rather than waiting indefinitely.

External follow-up: generate/export and integrate the final Lovable UI; supply real SMTP sender/domain and confirm delivery; provision a same-origin HTTPS deployment with database TLS, secrets and proxy-aware rate limiting. No live mail provider, deployment, guardian approval or full marketplace production readiness is claimed. Roles, password recovery and session inventory remain ticket 02. Triage `Status` is retained separately from the completed `Resolution`.

## Comments

Lovable integration follow-up: the imported UI now replaces the startup harness and uses the existing API. Latest checks: nine API integration tests, nine UI unit tests and two complete browser journeys passed on localhost and 127.0.0.1. Build/typecheck and both runtime dependency audits passed. Local Origin mismatch and SSR form-readiness issues were resolved. [Detailed evidence](../../../docs/lovable/connected-ui.md). Final styling approval and live deployment/provider checks remain external follow-up; no SMTP setup is required for local capture testing.


