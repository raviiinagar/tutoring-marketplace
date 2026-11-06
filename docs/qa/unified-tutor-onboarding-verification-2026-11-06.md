# Unified Tutor onboarding verification - 6 November 2026

## Scope and policy

Claude's [handoff](../ops/unified-tutor-onboarding-handoff-2026-11-06.md) was inspected against the actual source, not accepted as release evidence. Work is isolated on `feature/unified-tutor-onboarding`, based on the previously deployed `ddf8763`. The root checkout and its uncommitted work are preserved.

The **12-word ad title minimum is intended**, documented in `docs/api/direct-tutor-publication.md` and `docs/superprof-user-flows.md`. It remains enforced, with the existing 160-character maximum. The unified flow accepts a non-empty introduction and class description. [ADR0014](../adr/0014-free-direct-ad-publication-and-optional-identity.md) keeps identity optional, ads free, publication explicit, and Learner Access and public-contact rules separate.

## Reproduction and corrections

The reported suites were reproduced with their original handoff tests: listings **5 pass / 7 fail**, privacy **5 / 2**, tutors **6 / 1**, tutor-simple **2 / 8**, drafts **4 / 0**. Effective baseline: **22 pass / 18 fail across 40 cases**. An initial listings setup attempt hit a local PostgreSQL directory-creation race; the unchanged listings rerun above is the valid baseline.

Shared positive publication fixtures now use a valid title, declare real catalogue subjects/rates, and upload a consented synthetic portrait through the real upload API. They retain the description supplied by each test. Negative short-title and empty-content assertions remain intact. No fabricated review approval or intercepted successful response replaces a real publication request.

Actual implementation bugs corrected:

- The imported RESUME branch had reintroduced the deployed content-validation bypass. RESUME now runs publication validation. Only unchanged, previously staff-approved `review-v1` ads retain the documented legacy-text exception; an edit removes that exception.
- Legacy staff APPROVE bypassed title and portrait validation. A new HTTP regression reproduced **expected 409, actual 200** before the fix. APPROVE now applies the same publication checks.
- The ad manager enabled Publish/Resume without a usable portrait. Its controls and the editor now share a strict CLEAN + APPROVED or explicitly self-published PENDING predicate. Missing consent flags are not treated as consent. Online edits, pause and deletion remain available without a new photo.
- The Learner header still sent first-time teachers to manual role selection. It now opens the unified private wizard. Navigation alone grants no role; the first successful private draft save records Tutor atomically and retains Learner.
- Browser axe found the wizard's active step at 4:1 contrast. Its text changed from `#cf3e50` to `#b93044` against `#ffe7e8`; the full accessibility checks now pass.

Outdated expectations were rebased to ADR0014: creating a free private ad does not require Pro; Pro expiry does not hide a free ad but does hide consented public email; accepting an already covered ordinary enquiry does not require Tutor Pro. Optional identity approval does not auto-publish a profile. Private qualification checks retain their subject, expiry, revocation and revision assertions. The invalid class-description case now uses whitespace rather than an obsolete 40-word minimum. Existing financial, concurrency, authorization and safety assertions remain.

Browser audit fixtures archive their own ads, pause their introductions and remove their own test portraits after scanning. The photo review test selects its named Tutor case rather than assuming the entire queue contains one photo. This fixes cross-test supply/queue contamination without weakening empty-result, accessibility or reviewer assertions.

## Release checks

| Check | Result |
| --- | --- |
| Full API suite, PostgreSQL 16, matching PG16 recovery tools | **240 passed, 0 failed, 0 skipped** |
| Full UI suite | **206 passed, 0 failed**, 41 files |
| Full browser suite in installed Chrome | **23 passed, 0 failed, 1 inherited performance prerequisite skip**, 0 flaky |
| Full root `npm run typecheck` | Passed, including contracts, API, legacy web, Lovable UI and pilot types |
| `npm run build` | Contracts/API/Node frontend passed |
| Final `npm --prefix lovable-ui run build:cloudflare` | Passed |
| Cloudflare proxy/browser-config/pilot-readiness script tests | **6 passed** |
| Built Cloudflare artifact under local Wrangler | Homepage/sign-in hydrated at 1440 and 390px, no overflow or browser page errors |
| ESLint on the 13 changed UI files | **0 errors**, 7 warnings |

New API regressions prove private drafts without photos; CLEAN pending portraits do not auto-publish; explicit publication without identity review; portrait/title checks on publication and resume; live edits after photo removal; archive/unpublish; and legacy profile upgrade preserving birth-date ciphertext, public ID, creation date and an existing live ad. New browser journeys cover private draft reload/resume and explicit publish, pause/resume and delete at **1440 and 390px**. QA01 retains its 320px visible-label scan and twelve full audit combinations. QA05 retains keyboard and mobile checks for the new wizard destination.

The inherited mobile lab performance case requires `PLAYWRIGHT_BUILT_UI=true` and the Node built-UI harness. That lab/LCP measurement is not claimed by the Cloudflare runtime smoke. No test was removed or newly skipped.

## Existing lint debt and approved exception

An independent detached checkout of unchanged `ddf8763` was linted. It reports **31,186 errors / 39 warnings**, predominantly checkout CRLF formatting. The feature checkout reports **1,724 errors / 41 warnings** after line-ending normalization: 1,715 Prettier errors, eight pre-existing test `any` errors and one pre-existing control-character-regex error. Every one of the **58 files containing a remaining error** is byte-equivalent to HEAD after LF/CRLF normalization. Counts across different checkout line endings are not a meaningful improvement metric.

Changed UI files have zero lint errors. The seven non-blocking warnings include two from the unified wizard: exporting its profile-seeding helper and the existing mount-load effect's dependency warning. No lint rule or configuration was disabled. On 6 November the owner explicitly authorized this scoped release after relevant tests, browser checks, types and builds pass, with repository-wide lint debt documented here.

## Independently checked runtime and data requirements

Both existing hosted databases run **PostgreSQL 16** with **38 migrations**, ending at `038-direct-tutor-publication.sql`. Source migration hashes match the hosted immutable files. The draft foreign key targets `users(id)` and its step constraint is 0 through 4. There is **no new migration or environment variable**; package/config files are unchanged.

Main staging uses the production runtime, SMTP, disabled payments and ClamAV; ClamAV is active and answers its scanner PING. The separate payment sandbox uses capture mail, the test scanner and Razorpay test mode. Synthetic identity/photo smoke data belongs only in that sandbox.

Before release, the two main staging published ads both returned public HTTP 200. The sandbox had five stored PUBLISHED rows that already returned public HTTP 404; those are not presented as five available ads. Stored-ad fingerprints and public status vectors were captured for preservation checks.

The configured targets identify themselves as `APP_ENVIRONMENT=staging`. Updating the existing public test site is not a commercial production launch. No separately configured and approved production target has been established by this verification.

Root preservation check: HEAD and Git status unchanged, all 15 recorded source/handoff hashes unchanged. Old synthetic PostgreSQL directories were retained as requested. Hosted release IDs, backup/manifest results, smoke evidence and final ad-preservation checks belong in the release report.
