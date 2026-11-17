# One-form Tutor setup - 17 November 2026

Implemented on `feature/simple-tutor-setup`, based on committed `d9787eb`, in `D:\WORK\P1\.local\simple-tutor-setup`. After local verification, the owner authorized a feature commit, push, PR and CI. The PR is stacked on `feature/polish` (PR #5), whose head is the exact baseline. No deployment is authorized or performed. Root checkout and its existing CLAUDE.md change preserved.

## Result

First-time Tutors, returning owners with a private profile and no ad, and owners resuming a one-form draft now complete one form, preview their first ad, then explicitly choose **Publish for free**. Existing profile/ad editing and staff-assisted wizards remain intact. Team setup remains reachable as a secondary collapsed choice.

- Prefill the account name or saved introduction; ask for the Subject, relevant category/level/board or exam, Teaching Language, mode, hourly rate and one introduction. Reuse that introduction/rate in the ad instead of asking twice. Ask for city/country only for in-person teaching.
- Generate an editable title meeting the existing 12-word rule. Do not invent credentials, identity verification or experience. First ads explicitly offer no free trial by default; the existing ad manager retains trial editing.
- Debounced autosave and Save draft retain partial progress privately. Complete draft/preview actions save the introduction, presence, optional consented portrait and one private ad through existing API services. Photo files are uploaded only on complete draft/preview save, never put into the working-copy JSON; the UI explains that unsaved file selections must be uploaded.
- Reuse a suitable saved photo. A draft can be saved without a photo, while Publish remains disabled without a server-publishable photo. Existing photo review/scanning and explicit portrait consent remain authoritative. Upload/preview/draft actions never publish.
- Preserve previous Subjects, identity settings, public-email consent, revision checks, unrelated ads and declared availability. Do not promise enquiries when a published ad is unavailable. Recover a successful draft create after a lost response without making another ad.
- A browser-discovered race was fixed: late StrictMode initial responses and refreshed parent catalogue object identities must not reset a form already being filled. Both cases have explicit regression tests.

## Backend and release requirements

The only backend change is an optional, bounded `quick_setup` object in the existing encrypted onboarding-draft validator. It records teaching choices and the draft's ad identifier for refresh/resume. No new endpoint, migration, table, environment variable or commercial/authorization rule. Ownership and publication still go through the existing server services. Tests reject extra publication flags, image bytes and foreign-user properties.

Deploy this additive API change before a future matching frontend release: the previous strict draft validator does not accept the new optional field. Deployment was not requested or performed here.

## Checks

| Check | Result |
| --- | --- |
| UI baseline, `npm --prefix lovable-ui test` | 275 passed, 0 failed |
| Final UI, `npm --prefix lovable-ui test -- --maxWorkers=2` | 291 passed, 0 failed; 50 files |
| API: onboarding drafts, photo review, assisted onboarding | 10 passed, 0 failed/skipped |
| Full API suite | Not run locally; GitHub CI run `44139392241` passed 253/253, 0 failures |
| `npm run typecheck` | PASS (all configured workspaces and pilot types) |
| Final `npx tsc -p lovable-ui --noEmit` | PASS |
| `npx tsc -p apps/api --noEmit` | PASS |
| Contracts build / API build | PASS |
| `npm --prefix lovable-ui run build:cloudflare` | PASS; build only |
| Changed UI files, ESLint | PASS, 0 errors; one existing parent `load` hook-dependency warning |
| Repository-wide UI lint | FAIL: 37,196 CRLF/formatting errors plus 9 existing errors in untouched enquiry/payment/privacy/saved-tutor/support/presence files; 47 warnings. No unrelated formatting or typing edits made |
| Browser self-service journey, 1440px and 390px | 2 passed |
| Browser staff-assisted journey | 1 passed |
| Axe on the new form and preview at both widths | 4 scans, 0 violations |
| Pilot review/accessibility follow-up | Six distinct cases passed locally; the signed-in case was rerun after correcting its loading-shell wait |
| Full browser suite | NOT RUN; CI runs the configured pilot subset |
| Git whitespace check | PASS |

API command: `node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json --test --test-concurrency=1 apps/api/test/tutor-onboarding-drafts.test.ts apps/api/test/photo-review.test.ts apps/api/test/assisted-onboarding.test.ts`.

Browser checks used the project's real isolated loopback API/worker/PostgreSQL/Vite stack and fictional accounts/images. The normal harness first hit its 120-second startup limit; the pinned Chromium binary also needed installing. The warmed stack was then exercised with an ignored temporary Playwright config importing the normal config and using that already-running server. Test assertions and timeouts were not relaxed. The stack was stopped; no live account, upload or database was used.

An initial concurrent UI/browser run exposed resource-contention timeouts in three existing tests and a missing spy in a new test. The spy was corrected and the final complete suite passed with two UI workers and no test-timeout changes.

## Preserved assertions / navigation updates

No existing test was deleted or skipped. Self-service browser navigation now uses one form rather than 15 wizard steps, with exact combobox-role selectors. It still asserts role selection, private resume, no automatic publication, photo-less draft, publication being disabled without a photo, photo upload not publishing, a single persisted ad, explicit publication, unverified identity, no horizontal overflow, pause/resume and archive. It adds real portrait upload through the form and axe scans. The staff-assisted browser test adds one action opening the new secondary help section; its remaining flow/assertions are unchanged.

The returning-Tutor unit fixture now explicitly includes its already-existing ad so management tests do not accidentally represent a new first-ad owner. All its assertions remain. Sixteen new UI cases cover the one-form workflow and failure/retry/race boundaries. Two API cases cover the extended private draft.

The first PR #6 CI run passed full API/UI tests, types and artifact build but found two additional stale pilot assumptions: an old Physics checkbox in the review journey and an Edit profile button in the signed-in accessibility journey. The review fixture now creates a real private profile/ad through the owner APIs, asserts it remains private after review, and archives that setup draft before exercising ad creation. All its private download, approval, publication, financial-mode and revocation assertions remain. Accessibility chooses the exact expected first-ad or returning-Tutor state from the owner's ad list, waits for the actual form rather than its loading shell, and keeps the existing editable-name, contrast, keyboard and axe checks. No test assertions or configured timeouts were relaxed. These follow-up changes affect tests only; the application code remains that verified in the initial CI run. The PR is rerun in CI after this follow-up.

## Screenshots

These come from the isolated development harness, which enables the project's hidden sections for test coverage. Site visibility configuration was not changed.

- [Desktop form](evidence/2026-11-17/simple-tutor-form-1440.png)
- [Desktop preview](evidence/2026-11-17/simple-tutor-preview-1440.png)
- [Mobile form](evidence/2026-11-17/simple-tutor-form-390.png)
- [Mobile preview](evidence/2026-11-17/simple-tutor-preview-390.png)

## Changed files

- `apps/api/src/tutor-onboarding-drafts.ts`
- `apps/api/test/tutor-onboarding-drafts.test.ts`
- `lovable-ui/src/components/simple-tutor-setup.tsx` (new)
- `lovable-ui/src/components/tutor-onboarding.tsx`
- `lovable-ui/src/lib/api.ts`
- `lovable-ui/src/test/simple-tutor-setup.test.tsx` (new)
- `lovable-ui/src/test/tutor-onboarding.test.tsx`
- `tests/browser/unified-tutor-onboarding.spec.ts`
- `tests/browser/assisted-onboarding.spec.ts`
- `tests/browser/tutors.spec.ts`
- `tests/browser/accessibility.spec.ts`
- `.scratch/simple-tutor-setup/spec.md` and `issues/01-one-form-first-ad.md` (new)
- This report and the four screenshots above (new)

Generated route-tree content is unchanged. No production configuration, package/lock file or credential was changed. No claim is made about production onboarding time; a 2-3 minute completion target still needs real-user testing.
