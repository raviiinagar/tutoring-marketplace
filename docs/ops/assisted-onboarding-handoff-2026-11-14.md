# Deployment handoff: assisted Tutor onboarding

Prepared 14 November 2026 for Codex. **Nothing here has been deployed, and no hosted database was touched.** All verification ran against isolated PostgreSQL clusters provisioned by the test harness. No secret values appear here.

## 1. What to deploy

| | |
|---|---|
| Branch | `feature/assisted-tutor-onboarding` (pushed; see its pull request for CI) |
| Release commit | The commit that adds this file (on top of `1b94289`) |
| Currently live API | `beta-community-api-20261110-77a49dfb4b76` (commit `77a49df`) |
| Currently live frontend | Cloudflare version `1db4b3c5-9383-450a-9ab8-ea909653e521` (commit `1d8142d`) |

Run `git log --oneline 77a49df..HEAD` to confirm. Everything between `77a49df` and `1d8142d` is frontend only (header links and ticker, hidden homepage sections, four-card grid, hidden Community, "Become a Tutor") and is already live on Cloudflare. **The backend change is `1b94289` only** (ADR0018).

## 2. Database: one additive migration

| File | Adds |
|---|---|
| `041-assisted-tutor-onboarding.sql` | `tutor_onboarding_requests` with a partial unique index (one active request per account) and a queue index |

It does not alter, drop or rewrite any existing table, column or row. Before applying, confirm the main database is at `040-community-chat.sql`. Follow the normal backup, maintenance and migration runbook.

The payment sandbox (port 4100) stays at migration 038, as last time. Do not deploy this release there.

**Rollback warning.** After 041 is applied, the release check (`apps/api/src/release-operator.ts check <APP_ENVIRONMENT> <candidate-migrations-directory> --traffic-stopped`) refuses any older candidate. **Do not plan to roll back by redeploying `77a49df`.** This feature has no environment switch. If something is wrong after release:

- If only the new pages misbehave, the owner rolls the frontend back to `1db4b3c5-9383-450a-9ab8-ea909653e521`. The old frontend has no entry points to the new routes, and the new table stays unused.
- If Tutors' own profile, photo, location or ad routes misbehave (this release routes them through a shared resolver), stop and report. A forward fix is the safe path; do not drop the table or edit migration 041.

## 3. Configuration

**No new environment variables.** Existing settings this release relies on:

- `EVIDENCE_SCANNER`, `CLAMAV_HOST`, `CLAMAV_PORT`: staff photo uploads for a Tutor use the same scanner as Tutors' own uploads.
- `ALLOWED_ORIGINS`: unchanged; the Cloudflare origin is already listed.
- Staff MFA: the new staff routes need the `SUPPORT` scope with an MFA-verified staff session, like other staff pages.

**Proxy.** No Caddy change. `POST /v1/staff/tutor-onboarding/:id/as-tutor/tutor/photo` uses the API's 1.4 MB upload limit, the same as `POST /v1/me/tutor/photo`; the Caddyfile sets no smaller request-body limit.

## 4. Order

1. Back up the database and enter maintenance mode, following the runbook.
2. Run `npm ci` and `npm run build -w @tutoring/contracts`, then build the API.
3. Apply migration 041 through the normal migration step, then run the release check (`release-operator check … --traffic-stopped`) against the candidate's migrations directory.
4. Start the API, leave maintenance mode and run the smoke checks in section 5.
5. Tell the owner the backend is live. **The owner deploys the frontend** from the same commit with `npm --prefix lovable-ui run build:cloudflare`, then `npx --yes wrangler@4.156.2 deploy --config .output/server/wrangler.json` from `lovable-ui/`.

The backend must go first: the new Tutor option and staff page call the new routes. Existing pages work in either order.

## 5. Smoke checks (read-only, no account needed)

```
GET https://<api-host>/v1/me/tutor/onboarding-help       → 401 (signed-out visitors see nothing)
GET https://<api-host>/v1/staff/tutor-onboarding          → 401
GET https://<api-host>/v1/tutor-policy                    → 200 (existing route unchanged)
GET https://<api-host>/v1/feedback-policy                 → 200, "enabled": true (previous release unaffected)
```

Report the applied migration list ending at 041. Do not create test requests on the live system. After the frontend deploy, the owner will test signed in.

## 6. Checks run locally

| Check | Result |
|---|---|
| API typecheck | Clean |
| Full API suite (`apps/api/test/*.test.ts`) | **249 tests: 248 pass, 0 fail, 1 skipped** (the existing PostgreSQL 16 recovery drill, which needs `PG_RECOVERY_BIN`) |
| New suite | `assisted-onboarding.test.ts` 2/2. Negative control: disabling the claimed-request check failed both tests; restored. `privacy.test.ts` covers export and deletion of requests |
| Frontend typecheck and lint (changed files) | Clean; no new lint errors |
| Frontend unit tests | **274 / 274 pass** |
| Browser | `assisted-onboarding.spec.ts` passes end to end (request, claim, Tutor's own wizards, photo upload through the page, publish, complete); `unified-tutor-onboarding.spec.ts` passes at 1440 and 390 px |

Not run: the full browser suite and the mobile LCP budget test. CI on the pull request covers the build, the API and UI suites and the pilot browser subset.
