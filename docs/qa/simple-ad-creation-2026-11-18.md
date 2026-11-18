# My ads: one-form creation

Owner follow-up to the released first-Tutor setup: **My ads → Create an ad** still opened ten steps. The original one-form release only handled `/tutor`; this was a separate retained entry into the ad editor, not a browser-cache issue.

Implemented and verified on `fix/simple-ad-creation`, based on released main `7a3317695349cae542daec809a77e989b9642c2d`, in `D:\WORK\P1\.local\simple-ad-creation`. The owner subsequently authorized commit, push, PR into main, normal merge after both CI jobs pass, and frontend-only deployment from merged main with pinned Wrangler 4.156.2 and `--keep-vars`. Root checkout and its existing CLAUDE.md change preserved. Release outcomes are recorded separately from this pre-release verification report.

Self-service creation now shows one responsive form, reuses the saved introduction/rate/photo, and offers **Preview my ad**, **Save as draft**, then a separate explicit **Publish my ad** in preview. Preview creates and publishes nothing. Online classes need no city; in-person location changes retain the saved availability. The suggested title follows the selected Subject until the owner customizes it. Saved shared profile details and existing ads are not overwritten. Optional trial controls and their current defaults are retained. Existing section editing and staff-assisted creation retain their established controls.

The existing API services, authorization, twelve-word title rule, photo consent/scanning/publication checks, staff restrictions and commercial rules remain authoritative. No API, migration, dependency or configuration change.

## Checks

| Check | Result |
| --- | --- |
| Focused route reproduction before fix | 2 failed: Ad title absent after Create an ad, with zero/existing ads |
| Final focused UI regressions | 10 passed, 0 failed |
| Full UI `npm --prefix lovable-ui test -- --maxWorkers=2` | 303 passed, 0 failed, 52 files (released baseline 293; ten added tests) |
| Full `npm run typecheck` | PASS |
| `npm --prefix lovable-ui run build:cloudflare` | PASS, build only |
| ESLint on changed UI files | PASS, 0 errors; two pre-existing load/effect hook warnings |
| New My ads desktop/mobile and first-Tutor browser journeys | 4 passed, 0 failed |
| New form/preview axe checks at 1440/390px | 4 scans, 0 violations |
| Existing accessibility + Tutor browser journey | 6 passed, 0 failed |
| Staff-assisted browser journey on a separate fresh stack | 1 passed, 0 failed |
| Final targeted browser total | 11 passed, 0 failed |
| Full API suite / entire browser suite / repository-wide lint | NOT RUN for this frontend follow-up |

Browser command groups use the unchanged Playwright configuration and timeouts, real isolated loopback API/PostgreSQL/worker/UI, and fictional accounts/images:

```text
npx playwright test tests/browser/my-ads-creation.spec.ts tests/browser/unified-tutor-onboarding.spec.ts
npx playwright test tests/browser/accessibility.spec.ts tests/browser/tutors.spec.ts
npx playwright test tests/browser/assisted-onboarding.spec.ts
```

No existing test was removed or skipped. The old wizard-step navigation/heading assertions in the Tutor journey were replaced with single-form access, reused-profile and unchanged-profile assertions; its private download, approval, free-trial, publication, financial, chat and revocation assertions are retained. The accessibility test no longer clicks the superseded Continue button before inspecting the title input.

An initial new browser case incorrectly assumed refresh selected its newly saved draft; the existing ad was selected instead. The test now explicitly selects the draft, keeps every privacy/publication assertion and cleans its own fictional ads in a finally block. A subsequent mixed run was invalidated by a workstation pause/session expiry and ERR_NETWORK_CHANGED. Fresh stacks were used for final verification. The existing staff-assisted test leaves published fixture supply, while the legacy Tutor discovery case expects one category result; those checks run on separate fresh stacks without changing the one-result assertion or application behavior.

## Evidence

- [Desktop form](evidence/2026-11-18/my-ads-form-1440.png)
- [Desktop preview](evidence/2026-11-18/my-ads-preview-1440.png)
- [Mobile form](evidence/2026-11-18/my-ads-form-390.png)
- [Mobile preview](evidence/2026-11-18/my-ads-preview-390.png)

These screenshots use the project's existing fictional testing configuration and hidden-section coverage. Live configuration was unchanged. No authenticated live journey is claimed. Unsaved My ads form values remain local until Save as draft; this path did not have the `/tutor` working-copy autosave before the fix and no new autosave/storage system is introduced here.

Test-generated changes to the previous dated screenshots and generated route-tree file were restored in this isolated worktree. Only the new 18 November evidence belongs to this follow-up.

## Requested pre-commit recheck

`npx playwright test tests/browser/assisted-onboarding.spec.ts tests/browser/unified-tutor-onboarding.spec.ts`: **3 passed, 0 failed** (staff-assisted once; self-service at 1440px and 390px). No application or spec changes were needed. The assisted test retained its page-based portrait upload, ad visible in the Tutor's own account, successful publication and `identity_verified: false` assertions.

The My ads manager obtains `tutorApi` from `useTutorApi()` and uses it for Tutor/profile/presence/photo reads, ad creation/edits and publication actions. Its only direct `api` call reads the public catalogue. `TutorPhotoEditor` also uploads through `tutorApi`. Staff `Workspace` provides `assistedTutorApi(request.id)` via `TutorApiContext`, targeting `/v1/staff/tutor-onboarding/:id/as-tutor`. The one-form condition is deliberately limited to `scope === "own"`; staff retains the working wizard. No commit, push or deployment was performed during this verification step.
