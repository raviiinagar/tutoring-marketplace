# Deploy and verify the Cloudflare frontend test URL

Status: ready-for-agent
Type: task

## Acceptance

- Branded UI and SSR/static assets build with the installed Cloudflare adapter.
- Fixed API proxy preserves cookies, unsafe Origin/JSON protections, binary uploads/photos and event-stream responses; no open proxy or cached private data.
- Exact new origin allowed on the existing backend with a rollback copy; other environments remain usable.
- Existing tests/typecheck/build, local Worker preview and actual deployed health/catalogue/search/auth handling verified.
- No paid upgrade, DB migration, production payment enablement or DNS replacement; evidence and any remaining user steps recorded.

## Comments

3 November 2026: owner created the Cloudflare account and authorized the migration/test deployment. OAuth connected through pinned Wrangler with OS-keychain storage after its Windows helper was installed. Work isolated from 7480b0e.

Deployed Worker version `2a91c27f-8e9c-43fb-a927-25e8688ebfaf`; exact origin is allowlisted on the existing AWS API. 125 UI tests, six proxy tests, typecheck/build and live anonymous SSR/API/security checks passed. Owner confirmed successful login with their current password. [Operations record](../../../docs/ops/cloudflare-frontend-2026-11-03.md) includes rollback and limits. Automated saved-credential sign-out and live authenticated chat/upload acceptance remain open; stream/binary/cookie forwarding have proxy test coverage. No password reset was attempted.
