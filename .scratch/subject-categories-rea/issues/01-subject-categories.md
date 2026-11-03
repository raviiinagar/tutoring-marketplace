# Build searchable subject categories and direct shortcuts

Status: ready-for-agent
Resolution: completed and deployed (3 November 2026)
Type: task

## Acceptance

- Active catalogue Subjects/Exam Tracks navigate with the correct typed filter and domain.
- Search matches names and aliases; category selection can be cleared; inactive terms never appear.
- All subjects is easy to find; grouped subjects and full learning options work on desktop and mobile.
- Existing branding, public supply semantics and API authority remain unchanged.
- Record REA evidence, focused tests, build/typecheck and browser results.

## Comments

3 November 2026: isolated implementation from b1c06fd; initial reference evidence captured.

Final acceptance: 113 UI tests, TypeScript and production build passed. Desktop/390px/320px browser navigation passed with zero page errors. Reference evidence, screenshots and limitations are linked in docs/ops/subject-categories-2026-11-03.md. Implementation complete; live hosting is not claimed.

Owner requested continuation; feature branch pushed and both main/payment-sandbox deployments are ready. Live desktop/390px/320px checks passed with actual API responses and zero page errors. Sandbox testing notice preserved. Full commits/deploy IDs and acceptance artifacts: docs/ops/subject-categories-2026-11-03.md.
