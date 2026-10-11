# Lovable import review

Update: a complete export is now present under `lovable-ui`, with its original manifest and TypeScript configuration. Its nine tests, type check and production build passed. See [the current UI-folder review](ui-folder-review.md); the missing-export/manifest observations below describe the earlier root import.

Reviewed the exported account UI in root `src/`, `vite.config.ts`, `vitest.config.ts`, `bun.lock` and `INTEGRATION.md`. This is React with TanStack Start/Router and Vite, not the existing Next.js harness. The files are present, but the current workspace does not build or launch them.

## Integration blockers

1. Root `package.json` still contains only the original workspace tooling. Lovable dependencies recorded in `bun.lock` are absent from this manifest. `npm ls '@lovable.dev/vite-tanstack-config' '@tanstack/react-start' '@tanstack/react-router' vite vitest --depth=0` returned an empty dependency tree. Its original package manifest must be recovered or reconstructed in a dedicated UI workspace; do not replace the backend workspace manifest.
2. `scripts/dev.mjs` launches `next dev apps/web`; root build/typecheck scripts target the existing workspaces. Root `tsconfig.json` has an empty include list, so exported `src` is not covered by the existing TypeScript check. A passing old build or browser test does not validate this UI.
3. The adapter defaults to same-origin `/v1`, but `vite.config.ts` declares no explicit backend proxy. Confirm the generated config package's behavior, then configure local `/v1` routing to NestJS. Use the same local origin for returned verification links, browser requests and backend allowed origins.
4. The export intentionally has no `/dev/inbox` route or local-capture notice. Since the owner deferred live SMTP until a domain is purchased, provide a development-only captured-mail workflow when integrating. Keep it absent from production.

## Source-level checks

- Routes exist for home, signup, check-email/resend, verify, sign-in and account.
- `src/lib/api.ts` uses the implemented endpoint paths, cookie credentials, exact registration fields and no JSON parsing for 204 logout.
- No production authentication mocks, Supabase identity client or localStorage/sessionStorage identity found in application source. Test fetch mocks are isolated to tests.
- Verification is explicit, validates the token format, removes the URL fragment and preserves the captured token across Strict Mode effect reruns.
- Account requests `/v1/me`, redirects on 401 and clears private state after successful logout.
- Forms include labels, field errors, status/error announcements and double-submit guards. Password values are not trimmed.
- UI uses the temporary Tutor Marketplace name and honestly marks discovery as forthcoming.

Smaller observations: sign-in client validation omits the backend's 128-character maximum; signup permits the email to appear in a query parameter when navigating to check-email. Prefer temporary UI state for this prefill to avoid unnecessary email persistence in browser history/server URLs. The eight pills represent domains/exam tracks but are headed “Subjects”; use the glossary terminology when refining copy.

## Verification limits and next work

This was source inspection plus dependency/script checks, not a rendered visual review. Lovable unit tests and browser journeys have not been run because their runtime/test dependencies are not integrated. Existing task 01 evidence covers the original Next.js harness only.

Next integration batch: isolate the Lovable UI as a workspace, restore its manifest and TypeScript configuration, configure API routing and local capture, update startup/build scripts, then run the generated tests and the real PostgreSQL account journey through the Lovable screens. Preserve API, worker, database migrations, cookie controls and the owner's deferred SMTP decision.
