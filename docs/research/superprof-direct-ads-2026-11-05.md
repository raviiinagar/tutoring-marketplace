# Direct Tutor ads: evidence and implementation

This release implements the owner's explicit decision: **free ads; identity verification optional**. [ADR0014](../adr/0014-free-direct-ad-publication-and-optional-identity.md) supersedes the earlier mandatory ID, Tutor Pro and ad-review requirements. Publication is a separate backend fact from identity verification.

## Reference evidence and limits

REA observed the signed-in Superprof India ad manager on 4 November. [Retained evidence metadata](evidence/direct-tutor-ads/rea-manager.json) records the capture provider, content digest, visible sections and controls. The manager has an ad selector, editable teaching sections, a portrait/fee panel, an **Ad is online** switch, **Student's view** and **Delete advert**. Navigation exposes Dashboard, My messages, My Ads, Evaluations and My Account. Playwright navigated the existing signed-in page; REA passively captured it. No external ad was created, edited or removed in this investigation.

Official documentation describes [instant saved ad edits](https://www.superprof.co.in/help/teachers/manage-my-ad/edit-my-ad/51/), [deactivation/reactivation](https://www.superprof.co.in/help/teachers/manage-my-ad/deactivate-or-reactivate-my-ad/53/) and [free ad publication in the terms](https://www.superprof.co.in/gtu.html). These are documented rules; they do not establish that every account and country has an identical initial publication/review process. The [earlier runtime investigation](superprof-tutor-journey-2026-11-04.md) records the returning account's online-ad state and observed title/class text validation. Universal new-account review rules and hidden internal moderation remain unverified. Removing this project's mandatory ID/Pro gates is an explicit owner decision, not an unsupported claim about all Superprof accounts.

The project keeps its branding and light-yellow accents. Its real catalogue, location, trial and recommendation models populate the manager. Superprof's unsupported packs, travel supplements, video editor, paid promotion metrics and interview process are not reproduced with nonfunctional controls.

## Implemented behavior

- Incomplete introductions save privately on the server and resume after reload. Explicitly saving the introduction does not publish it.
- Create an ad, fill valid teaching details, and choose **Publish my ad**. The server publishes the ad and complete introduction atomically, without ID approval, Pro or a staff-review submission. Saving a draft remains available.
- **Your ad is online** appears only for a published and currently eligible ad. Restricted or otherwise unavailable published records say **Unavailable**. No identity or teaching-quality verification is inferred from publication.
- Validated live edits appear immediately. The manager offers an online/offline switch, pause confirmation, real Student's view and soft deletion with confirmation. Archiving retains prior enquiries, Connections and financial history.
- Identity review is optional and shown separately. Clean newly consented portraits can appear after scanning, while their staff-review state remains truthful. Rejected/removed portraits stay hidden.
- Staff keep audited publication restrictions and separate ID review. Owner edits and new evidence cannot erase a restriction. Learner Access, block checks, payment activation/refunds and Connection authorization remain in force. Optional Pro retains the separate consented-public-email rule.
- Existing records and actual review outcomes remain. Migration038 does not publish private/adverse/test-only historical cases. Existing eligible non-test introductions retain publication. No badges or reviews are fabricated.

## Validation and results

The final targeted suite passed **15 backend HTTP/PostgreSQL tests** covering migration preservation, no-ID/no-Pro publication, drafts, text validation, live edits, revision races, archive behavior, optional identity, consented portraits, staff holds, learner coverage, blocks, catalogue validity, public contact and reputation. **49 UI tests across seven files** passed; the 26 ad-manager/workspace cases passed again after final layout changes. API build, UI typecheck and Cloudflare build passed.

The real local Nest/PostgreSQL [desktop/mobile journey results](evidence/direct-tutor-ads/browser-results.json) cover free publication, Student's view, live edits, pause/resume and archive at 1440px and 390px, plus a 320px overflow check. No API responses were mocked, no staff/purchase calls occurred in the user journey, and no browser page errors or horizontal overflow were observed. Draft saving/reload was exercised with the same isolated fixture before publication. These are fictional local accounts; no hosted user or fake endorsement was seeded.

Final screenshots: [desktop manager](evidence/direct-tutor-ads/desktop-ad-online.png), [mobile manager](evidence/direct-tutor-ads/mobile-ad-online.png), [320px layout](evidence/direct-tutor-ads/mobile-320-online.png), [student-facing ad](evidence/direct-tutor-ads/desktop-student-view.png), [saved private draft](evidence/direct-tutor-ads/mobile-private-draft.png).

Older suites that assert the superseded mandatory-ID/Pro/staff-review policy were not represented as a passing full repository suite. The targeted safety/payment checks above exercise the retained boundaries under the new policy. Higher badge levels still require verified criteria; this release does not invent Ambassador eligibility.

Hosted deployment evidence is recorded separately after backend promotion and frontend smoke checks.
