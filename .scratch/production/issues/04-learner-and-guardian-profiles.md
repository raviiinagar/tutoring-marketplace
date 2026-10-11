# 04: Manage adult and guardian-controlled Learner profiles

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 02 — Manage roles, account recovery and sessions; 03 — Sign in to a scoped staff console with MFA

**What to build:** An adult can create a Learner profile, and a Guardian can submit authority verification and consent for a minimal child profile that becomes usable only after approval.

## Acceptance criteria

- [x] Adults manage their own Learner profile; child beneficiaries have Guardian-controlled access and no independent login.
- [x] Child fields are minimised; profile and verification state are private and scoped to authorised participants.
- [x] The staff workflow records identifiable-adult/authority review and notice/consent versions through a replaceable verification interface.
- [x] Production child-profile creation is gated on configured approved verification/consent policy; test evidence cannot approve a live Guardian.
- [x] Tests cover unrelated Guardian IDs, missing/withdrawn consent, rejected verification and revocation.

## Verification evidence

Implemented and verified on 11 October 2026:

- Migration 004 adds private Learner profiles, encrypted Guardian verification references, append-only review outcomes and versioned consent history. Existing migrations remain unchanged; applied to the running development database without replacing accounts or configuration.
- An adult account with Learner role can create one own adult profile with age attestation and edit alias/learning requirements. Child profiles contain only an alias, age band and learning requirements, use the verified Guardian account and do not create users, emails or credentials. Owner/type overposting is rejected; foreign IDs cannot read/edit/withdraw another account's profiles.
- Child data is not created until Guardian approval. Application submission records current notice/consent versions and encrypted adult/authority receipt references. Trust staff with MFA must provide a purpose to inspect evidence; reviews record actor, target, identifiable-adult/authority checks, decision, method/version identifiers and reason. Self-review, insufficient evidence and duplicate decisions are rejected. Support/Finance cannot access these records.
- `GuardianVerifier` is a replaceable assessment boundary for previously acquired private evidence. Only the explicit nonproduction fictional adapter is registered. Default configuration keeps child collection disabled; production rejects test mode and test adapters. An injected approved production adapter still cannot accept `test-` receipts. No approved live provider, evidence checklist or legal notice is invented.
- Withdrawal stops child profile use/editing immediately; re-acceptance requires current versions and an approved Guardian. Rejected/revoked approvals, stale policy, missing consent and removal of the Learner role prevent usability. `requireUsable` locks current identity/profile/verification/consent facts for future Contact Request commands. Concurrent revocation cannot leave the resulting child profile eligible afterward.
- Lovable `/learners` supports adult profiles, Guardian application/status, minimal child creation and consent withdrawal/re-acceptance. `/staff/guardians` supports purpose-recorded private inspection and Trust decisions. Account/staff navigation links to the appropriate routes. Automatic audit metadata does not copy aliases, learning requirements or evidence payloads.
- `npm test`: all 28 PostgreSQL/API tests and 9 UI unit tests passed. Six Learner/Guardian tests cover owner isolation, strict/minimal fields, independent-login prevention, versions, reviewer scopes, evidence encryption/access auditing, self-review, rejected evidence, consent withdrawal, revocation races and production gates.
- `npm run typecheck` and production build passed.
- Browser verification using Microsoft Edge: the three existing account/staff journeys passed using the new isolated stack. The new Learner/Guardian journey passed on targeted retry after correcting an exact-text selector to allow the accompanying review reason. It covers adult creation, a separate Trust account, MFA/private review, approval, child creation, withdrawal/re-acceptance and revocation. Four journeys now have passing evidence.
- Browser fixtures now get a fresh database, encryption secret, mail capture and ports 3100/4100/5434. They do not reuse the owner's running stack/data. Trust fixture permissions are revoked in cleanup. The owner's existing development stack was migrated and restarted with the new API; child mode remains disabled.

Guide and API: [docs/api/learners.md](../../../docs/api/learners.md). Live child collection still requires the approved verification method, evidence checklist, notice/consent text, retention rules and production adapter integration. Private evidence acquisition/upload/scanning and actual external verification are not claimed complete. Consent withdrawal stops use; tracked erasure belongs to task 23. Live SMTP stays deferred by the owner.

## Comments

The owner requested the next step after task 03. ADR-0002 and ADR-0006 govern the Guardian boundary. Task 05 (the eight-domain catalogue) is the next numbered ready implementation slice; task 06 (Tutor evidence) is also dependency-ready.


