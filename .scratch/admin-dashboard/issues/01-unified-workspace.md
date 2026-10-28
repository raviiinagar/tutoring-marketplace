# Unified admin overview, audience observations and staff workspace

Status: ready-for-agent
Dependencies: existing staff MFA, marketplace metrics, scoped work queues (implemented)

Acceptance: accessible responsive unified staff workspace; truthful audience/signup/login and business overview; scoped account directory and work queues; anonymous public traffic tracking with retry/concurrency/expiry boundaries; no child/private payloads; existing workflows keep permissions and MFA; API/UI/hosted verification; rollout evidence.

## Comments

28 October 2026: implementation started. REA connector unavailable; use source and Playwright. Existing root changes preserved.

Implementation complete and deployed to ordinary preview plus fictional sandbox. Five real PostgreSQL/API scenarios, twelve staff/metrics regressions and 61 UI tests pass. Actual sandbox MFA/role-scoped reporting, directory, chart/period controls, shared Finance/Tutor navigation, mobile menu, public observation and staff lock verified with Playwright; screenshots inspected. Ordinary anonymous boundary denies access. Visitor tracking starts now; historical visits remain unavailable. Real owner credentials/MFA unchanged. [Acceptance and rollout](../../../docs/ops/admin-dashboard-2026-10-28.md).
