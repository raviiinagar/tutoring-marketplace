# Audit UI corrections, 5 November 2026

Branch: `fix/audit-ui`. Base: `c484976` (application baseline `ad8b3257` plus audit evidence).
Isolated worktree: `D:/WORK/P1/.local/audit-ui-fixes`.
Root checkout and its uncommitted files were not edited. No deployment, runtime configuration changes, package changes or production data writes.

## Changes and acceptance

- QA03: exported password minimum/maximum constants (8 and 128), used by validation and shared reset/signup guidance. Existing validation messages and accepted range remain unchanged. Tests reject 7 and 129 characters, accept 8 and 128, preserve non-trimming, and render identical guidance on both actual route components.
- QA04: signup now describes verified email, Learner role, configured Guardian policy, approved Guardian verification and current notice/consent. This matches `apps/api/src/learners.ts` policy/enabled/approved/consent gates and verified authentication. Production additionally rejects unapproved/test-only verification policy. No Guardian behavior was changed.
- QA01: desktop search accessible name starts with its visible prompt. Public introduction and teaching-offer cover links use their content, including location, without redundant overriding labels. Both variants were present in every six-matrix test page. No visual changes.
- QA05: all three Give-private-classes entry points use `/account/settings#roles` for non-Tutors. The role section opens, scrolls into view and focuses its native summary with an accessible instruction. Existing Tutor/anonymous destinations are retained. The account dropdown preserves the destination's focus instead of restoring it to the trigger after same-page navigation. No role/permission API logic changed.

## Verification

| Check | Result |
| --- | --- |
| Full UI suite | 196 passed across 41 files: original 193 plus three new UI cases |
| Password boundaries and rendered guidance | Passed |
| Full `npm run typecheck` | Passed: contracts, API, web, UI and pilot types |
| Contracts and API builds | Both passed |
| `npm --prefix lovable-ui run build:cloudflare` | Passed; artifact only, no deployment |
| New Playwright suite | 3 passed, no skipped or failed cases |
| Home/search label-name matrix | 6 checks: 1440/390/320px, both card variants, zero target-rule violations |
| Original audit accessibility matrix | 12 checks: six routes at 1440/390px, zero violations across the selected WCAG A/AA rules |
| Start-teaching keyboard journey | 4 checks: dashboard/settings sources at 1440/390px; destination focus, natural Tab to Tutor, settled scroll below sticky header, no overflow, role section axe clean, zero role writes and Learner-only account |
| Whitespace check | Passed |

The browser test waits for client hydration and actual asynchronously loaded cards. Its mobile journey uses the mobile navigation rather than the desktop dropdown. Scroll visibility is observed after the application's smooth scroll settles; the test does not scroll or focus the Tutor destination on the application's behalf.

## Before/after accessibility evidence

The required fresh live scan ran before QA01 changes and reproduced `label-content-name-mismatch`: **6 rule/page violations, 8 affected nodes** across the twelve combinations. The historical audit recorded seven affected combinations; current live content/timing differ, so its counts are not substituted for the new observation.

The modified code's isolated after-scan recorded **0 violations, 0 affected nodes** on the same twelve route/viewport combinations. The additional home/search matrix at 1440/390/320px also recorded zero target-rule violations.

- [Fresh live baseline](evidence/2026-11-05/audit-ui-before.json)
- [Six home/search checks](evidence/2026-11-05/audit-ui-after-six.json)
- [Twelve audit checks](evidence/2026-11-05/audit-ui-after-twelve.json)
- [Start-teaching keyboard/mobile checks](evidence/2026-11-05/audit-ui-start-teaching.json)

The fresh live baseline also reported one unrelated color-contrast violation affecting two nodes on mobile search. It was not reproduced in the isolated after scan and was not changed in this narrowly scoped task. Live public supply and fictional local fixtures differ. These are automated scans, not full accessibility certification.

## Limits

No changes were deployed, so the hosted site has not received these fixes and a hosted after-release check is unavailable. No manual NVDA/VoiceOver session or cross-browser/device certification was performed; keyboard focus, accessible names/descriptions and axe checks ran in Chrome. The full legacy backend/browser suites from QA02 were not repaired or rerun; real local API workflows needed by these UI tests were exercised. No real payments, emails to actual users, identity uploads or production credentials were involved.

## Per-commit changed-file manifest

### 9175550: QA03

- `lovable-ui/src/lib/validation.ts`
- `lovable-ui/src/routes/auth.reset-password.tsx`
- `lovable-ui/src/routes/auth.signup.tsx`
- `lovable-ui/src/test/account.test.ts`
- `lovable-ui/src/test/auth-guidance.test.tsx` (new)

### 3ef79b0: QA04

- `lovable-ui/src/routes/auth.signup.tsx`
- `lovable-ui/src/test/auth-guidance.test.tsx`

### fe1a3e3: QA01

- `lovable-ui/src/components/account/ui.tsx`
- `lovable-ui/src/components/public-offer.tsx`
- `lovable-ui/src/components/public-tutor-profiles.tsx`
- `lovable-ui/src/test/site-header.test.tsx`
- `tests/browser/audit-ui-fixtures.ts` (new)
- `tests/browser/audit-ui.spec.ts` (new)
- `docs/qa/evidence/2026-11-05/audit-ui-before.json` (new)
- `docs/qa/evidence/2026-11-05/audit-ui-after-six.json` (new)
- `docs/qa/evidence/2026-11-05/audit-ui-after-twelve.json` (new)

### Fourth commit: QA05

- `lovable-ui/src/components/account-settings.tsx`
- `lovable-ui/src/components/account/ui.tsx`
- `lovable-ui/src/test/account-settings-reference.test.tsx`
- `lovable-ui/src/test/learner-dashboard.test.tsx`
- `lovable-ui/src/test/site-header.test.tsx`
- `tests/browser/audit-ui.spec.ts`
- `docs/qa/evidence/2026-11-05/audit-ui-start-teaching.json` (new)
- `docs/qa/audit-ui-fixes-2026-11-05.md` (this report, new)

The fourth commit hash is provided in the final response and in `git log fix/audit-ui -4 --oneline`.
