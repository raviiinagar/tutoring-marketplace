# Build the learner overview and account navigation

Status: ready-for-agent
Type: task

## Acceptance

- Evidence distinguishes REA captures, browser fallback actions and inaccessible/uninspected reference states.
- Overview presents real API-backed access, pending enquiries, recent work and useful empty states; failures do not become zero counts.
- Consistent responsive/keyboard navigation and dedicated settings preserve current security, roles, payments and tools.
- Account-bound state and 401/error/retry handling remain safe.
- Verify tests, typecheck/build, desktop/mobile and the deployed Cloudflare assets with honest fixture/live coverage.

## Comments

3 November 2026: implemented and deployed Cloudflare version `309f1f58-5096-429b-b830-7e1e39947a56`. [Evidence and acceptance](../../../docs/research/superprof-learner-dashboard-2026-11-03.md) explicitly distinguishes observed reference dashboard/settings/menu from unavailable paid/accepted states and unsubmitted account controls. Typecheck/build, 29 targeted tests, controlled local/hosted keyboard and 1440/390/320px checks passed; real anonymous redirects and backend health passed. Private reference screenshots remain ignored/local, and committed UI screenshots use fictional fixtures. No further implementation work remains for this UI ticket; real authenticated backend mutations were not performed as acceptance actions.
