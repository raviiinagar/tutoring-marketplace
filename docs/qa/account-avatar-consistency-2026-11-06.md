# Account photo consistency - 6 November 2026

The account photo is now shared by Account Settings, learner dashboard, Tutor dashboard and desktop/mobile navbar. The existing uploaded portrait remains the source; users do not need to upload it again.

## Verified cause and change

Settings fetched `/v1/me/tutor/photo` independently. The learner dashboard rendered a generic icon and the navbar rendered initials; neither consumed that saved photo. `/v1/me` does not contain photo metadata. The API owner-preview endpoint permits clean pending/approved private portraits independently of public-ad eligibility. Metadata and private JPEG responses use `Cache-Control: no-store`; this was UI data-source inconsistency rather than a stale public-image cache.

A shared account-ID-keyed React Query cache now supplies the existing private owner preview to every avatar. It deduplicates concurrent requests, refreshes on focus, expires unused entries immediately, and updates all mounted avatars after successful replacement/removal. Late mutation results from a signed-out/different account are ignored. Initials appear only without a usable photo, including broken/rejected/removed images; loading metadata shows a placeholder. No public ad/photo URL is used for account avatars. Existing authorization and public-photo rules are unchanged.

The photo editor still only uploads/removes photos. Neither it nor the avatar cache calls profile/ad publication. Browser tests prove a clean upload and replacement leave the introduction/ad DRAFT and its public URL 404. Explicit publication, pause and deletion remain covered by the unchanged unified Tutor journey. Header accessible names include the visible fallback initial, verified with axe in both image and initials states.

## Checks and limits

- Red reproduction: Settings had the saved image, dashboard did not (6 passed / 1 failed).
- Final full UI: **219 passed**. Targeted real-PostgreSQL API suites: **27 passed**, zero skipped.
- Final browser: **12 passed**, zero failed/skipped, covering accessibility, QA01/QA05, actual photo upload/replacement/removal, refresh, logout/login and unified Tutor publication/deletion at desktop/mobile widths.
- Full repository typecheck and Cloudflare build passed. Changed UI lint: zero errors; three inherited warnings. Existing repository-wide lint debt remains under the owner's previously approved scoped-release exception.
- The compiled Cloudflare artifact additionally used an existing fictional account's stored portrait on the deployed HTTPS payment sandbox at 1440/390px. Settings, both dashboards and navbar matched after refresh/re-login, without page errors/overflow; profile remained PAUSED and ads remained empty. An operator-only browser API bridge retained the sandbox's configured origin. This is compiled-frontend/hosted-sandbox integration, not a claim to have accessed a real main user's private photo.
- No API source, migration, deployment configuration or credentials changed. The complete API suite was not repeated for this frontend-only change; photo/private-access/publication-related suites were repeated.
- Original root HEAD, grouped Git status and all **646** recorded dirty/untracked file hashes are unchanged. Work is isolated on `fix/account-avatar-consistency`; local test databases are retained.

Sanitized machine-readable evidence: [account-avatar-checks.json](evidence/2026-11-06/account-avatar-checks.json). The verified artifact is now deployed to the existing public staging site, as recorded below.

## Deployed result

- Source: `a4c1e13` on isolated branch `fix/account-avatar-consistency`.
- Public staging: https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev/
- Cloudflare version: `a4ae5f0f-c142-4320-be40-78b73698e9d3`.
- Previous compatible frontend version for rollback: `74cfc857-fad4-439f-ad64-ad11f298b5b1`.
- The served avatar JavaScript asset SHA256 matches the tested build. Actual public homepage/sign-in hydration, Tutor anonymous redirects and private-photo authorization passed at 1440/390px, with no page errors or horizontal overflow. Health/catalogue proxy calls returned 200, anonymous account/photo calls returned 401.
- Frontend only: backend remains `unified-onboarding-20261106-464c9fe50fa0`. No backend service restart, migration, configuration edit or main-user/photo/ad mutation was performed. No separate commercial production rollout or GitHub push was performed.
- Local browser stack and Wrangler preview stopped; PostgreSQL test data retained. Final root preservation check again passed for HEAD/status and all 646 recorded files.

### Changed files in source commit `a4c1e13`

- `lovable-ui/src/components/account-avatar.tsx`
- `lovable-ui/src/components/account-settings.tsx`
- `lovable-ui/src/components/account/ui.tsx`
- `lovable-ui/src/components/learner-dashboard.tsx`
- `lovable-ui/src/components/tutor-dashboard.tsx`
- `lovable-ui/src/components/tutor-photo-editor.tsx`
- `lovable-ui/src/lib/account-photo.ts`
- `lovable-ui/src/test/account-avatar.test.tsx`
- `lovable-ui/src/test/learner-dashboard.test.tsx`
- `lovable-ui/src/test/site-header.test.tsx`
- `tests/browser/account-avatar.spec.ts`
- `tests/browser/audit-ui-fixtures.ts`
- `tests/browser/audit-ui.spec.ts`
- `docs/qa/account-avatar-consistency-2026-11-06.md`
- `docs/qa/evidence/2026-11-06/account-avatar-checks.json`

The follow-up release-evidence commit changes only the two documentation/evidence files above.
