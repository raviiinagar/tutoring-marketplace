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

Prepared on isolated branch `feature/subject-categories-rea` from `b1c06fd`, with implementation commit `45cb5e4` and catalogue-browser selector compatibility commit `ad04f2d`. The feature source and evidence were synchronized to the main workspace with unrelated edits preserved, including the existing browser fixture environment override. No backend, database, authentication, payments or server-window changes are part of this feature. The owner instructed continuation after the local handoff; the release was pushed and promoted to both existing hosting environments.


## Live deployment acceptance

| Environment | Hosting commit | Ready Netlify deploy |
| --- | --- | --- |
| [Main](https://tutoring-marketplace-ravii-preview.netlify.app/#subjects) | `36261dd716e16f3658f1c061678565645d1662c8` | `6ae94f9d85aaff7642459ed4` |
| [Payment sandbox](https://payment-sandbox--tutoring-marketplace-ravii-preview.netlify.app/#subjects) | `75cfc86df89f54df25b4d0ad8158ba7fff6f4da3` | `6ae94fb10dde80360d45a22e` |

Both live environments passed browser checks at 1440px, 390px and 320px using actual APIs without response mocks: visible All subjects, eight domains, alias search, domain filtering/reset, correct Subject/Exam navigation, learning-options dialog, Escape/focus return and zero page errors or horizontal overflow. Sandbox's fictional-account/no-real-money notice was also asserted visible.

- Main: [JSON](evidence/subject-categories-main-browser-2026-11-03.json), [desktop](evidence/subject-categories-main-desktop-2026-11-03.png), [mobile](evidence/subject-categories-main-mobile-2026-11-03.png), [options](evidence/subject-categories-main-mobile-options-2026-11-03.png).
- Sandbox: [JSON](evidence/subject-categories-sandbox-browser-2026-11-03.json), [desktop](evidence/subject-categories-sandbox-desktop-2026-11-03.png), [mobile](evidence/subject-categories-sandbox-mobile-2026-11-03.png), [options](evidence/subject-categories-sandbox-mobile-options-2026-11-03.png).

Sandbox's CSS append conflict was resolved by retaining both its existing warning-banner/mobile-menu offsets and the new category styles. The first sandbox GitHub push failed with a generic remote error; a remote-ref check confirmed no update and the unchanged retry succeeded. No backend or commercial configuration changes were made. Authenticated staff maintenance and payments were not exercised by live acceptance.
