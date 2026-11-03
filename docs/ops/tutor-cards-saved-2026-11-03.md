# Tutor cards and Saved Tutors refresh - 3 November 2026

The owner requested REA MCP evidence of Superprof Tutor cards and saved Tutors, plus a similar experience using existing project data. [Reference report](../research/superprof-tutor-cards-saved-2026-11-03.md) includes genuine REA passive captures/screenshots and distinguishes ordinary browser actions, observed authentication gating and unobserved competitor authenticated behaviour.

## Implementation

- Existing public profile cards retain large portraits, name/location overlays, short subject/biography and stated hourly tuition. Coral heart controls have visible saved states and stay outside profile links. The first profile portrait gets loading priority.
- Signed-out hearts open a Tutor-specific, photo-aware sign-in/create-account modal. Escape/close/Keep browsing restore focus; no unsupported social login or automatic save is promised.
- Successful saves show confirmation and View saved Tutors. API failures preserve the heart state. Shared mutation keys keep duplicate controls pending through status refresh. A confirmed save stays filled when the following list read fails; retry remains available.
- Confirmation/modal feedback are scoped to account identity and profile ID, and mutations are not retained after becoming unobserved. Late old-account responses cannot fill a new account's heart or show its save confirmation.
- Saved Tutors adds a clear count, name/subject-alias/city search, Subject filter, browse action and larger two-column desktop portraits in the existing account workspace. Current unavailable profiles are shown separately without stale details. Removal has persistent announcement/focus recovery; empty/load/error/retry states remain.
- Uses the existing API and 50-item server limit. Backend, database, authentication policy, payment configuration and public contact rules are unchanged. Existing teaching-offer cards retain only actual ratings/trial metadata; no profile ID is inferred for an offer lacking one.

## Acceptance

- Final UI suite: 119 tests passed in 30 files. Saved Tutors tests now cover 13 cases including duplicate controls, refresh failure, account switches, modal focus, filters and truthful metadata.
- Final TypeScript check and Vite/Nitro production build passed.
- Final browser journey passed at 1440px, 390px and 320px with zero page errors/overflow: sign-in modal/close/focus, save/filled heart/confirmation, shortlist route and reload, search/subject filter, failed and successful removal, focus recovery, unavailable placeholder/removal and final empty state. Existing portraits were explicitly awaited before desktop captures.
- [Browser JSON](evidence/tutor-cards-local-browser-2026-11-03.json), [public cards](evidence/tutor-cards-local-desktop-2026-11-03.png), [sign-in modal](evidence/tutor-cards-local-signin-2026-11-03.png), [Saved Tutors desktop](evidence/tutor-cards-local-saved-desktop-2026-11-03.png), [Saved Tutors mobile](evidence/tutor-cards-local-saved-mobile-2026-11-03.png).

The browser uses five actual public Tutor projections and their photo endpoints from the current main site. Session and saved-list/write responses are isolated, stateful fixtures matching the existing API. No live accounts or saved records were changed. Route/reload checks prove UI integration with that contract; they do not newly establish live database persistence or cross-device behaviour. Existing backend ownership/visibility/limits remain authoritative.

Preliminary checks caught a test-only unchecked array element and a timing-sensitive browser scroll wait, then a harness expectation that differed from the app's intentionally generic 503 wording. These were corrected before final successful checks. Existing payment act/mock DOM-prop warnings remain non-fatal. The final narrow-mobile confirmation dialog is bounded to the viewport.

## Release

Prepared in isolated branch `feature/tutor-cards-saved-rea` from `07b0c59`. Implementation/evidence commit `242f5d6` was pushed and promoted to both existing hosting branches. Local checks are separate from the live acceptance below.


## Hosting and live acceptance

| Environment | Hosting commit | Ready Netlify deploy |
| --- | --- | --- |
| [Main](https://tutoring-marketplace-ravii-preview.netlify.app/) | `e6cf7da9bedf7b33ff85465f03432f8ace48118e` | `6ae95aed2d97e7a570f873a9` |
| [Payment sandbox](https://payment-sandbox--tutoring-marketplace-ravii-preview.netlify.app/) | `3f430729a1c51b1ec1f64789c2e24cee295120af` | `6ae95af6177e2cb4faa85eee` |

Both live sites passed desktop/390px/320px checks using actual API responses without mocks: public cards, separate 44px heart controls, Tutor-specific auth modal, Escape/focus return, save control on the profile page, signed-out Saved Tutors gate and no page errors or horizontal overflow. The sandbox fictional-account/no-real-money notice remained visible. Zero live saved-Tutor writes were observed; authenticated save/remove/filter/refresh flows remain covered by the local isolated fixtures and unit tests rather than a live-account mutation claim.

- Main: [JSON](evidence/tutor-cards-main-live-2026-11-03.json), [cards](evidence/tutor-cards-main-desktop-2026-11-03.png), [save modal](evidence/tutor-cards-main-signin-2026-11-03.png), [signed-out shortlist](evidence/tutor-cards-main-saved-signedout-2026-11-03.png), [mobile](evidence/tutor-cards-main-mobile-signin-2026-11-03.png).
- Sandbox: [JSON](evidence/tutor-cards-sandbox-live-2026-11-03.json), [cards](evidence/tutor-cards-sandbox-desktop-2026-11-03.png), [save modal](evidence/tutor-cards-sandbox-signin-2026-11-03.png), [signed-out shortlist](evidence/tutor-cards-sandbox-saved-signedout-2026-11-03.png), [mobile](evidence/tutor-cards-sandbox-mobile-signin-2026-11-03.png).

Feature source/evidence synchronized to the main workspace with unrelated changes preserved. The task's local Vite preview on port 3021 was stopped after hosted acceptance. Backend, database, payments, staff authentication and compute-window settings were not changed.
