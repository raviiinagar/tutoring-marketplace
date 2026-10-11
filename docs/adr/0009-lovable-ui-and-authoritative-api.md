# Use Lovable for the product UI with an authoritative NestJS API

On 11 October 2026 the owner requested Lovable for UI generation and authorized a manual prompt/export workflow if its MCP connection is unavailable. This updates ADR-0004's final web-interface choice: Lovable may generate its native React/TypeScript UI. Next.js remains a temporary local integration harness for the first verified-account journey until exported UI is integrated.

NestJS and PostgreSQL remain authoritative for identity, permissions and marketplace state. Generated UI must consume the existing `/v1` API, use HttpOnly cookie sessions and never establish a competing Supabase/Lovable Cloud identity store. Production serves UI and API under one HTTPS origin; a hosted Lovable preview cannot directly use a laptop-only service.

The owner can generate the UI now from `docs/lovable/task-01-prompt.md`. Backend acceptance evidence is recorded independently; export, integration and visual approval of the final Lovable UI remain explicit follow-up work. No OAuth login, live provider account or deployment is inferred from this decision.
