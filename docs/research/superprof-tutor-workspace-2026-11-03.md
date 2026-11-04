# Accessible Tutor tools and listing entry

Inspection date: 3 November 2026; release verification: 4 November 2026. Scope: Tutor-related navigation accessible from the existing signed-in Superprof session. The agent did not enter listing details, select a subject, advance the wizard or submit an action. Account role, subscription and payment controls were not changed.

## Observed evidence

- REA target discovery: `ev_b08b820a4d1d19df5b5432e4225028bdf72c8b65432896b7e61e52f90104dcee` scoped the existing Superprof tabs. The dashboard/account navigation already observed in [the learner dashboard inspection](superprof-learner-dashboard-2026-11-03.md) contains a Write your Ad destination.
- Opening that observed link reached [ad creation](https://www.superprof.co.in/dashboard.html/my-listings/creation), at `?step=0`. REA MCP visible screenshot `ev_c790d1c46d5258799a0ffca9a1d34806c7160df9bab0d5011b30b6ebd4767e75` shows a progress indicator, a short explanatory panel, a main-subject search and common subject shortcuts. [REA metadata/digest/limitations](evidence/tutor-workspace/rea-entry.json).
- [Supplementary browser screenshot](evidence/tutor-workspace/reference-listing-entry.png) records the same entry layout. Navigation/waits used Playwright in the existing Chrome session; REA performed passive target discovery and a screenshot. No claim is made that REA's action provider performed the navigation. The screenshot establishes only the visible entry, not later wizard steps or successful ad creation.

## What remains inaccessible or unverified

| Area | Evidence boundary |
| --- | --- |
| Existing-ad Tutor dashboard and listing manager | The accessible Write your Ad path opened subject selection. No existing-ad management screen was exposed by this entry. Its layout, counts and controls remain unverified; this does not prove those features do not exist. |
| Later creation steps, saving, publication and validation outcomes | No subject was selected and no wizard action was advanced, because creating/changing an external ad was outside the inspection. |
| Editing, previewing, pausing, resuming or deleting an existing Superprof ad | No eligible existing ad was inspected or modified. These operations and their backend rules cannot be reconstructed from the initial screen. |
| Tutor enquiry acceptance, student messages, calendar, earnings, traffic, ranking and paid promotions | No populated Tutor workspace or paid/accepted state was available through the observed entry. No account/ad/subscription was created to unlock them. |
| Other users/roles, all responsive variants and accessibility conformance | Outside this sampled session/capture; no claim of full platform coverage or WCAG compliance. |

The Tutor dashboard and listing-status/action design below are project improvements based on its existing APIs and documented rules, not purported copies of unobserved Superprof screens.

## Project adaptation

- `/tutor/dashboard` provides an authenticated, account-scoped Tutor overview. Profile/identity, Tutor Pro, actual offer states and recent incoming enquiries are separate. Offers needing attention appear first, including staff restrictions, profile review requirements and requested changes. No earnings, visitors, conversion rates or booking metrics are invented. Incoming enquiries are a recent paginated slice, not a total.
- `/tutor` retains the current identity-first profile, private evidence, photo, Pro and location/availability tools. Teaching navigation links the overview, profile, offers, incoming enquiries, learning dashboard and account settings.
- `/tutor/listings` adds status filtering, concise cards, real feedback, disclosure of full terms and public links only for currently eligible published offers. Published-but-unavailable, paused, draft, review, changes-requested and staff-restricted states remain distinct.
- The staged editor starts with subjects/teaching format, then description, rates/trial and a review before explicit draft save. These later stages are an intentional product design, not observed Superprof evidence. Editing a published offer warns that approval is removed. Saving and submitting for staff review are separate; restrictions are never lifted by editing.
- Existing Tutor Pro, current subject/profile eligibility, expected revisions, separate tuition and server authorization remain authoritative. A profile's free visibility stays separate from paid offers. Copy now says available subjects/profile-review requirements instead of incorrectly requiring qualification evidence from every identity-first Tutor.
- Drafts stay in component memory. The account-bound route remounts the manager on account changes, old loads are ignored, errors do not become empty counts, and unavailable metadata disables creation/publication. Pausing an owned published offer remains available without purchasing another pass.

## Acceptance

Verified on the [Cloudflare Tutor dashboard](https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev/tutor/dashboard) and [teaching offers](https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev/tutor/listings). Version: `b2f2f41d-ac4c-42f9-a132-1b819cdc89c6`.

- Typecheck, Cloudflare production build and `git diff --check` passed. Five targeted test files passed: 22 tests covering the workspace, header, onboarding, presence and request deadlines. The six workspace tests were rerun after attention prioritisation; these overlap with the 22 rather than adding to that count.
- Local and hosted browser checks used controlled API fixtures for authenticated state and all writes. They passed keyboard navigation, status filtering, no writes before final draft save, a separate staff-review submission, expected-revision editing, lesson/trial price conversion, Pro guards, pause without repurchase, staff restrictions, missing eligibility metadata, catalogue retry and non-Tutor role protection. No browser page errors or horizontal overflow at 390px and 320px; desktop width 1440px.
- Real anonymous requests to both Tutor routes redirected to sign-in; real proxied `/v1/health` returned HTTP 200. Authenticated production mutations were not exercised; no real listing was created, edited or submitted by this verification.
- Hosted screenshots with explicitly fictional fixture data: [dashboard](evidence/tutor-workspace/implementation-dashboard-desktop.png), [offer manager](evidence/tutor-workspace/implementation-manager-desktop.png), [mobile review step](evidence/tutor-workspace/implementation-review-mobile.png).
- Deployment reported 477.63 KiB gzip and 2 ms Worker startup. Startup is a deployment metric, not a request latency or capacity guarantee.

No backend schema, policy, grant, payment setting or AWS deadline change is included. Reference inspection limits above remain unresolved; the implemented status/actions follow this project's rules rather than unobserved Superprof behaviour.
