# Deployment handoff: sign in with Google

Prepared 17 November 2026 for Codex. **Nothing here has been deployed.** All verification ran against isolated databases and a fictional Google token endpoint. No secret values appear here.

## 1. What to deploy

| | |
|---|---|
| Branch | `feature/google-sign-in` (stacked on `feature/polish`, PR #5) |
| Release commit | The commit that adds this file (on top of `9c5ec31`) |
| Currently live API | The release built from `feature/polish` `d9787eb` (every published Tutor listed) |

Backend change: `9c5ec31` (ADR0020). It adds `/v1/auth/providers`, `/v1/auth/google/start` and `/v1/auth/google/callback`.

## 2. Database: one additive migration

| File | Adds |
|---|---|
| `042-google-sign-in.sql` | `user_identities` (one Google link per account) and `oauth_states` (one-time sign-in attempts) |

Confirm the main database is at `041-assisted-tutor-onboarding.sql`, then follow the backup, maintenance and migration runbook. Payment sandbox: do not deploy.

**Rollback.** After 042 is applied, an older candidate fails the release check. To switch Google sign-in off, unset both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and restart: the button disappears and the routes redirect to the sign-in page with "unavailable". Keep the tables.

## 3. Configuration (main API, port 4000 only)

| Name | Value | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `381454877599-g08dqvnkph0o558ddkspg2vr4453rd5l.apps.googleusercontent.com` | Not secret |
| `GOOGLE_CLIENT_SECRET` | from the owner, directly into the protected environment file | **Secret.** Do not paste it into chat, logs, commits or reports. Setting only one of the two stops the API from starting |
| `GOOGLE_REDIRECT_URI` | usually leave unset | Defaults to `WEB_ORIGIN` + `/v1/auth/google/callback` |

**Check before starting:** the callback must be exactly `https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev/v1/auth/google/callback`, which is the authorised redirect URI in the Google client. If the hosted `WEB_ORIGIN` is not exactly `https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev`, set `GOOGLE_REDIRECT_URI` to that callback instead of changing `WEB_ORIGIN`. Report which applied, without secret values.

The API must be able to reach `https://oauth2.googleapis.com/token` over HTTPS (outbound). No Caddy change is needed: the frontend already forwards `/v1` to the API, including these GET routes.

## 4. Order

1. Back up and enter maintenance mode.
2. `npm ci`, `npm run build -w @tutoring/contracts`, build the API.
3. Apply migration 042 and run the release check against the candidate's migrations directory.
4. Set the configuration in section 3, start the API and worker, leave maintenance mode.
5. Run the smoke checks below, then tell the owner. **The owner deploys the frontend** from the same commit.

## 5. Smoke checks (read-only)

```
GET https://<api-host>/v1/auth/providers        → 200 {"google":true}
GET https://<api-host>/v1/auth/google/start      → 302 to https://accounts.google.com/o/oauth2/v2/auth?... with
                                                   client_id=381454877599-..., the redirect_uri from section 3,
                                                   code_challenge_method=S256 (do not follow it)
GET https://<api-host>/v1/auth/google/callback   → 302 to /auth/signin?google=failed (no state: correctly refused)
GET https://<api-host>/v1/tutor-profiles         → 200, unchanged
```

Do not complete a Google sign-in on the live system; the owner will test with a Google test user.

## 6. Checks run locally

| Check | Result |
|---|---|
| API typecheck | Clean |
| New suite | `google-sign-in.test.ts` 3/3 (PKCE, state replay, browser binding, nonce, audience, issuer, expiry, unverified email, cancellation, return addresses, linking, pending and disabled accounts, a second Google account). Negative control: removing the nonce check failed it |
| Related suites | `privacy.test.ts` (export and deletion of the link) and `auth.test.ts` pass: 23/23 together |
| Frontend | Typecheck clean; `google-sign-in.test.tsx`, `auth-guidance.test.tsx`, `account.test.ts` pass |
| Full API and UI suites | Run by CI on the pull request |
