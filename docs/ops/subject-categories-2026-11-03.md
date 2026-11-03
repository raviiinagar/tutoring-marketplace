# Subject categories and shortcuts - 3 November 2026

The owner requested REA MCP evidence of Superprof subject categories/shortcuts and a similar branded feature. [Reference findings](../research/superprof-subject-categories-2026-11-03.md) separate REA passive captures, ordinary Playwright actions and adopted design choices.

## Result

- Visible All subjects entry outside the hero carousel; one shared shortcut definition also orders the domain previews.
- Searchable eight-domain subject directory, alias matching, category selection/reset, direct Subject and Exam Track links and View Tutors per domain.
- Accessible full learning-options dialog with correctly typed Subject, Exam Track, Curriculum, Learner Level and Teaching Language filters. Escape returns focus to the initiating control.
- Active catalogue terms only, no invented supply, clear catalogue/availability distinction, standalone loading/error/retry and empty states.
- Existing homepage SSR catalogue is passed into the category component; its component test proves it does not make an extra catalogue request. Existing public-directory components still perform their own requests.

## Acceptance

- Final TypeScript check passed.
- Final full UI suite: 113 tests passed in 30 files, including five new category tests. Existing payment act warnings and password test mock DOM-prop warnings were non-fatal.
- Final production Vite/Nitro build passed.
- Local real-browser check passed at 1440px, 390px and 320px: visible All subjects, eight groups, alias search, category/reset, typed Subject/Exam navigation, full learning-options links, Escape/focus and zero page errors/overflow.
- [Browser result](evidence/subject-categories-browser-2026-11-03.json), [desktop](evidence/subject-categories-desktop-2026-11-03.png), [mobile](evidence/subject-categories-mobile-2026-11-03.png), [mobile options](evidence/subject-categories-mobile-options-2026-11-03.png).

The local browser consumed the actual public catalogue/read projections from the existing main site through a controlled proxy. Anonymous session and discovery POST responses were isolated fixtures; no accounts, payments or marketplace records were changed. The existing staff catalogue browser test was updated for the new public controls; its authenticated staff-maintenance flow was not rerun in this task.

Preliminary checks caught a removed empty-offer icon import and test-only ByRole options; these were corrected before final successful TypeScript/build/suite runs. A preliminary browser assertion incorrectly assumed unrelated components made no catalogue requests; the harness now records those requests and leaves the no-extra-request claim scoped to the seeded category component test.

## Release

Prepared on isolated branch `feature/subject-categories-rea` from `b1c06fd`. No backend, database, authentication, payments or server-window changes are part of this feature. Hosting acceptance will be recorded separately if this release is published; the current evidence proves local implementation, not a live deployment.
