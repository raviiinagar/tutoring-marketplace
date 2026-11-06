# Deployment handoff: unified Tutor onboarding and publication rules

Prepared 2026-11-06 for Codex. **Nothing here has been deployed, and no hosted database was touched.** All verification ran against a local isolated PostgreSQL provisioned by the test harness.

No secret values appear in this document. Where a credential is required, only its environment-variable **name** is given.

## 1. What changed

### Database

**No migration is required.** This was checked, not assumed:

- `tutor_onboarding_drafts` already references `users(id)`, not `tutor_profiles`, so an account with no Tutor profile can hold a draft. The role change needs no schema support.
- Its `step` check constraint is `BETWEEN 0 AND 4`, which already matches the five wizard steps.
- Legacy version 1 profiles need no backfill. They upgrade to `onboarding_version = 2` in place when their owner saves the unified introduction, and `encrypted_birth_date`, `public_id` and `created_at` are preserved because the existing `ON CONFLICT ... DO UPDATE` list never touches those columns.

The latest migration on disk remains `038-direct-tutor-publication.sql`. **Do not expect a new migration file in this change.**

### API behaviour

| Area | Before | After |
| --- | --- | --- |
| `GET /v1/me/tutor/onboarding-draft` | `403 TUTOR_ROLE_REQUIRED` without the role | `200 {draft: null}` for any signed-in account |
| `POST` (save draft) | `403` without the role | Records the `TUTOR` role on first save, audited `TUTOR_ROLE_SELECTED` |
| `DELETE` (clear draft) | `403` without the role | Allowed for the owner |
| Publish / submit / resume an ad | No photo check | Requires a usable portrait, else `409 PHOTO_REQUIRED` |
| Ad description | Minimum 40 characters, 40 words to publish | Any non-empty text |
| Introduction biography | Minimum 40 characters, 40 words to publish | Any non-empty text |

A usable portrait means an approved photo, or a self-published pending one, with `scan_status = 'CLEAN'` — the same predicate the public portrait already uses. Staff approval is **not** required, so no review queue is introduced and ADR0014 free direct publication is preserved.

The photo requirement applies only to transitions that put an ad in front of learners. **Editing an ad that is already online does not require it**, so existing live ads are never blocked or unpublished by this change.

### Frontend

- One onboarding journey. The parallel legacy editor in `tutor-onboarding.tsx` is removed; `TutorIntroductionWizard` now handles both creating and editing, seeded from any saved profile.
- Identity country, identity document, public email consent and the replace-identity control appear in the wizard **only when editing an existing profile**, keeping first-time onboarding free of identity friction.
- The role gates on `/tutor` and on the teaching workspace are gone. An account that has not started is invited to begin, not asked to pick a role.
- The workspace states explicitly whether anything is published.
- Publish is disabled with an explanation until a photo exists; Save as draft stays available.

## 2. Environment variables

**No new environment variable is introduced by this change.** The existing names already required by the API are unchanged, including `DATABASE_URL`, `AUTH_SECRET`, `WEB_ORIGIN`, `ALLOWED_ORIGINS`, `NODE_ENV`, `APP_ENVIRONMENT`, `MAIL_TRANSPORT` and `EVIDENCE_SCANNER`.

Two existing settings affect the new photo rule and should be confirmed for the target environment before release:

- `EVIDENCE_SCANNER` — a portrait satisfies the publication rule only once it scans `CLEAN`. If scanning is unavailable or misconfigured, tutors cannot publish. Check `CLAMAV_HOST` and `CLAMAV_PORT` where a real scanner is used.
- `NODE_ENV` / `APP_ENVIRONMENT` — in production mode, `test_only` photos are rejected by the same predicate.

No secret values are recorded here; retrieve them through the existing secret-handling procedure in `AGENTS.md`.

## 3. Checks run locally

Run from the repository root. The API suites provision their own isolated PostgreSQL.

| Check | Command | Result |
| --- | --- | --- |
| API typecheck | `npx tsc -p apps/api --noEmit` | Clean |
| Frontend typecheck | `npx tsc -p lovable-ui --noEmit` | Clean |
| Frontend tests | `npm --prefix lovable-ui test` | **197 passed, 0 failed** (40 files) |
| Draft endpoints | `npx tsx --tsconfig apps/api/tsconfig.json --test apps/api/test/tutor-onboarding-drafts.test.ts` | 4 passed, 0 failed |
| Auth | same runner, `auth.test.ts` | 13 passed, 0 failed |
| Tutor reputation | same runner, `tutor-reputation.test.ts` | 3 passed, 0 failed |
| Listings | same runner, `listings.test.ts` | 5 passed, **7 failed (pre-existing)** |
| Privacy | same runner, `privacy.test.ts` | 5 passed, **2 failed (pre-existing)** |
| Tutors | same runner, `tutors.test.ts` | 6 passed, **1 failed (pre-existing)** |
| Tutor simple | same runner, `tutor-simple.test.ts` | 2 passed, **8 failed (pre-existing)** |

`npm test` and `npm run typecheck` were not run end to end, so treat the suites not listed above as **unrun**. No browser or accessibility suite was run.

## 4. Pre-existing failures — read before release

The working tree contains substantial uncommitted work that predates this change, and parts of it already fail. **These failures are not caused by this change.** That was verified by reverting only this change's edits and re-running the same suites with the same metric:

| Suite | Baseline (this change reverted) | With this change |
| --- | --- | --- |
| `listings` | 7 failed | 7 failed |
| `privacy` | 2 failed | 2 failed |
| `tutors` | 1 failed | 1 failed |
| `tutor-simple` | 8 failed | 8 failed |

Root cause of the listings and privacy failures: the uncommitted work added a 12-word minimum ad title enforced on `SUBMIT`, while those suites' fixtures still use a four-word title (`Physics with worked examples`). Their publish helpers therefore receive `400`. The legacy `/v1/me/tutor` fixtures also lack the declared subjects and hourly rate that direct publication now expects, producing `409 PROFILE_INCOMPLETE`.

Fixing those fixtures means changing assertions that the uncommitted work owns, so they were deliberately left untouched. **Resolve these before release**; a green API suite is a release prerequisite, and this change does not deliver one.

## 5. Deployment steps

1. Review the pre-existing failures in section 4 and decide whether they block release.
2. Build shared contracts first: `npm run build -w @tutoring/contracts`.
3. No migration to apply. Confirm the target database is already at `038-direct-tutor-publication`.
4. Deploy API and frontend together. The frontend publish gate mirrors a server rule: an older frontend against the new API would show an enabled Publish button that fails with `409 PHOTO_REQUIRED`, and an older API with the new frontend would allow publishing without a photo.
5. Confirm `EVIDENCE_SCANNER` and the scanner host settings in the target environment, since publication now depends on a clean portrait scan.

## 6. Rollback

No schema change, so rollback is a code redeploy. Published ads are unaffected: the photo rule gates only new publication transitions, and nothing in this change unpublishes or deletes an ad. Accounts that acquired the `TUTOR` role by saving a draft keep it; that role grants workspace access only and makes nothing public.

## 7. Known gaps

- The API suite is not green, for the pre-existing reasons in section 4.
- Suites outside those listed in section 3 were not run.
- Superprof's own step order was research input only. The implementation follows our rules where they differ, most importantly that completing the form never publishes.
