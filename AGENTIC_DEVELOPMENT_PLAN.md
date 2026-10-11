# Agentic development plan for the tutoring marketplace

Prepared: 10 October 2026

Implementation update, 11 October 2026: ticket 01 is implemented with PostgreSQL and browser verification. The owner selected Lovable for final UI generation; [ADR-0009](./docs/adr/0009-lovable-ui-and-authoritative-api.md) updates the earlier Next.js assumption. Use the [Lovable prompt](./docs/lovable/task-01-prompt.md) and [implementation index](./.scratch/production/README.md); ticket 02 is next.

Production interview update: accepted decisions in `docs/adr/` take precedence over earlier assumptions. Launch online tutoring across India with a broad learning catalogue including JEE and NEET, with in-person discovery later. The original narrow catalogue assumption is superseded; re-estimate implementation and onboarding work after the broad taxonomy is settled. Track unresolved production decisions in `.scratch/production/map.md`; implementation begins after the design interview reaches confirmed shared understanding.

This delivery plan adapts [PLATFORM_BUILD_PLAN.md](./PLATFORM_BUILD_PLAN.md) for AI agents implementing and verifying the software. The product scope and business invariants remain the baseline; this document changes how development is organised.

Implementation source of truth: [production specification](./.scratch/production/spec.md) and [28 dependency-linked vertical slices](./.scratch/production/README.md). Start with the verified-account journey and re-estimate after two demonstrated slices.

## Timeline and assumptions

Use **6–10 weeks for planning a production MVP**, including a controlled pilot, with contingency of 2 weeks. This is an initial estimate, not measured agent throughput or a delivery guarantee. Re-estimate after the first two working vertical slices.

Assumptions: regular development sessions, one experienced technical owner reviewing architecture and critical code, prompt product decisions, usable payment/email credentials, and the responsive web scope in the original plan. Agent coding does not remove integration, testing, security review or operational readiness work. If these assumptions are unavailable, the earlier 10–14-week baseline remains a more conservative starting point.

| Milestone | Indicative elapsed time | Demonstrable result |
|---|---|---|
| Working demo | 1–2 weeks | Search and profiles, tutor listing flow, basic dashboards; simulated billing clearly marked |
| Integrated staging alpha | 3–5 weeks | Authenticated requests, authorised messaging, staff review and sandbox payments |
| Production MVP and controlled pilot | 6–10 weeks | Verified paid access, refunds/reconciliation, privacy/support, monitoring, deployment and acceptance evidence |

Demo and alpha milestones are checkpoints on the way to the MVP. They do not establish production readiness. These elapsed times assume sustained work; a chat session itself does not imply unattended execution between sessions.

## What agents implement

Agents inspect the repository, translate scoped requirements into tasks, implement modules and migrations, run appropriate checks, investigate failures, update documentation and produce reviewable changes. Each task ends with a working result and verification evidence.

The technical owner reviews shared contracts, permission boundaries, payment invariants, migrations and release evidence. The product owner resolves pricing, launch geography, guardian rules and disclosures. Agents implement those decisions without inventing production commercial policies.

## Implementation sequence

| Stage | Target window | Agent tasks | Acceptance gate |
|---|---|---|---|
| 1. Foundation and first vertical slice | Week 1 | Repository setup, web/API/worker structure, database migrations, environments, CI, verified login, roles and listing draft | A tutor signs in and saves an owned listing; unrelated users cannot edit it |
| 2. Discovery and tutor operations | Week 2 | Onboarding, public profile, catalogue/search, evidence storage/scan, approval/pause, staff role checks and basic dashboards | Approved eligible listings are searchable; private evidence/contact fields never enter public responses |
| 3. Requests and messaging | Weeks 3–4 | Contact states, reminders/expiry, connection permissions, durable chat, reconnect, blocks/reports and notifications | Request-to-connection journey passes in staging with isolated test access; message and permission tests pass |
| 4. Paid access | Weeks 4–6 | Hosted payment adapter, purchase cycles, webhook inbox, outbox workers, activation, no-match refunds, payment history, receipts and reconciliation | Concurrent acceptance, event replay, unknown payment and deadline races preserve financial/access invariants |
| 5. Trust and release readiness | Weeks 6–8 | Reviews, support cases, privacy requests, retention, analytics, accessibility, performance, alerts, backup restore and deployment | MVP acceptance suite passes; recovery and staff procedures have evidence |
| 6. Controlled pilot and fixes | Weeks 8–10 when needed | Approved production payment/refund verification, invited-user pilot, failure investigation and release fixes | No unresolved critical defects; billing reconciles and operators can manage exceptions |

