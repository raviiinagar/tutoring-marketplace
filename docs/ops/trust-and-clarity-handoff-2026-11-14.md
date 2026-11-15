# Deployment handoff: trust and clarity fixes

Prepared 14 November 2026 for Codex. **Nothing here has been deployed, and no hosted database was touched.** All verification ran against isolated databases provisioned by the test harness. No secret values appear here.

## 1. What to deploy

| | |
|---|---|
| Branch | `feature/trust-and-clarity` (stacked on `feature/assisted-tutor-onboarding`, PR #3) |
| Release commit | The commit that adds this file |
| Currently live API | `assisted-onboarding-api-20261114-0266bdfbd273` (commit `0266bdf`) |
| Currently live frontend | Cloudflare version `028d1929-7d8a-4830-be1b-4ac862b3c419` |

Run `git log --oneline 0266bdf..HEAD` to confirm. Backend changes:

- `da67b12`: the public Tutor directory (`GET /v1/tutor-profiles`) lists only Tutors with at least one ad available for enquiries. Profiles stay reachable by link.
- `0632b20`: new Tutor photos wait for Trust approval before appearing (ADR0019). A clean photo awaiting review still allows publishing an ad.

The other commits are frontend only (identity badge, plain language, one name for enquiries and messages).

## 2. Database

**No migration.** The main database stays at `041-assisted-tutor-onboarding.sql`. Follow the normal backup and maintenance runbook anyway.

## 3. Configuration

| Name | Value | Notes |
|---|---|---|
| `PHOTO_REVIEW_REQUIRED` | leave unset, or `true` | Unset means **on** in production. Any value other than `true` or `false` stops the API from starting |

Nothing else changes. Main API (port 4000) only; leave the payment sandbox unchanged. No Caddy change.

## 4. Order

1. Back up the database and enter maintenance mode, following the runbook.
2. Run `npm ci` and `npm run build -w @tutoring/contracts`, then build the API. Run the release check against the candidate's migrations directory (it should report 41 migrations, none new).
3. Start the API and worker, leave maintenance mode and run the smoke checks in section 5.
4. Tell the owner the backend is live. **The owner deploys the frontend** from the same commit.

## 5. Smoke checks (read-only, no account needed)

```
GET https://<api-host>/v1/tutor-profiles            → 200; only Tutors with a live ad (on 14 November: Vinay, Ravi nagar, Chetan)
GET https://<api-host>/v1/tutor-profiles/<public id of a Tutor without an ad> → 200 (still reachable by link)
GET https://<api-host>/v1/discovery?limit=6          → 200, unchanged
GET https://<api-host>/v1/feedback-policy            → 200, "enabled": true
```

Existing approved or self-published photos must still appear on public profiles; only new uploads wait for review. Do not upload photos or create records on the live system.

## 6. Rollback

No migration, so either option is safe:

- To turn photo review off: set `PHOTO_REVIEW_REQUIRED=false` and restart the API.
- To undo the release: redeploy `0266bdf`. Photos uploaded while review was on stay pending in the Portrait reviews queue; a Trust approval still makes them public. Ads already online stay online.

## 7. Checks run locally

| Check | Result |
|---|---|
| API typecheck | Clean |
| Full API suite | **250 tests: 249 pass, 0 fail, 1 skipped** (the existing PostgreSQL 16 recovery drill) |
| New suite | `photo-review.test.ts` 1/1, with a negative control (making new photos public again failed it); `tutor-simple.test.ts` covers the directory rule both ways |
| Frontend typecheck | Clean |
| Frontend unit tests | **275 / 275 pass** |
| Browser | `discovery`, `tutors`, `inbox`, `inbox-requests` specs pass with the new wording |
