# Tutor cards and Saved Tutors: Superprof evidence

Inspected the public Superprof India Maths/Mumbai results page on 3 November 2026 in the existing Chrome CDP browser. No login, registration submission, contact request or payment was performed.

## Observed behaviour

| Question | Observation | Evidence |
| --- | --- | --- |
| What is on a card? | Large Tutor portrait, name and city/class-mode over the image, heart at the top right, review score/count, short introduction and tuition unit. A free first-class label and a Tutor badge appear on some cards. | REA MCP passive inspection `ev_f233f5fdaba8e2480a1b3e5848ab525eb893100eba5bd544bb3eafe9e4dadb62`; [card screenshot](evidence/superprof-tutor-cards-2026-11-03.png), Evidence `ev_ea4f573fa898eda5d61adf49126e712c94e541155a5c714d18d21573b2614a77`. |
| What does the signed-out heart do? | A Tutor-specific Favourites modal eventually appeared, with the selected portrait, email registration, Google/Apple entry points and a Log in link. The results page stayed open. | REA MCP passive auth-modal inspection `ev_f8ba15cd76c9284dd7488d0aa2fce7f40b25d87d5a611c449f583c3d969c1aec`; [modal screenshot](evidence/superprof-save-signin-2026-11-03.png), Evidence `ev_750f5dd4bb23718098939f6d97aa829ad03b3d66b19724aba2a6a00a7743251e`. |
| Did the signed-out attempt establish a persisted save? | No authenticated save or persisted shortlist was established by this investigation. The visible result was an authentication gate; the modal was closed without submitting data. | The modal capture above and ordinary browser cleanup. |
| How does a logged-in shortlist behave? | Unknown in this investigation. No competitor account was supplied or used. | Explicit evidence boundary; no authenticated competitor persistence, removal or cross-device claim is made. |

[Selected Evidence records](evidence/superprof-tutor-cards-saved-2026-11-03.json) retain target identity, coverage and limitations. The complete session bundle is local at ignored `.local/rea-tutor-cards-saved-2026-11-03.json`.

## How actions and captures were obtained

REA target discovery initially exposed a stale Python target that was absent from Playwright's page inventory. Its pending inspection was stopped, and the existing Maths results target was selected instead. Passive MCP inspection and screenshots then succeeded. REA's controlled scenario runner returned `execution_failure`; the already installed 6.5.0 diagnostics from the preceding investigation had confirmed registration alignment without resolving that runner error.

Ordinary Playwright clicked the selected public heart. The first short wait did not yet expose the modal; a later inspection did. A redundant second click was blocked by the now-open modal and is not counted as a successful action. All Evidence IDs above refer to genuine passive REA MCP captures/screenshots, rather than claiming REA executed the click. No storage values, bookmark parameters, credentials or private traffic were read for the reconstruction.

## Adopted project choices

Keep Tutor Marketplace branding, coral hearts and yellow accents. Reuse the existing public Tutor/profile and Saved Tutors APIs. This feature adds a Tutor-specific authentication dialog, server-confirmed saved feedback and a shortcut to the shortlist; it does not add unsupported social login providers.

The existing photo-led public cards retain their compact name/location/subject/description/hourly-tuition layout. Hearts have a clear filled state, shared in-flight protection, keyboard focus and accessible labels. Failed follow-up reads cannot erase the initiating heart's confirmed save state; late responses from another account cannot show its save feedback. Saved cards use two desktop columns within the account workspace to keep portraits large.

Shortlist search by name, Subject alias or city, a Subject filter, clear counts, removal feedback/focus recovery and separate unavailable placeholders are adopted product improvements built on our existing account-owned shortlist. They are not claimed as observed competitor authenticated features. Saving remains free, capped by the existing server limit of 50, and sends no enquiry or booking.

No ratings, Tutor badges or free-class claims are invented for free public profiles. Existing teaching-offer cards continue showing only actual review/trial data. Those offer projections do not contain a public profile identifier, so this release does not infer a save target from a name or listing ID. Identity-reviewed profile cards and profile pages use the existing explicit public profile ID.

Implementation and validation: [release evidence](../ops/tutor-cards-saved-2026-11-03.md).
