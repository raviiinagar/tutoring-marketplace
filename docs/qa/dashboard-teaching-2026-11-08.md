# Dashboard teaching tabs: QA note (2026-11-08)

Branch `feature/dashboard-teaching-tabs`, from `dcd539d`. Frontend only: no API, contract or migration change.

## Behaviour

- Learner navigation gains "My ads" and "Evaluations" once the account owns at least one ad. A private draft counts. This only reveals the owner's own workspace; it never publishes anything (ADR0014).
- Accounts with the Tutor role also get a "Switch to teaching" link; the teaching navigation gets "Switch to learning".
- Sign-in lands on `/tutor/dashboard` when the account owns an ad, otherwise `/account`. The `enquire` return path is unchanged. A failed ads lookup falls back to `/account`.
- The learner dashboard shows a "Your teaching" card for Tutor accounts: `N online · N draft · N offline`, whether anything is visible to learners, and Manage ads / Create your first ad.
- Accounts without the Tutor role never call the private listings endpoint.

## Verification run

- `tsc --noEmit`: clean.
- Full UI vitest: 46 files, 258 tests passed (includes 9 new tests in `teaching-presence.test.tsx`).
- ESLint on changed files: 0 errors; 1 existing react-refresh warning for the `workspaceLinks` export.
- NOT run: API suite, browser suite, production build, demo-stack visual check.