Some windows overlap. Overlap requires independent tasks and stable contracts, not concurrent edits to the same shared module. Probe payment integration in week 1 so vendor restrictions do not emerge only in stage 4. The 6-week outcome requires low rework and early readiness; use 10 weeks as the safer initial commitment.

## Task contract

Before implementation, each task records:

1. User-visible outcome and source FR/NFR identifiers.
2. Allowed files/modules and dependencies.
3. API/schema/event contracts and relevant invariants.
4. Required normal, permission and failure scenarios.
5. Acceptance evidence and remaining limitations.

Example task: implement tutor request acceptance. The target tutor can accept a pending, unexpired request; retries return its recorded result; unrelated accounts are rejected. Financial eligibility controls contact release. Simultaneous acceptances use the same membership cycle. Tests must demonstrate these behaviours, not merely check that a controller calls a service.

## Development loop

1. Read repository instructions and the relevant blueprint sections.
2. Select the next dependency-ready task and inspect existing code.
3. Implement a small complete flow, including relevant migration and interface states.
4. Run lint/type/build checks and meaningful domain/integration tests appropriate to the change.
5. Review the diff for ownership, accidental public data exposure, billing correctness and migration compatibility.
6. Fix failures before moving to the next dependent task.
7. Record verified behaviour, unresolved dependencies and the next task in a repository progress file.

Use durable repository files for decisions and handoffs so later sessions resume from evidence. Do not treat generated code, an agent's completion claim or a successful browser redirect as proof that a financial workflow works.

## Optional multi-agent execution

Parallel agents can handle independent frontend, backend and verification tasks when explicitly enabled for a work batch. Assign one integrator to shared contracts, dependencies and migrations. Give implementation agents distinct file ownership; validate the integrated result before the next batch.

Avoid parallel ownership of billing/access state machines, root dependency files or the same schema migration. Concurrency should reduce independent task time without creating conflicting sources of truth. This plan does not mean additional agents or background jobs have already been started.

## Scope controls

Keep the first release to the paid contact marketplace. Manual pass repurchase, direct tuition settlement, responsive web and rules-based search remain the defaults. Recurring billing, tutor Pro, recommendation invitations, scheduling, managed tuition, payouts, classroom/video, native apps and ML are subsequent tasks with separate estimates.

Test access and mock payments are for isolated development/staging. They must never authorise a production connection. Live credentials, payment methods and production deployment are separate from a local demo.

## Completion evidence

Use the acceptance scenarios and launch gates in the original build plan. Pay special attention to payment success followed by a worker crash, duplicate/out-of-order webhooks, simultaneous acceptances, no-match deadline races, refund/chargeback overlap, cross-account object access and message recovery.

The MVP is complete when real users can discover an approved tutor, pay the platform fee, obtain an eligible accepted connection, communicate safely and obtain support; staff can reconcile payments, handle refunds/reports and execute recovery/privacy workflows. Report any remaining pilot or external dependency explicitly.

## Immediate next task

Create the TypeScript web/API/worker foundation, development database configuration and first identity/tutor-listing vertical slice using the architecture in the original plan. Confirm package versions and provider capabilities during setup. Track progress against verified milestones, then replace the initial timeline with an estimate informed by actual implementation throughput.
