# Build Tutor overview and improve offer management

Status: ready-for-agent
Type: task

## Acceptance

- REA evidence and explicit inaccessible/uninspected reference states.
- Tutor overview with actual profile, Pro, listing and recent-enquiry data; no invented metrics or totals from paginated requests.
- Consistent teaching navigation without removing learning/account/profile tools.
- Listing statuses/filter/preview and subject-first editor with review before explicit save; publication submission remains separate.
- Preserve backend Tutor Pro, subject/profile eligibility, safety restrictions and expected revisions; no auto-publish or automatic charge.
- Validate failures, role/account isolation, missing metadata/Pro, edits and pause/resume, native input rules and responsive keyboard access.
- Typecheck, appropriate tests, build, deployed Cloudflare verification and evidence.

## Comments

4 November 2026: Implementation and acceptance checks completed. New account-scoped `/tutor/dashboard`, teaching navigation and staged `/tutor/listings` editor are deployed. The offer manager preserves backend eligibility, Tutor Pro, staff restrictions and exact revisions; saving a draft and requesting publication review remain separate actions.

Typecheck/build passed, 22 targeted tests passed, and controlled local/hosted browser checks passed at desktop, 390px and 320px, including failures and role restrictions. Real anonymous redirects and API health passed; production authenticated writes were not exercised. Cloudflare version `b2f2f41d-ac4c-42f9-a132-1b819cdc89c6`. See [acceptance evidence and reference limitations](../../../docs/research/superprof-tutor-workspace-2026-11-03.md). The tracker has no completed implementation triage role, so the existing role is retained and completion is recorded here.
