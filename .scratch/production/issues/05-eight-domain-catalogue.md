# 05: Browse and administer the eight-domain catalogue

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 03 — Sign in to a scoped staff console with MFA

**What to build:** A visitor can browse the eight confirmed Learning Domains, while authorised staff maintain Subjects, Learner Levels, Curricula, Exam Tracks and Teaching Languages.

## Acceptance criteria

- [x] All eight families appear with representative terms, including JEE, NEET, CUET and school-board coverage.
- [x] Stable identifiers and aliases prevent duplicate exam/subject spellings from fragmenting discovery.
- [x] Curriculum and Exam Track remain separate from Subject and Teaching Language.
- [x] Staff can activate/deactivate catalogue terms; unsupported taxonomy values are rejected by API validation.
- [x] Public/staff integration tests prove consistent catalogues and deny unauthorised edits.

## Verification evidence

Implemented and verified on 11 October 2026:

- Migration 005 creates eight fixed Learning Domains and seeds 65 representative terms with stable IDs, typed aliases and domain associations. Includes JEE/Main/Advanced, NEET, CUET, school-board curricula, competitive/professional tracks, career/language/arts subjects, distinct teaching languages and an entrance-repeater level. State-board coverage is a representative group, not a claim of complete state-specific curriculum coverage.
- Public catalogue and alias-resolution APIs expose active terms. Unicode NFKC, case and punctuation normalization resolve alternate spellings to one typed identifier; English as Subject remains distinct from English as Teaching Language. Canonical labels and aliases share a namespace per kind, including inactive terms, preventing duplicate aliases and reactivation conflicts.
- Trust staff with current bound MFA can add/edit terms and activate/deactivate them. IDs and kinds stay fixed; unknown domain/type values, duplicate domain associations and overposting are rejected. Changes transactionally record actor, target, kind, activation state, correlation and reason. Concurrent name ownership changes serialize, with one winner for a duplicate name. Public accounts, Support-only accounts and revoked/non-MFA sessions cannot maintain the catalogue.
- Strict selection validation rejects unknown, inactive, mistyped and domain-incompatible IDs. `requireSelection` is a transaction seam with shared term locks for future listing writes. It validates taxonomy membership only; approved offer combinations and available supply remain tasks 07–08.
- Lovable homepage now uses the authoritative API for all eight domains, label/alias search, typed term browsing, loading/error/retry and empty search states. `/staff/catalogue` provides Trust maintenance and audited reasons through `src/lib/api.ts`. Public text explicitly says tutor discovery is coming soon and does not fabricate available tutors.
- `npm test`: all 33 real PostgreSQL/API tests and 9 UI unit tests passed. Five new catalogue integration tests cover seed persistence, aliases/normalization, typed selection rules, staff/MFA scope boundaries, public/staff consistency, activation and audit, invalid taxonomy and concurrent duplicate names.
- `npm run typecheck` and `npm run build` passed.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:browser`: all five journeys passed in one run. New catalogue journey adds a Trust term and alias, searches and browses it publicly, deactivates it and proves its disappearance. Existing account, Guardian and staff flows also passed. Initial default-browser invocation lacked the Chromium executable; installed Microsoft Edge was used successfully.
- Applied migration 005 to the existing development database and restarted the project stack. Local `GET /v1/catalogue` returned 200 with eight domains and 65 terms. Isolated browser stack stopped after verification; normal development ports remain running. Existing credentials/accounts and the disabled production child-data gate were preserved.

Guide and API: [docs/api/catalogue.md](../../../docs/api/catalogue.md). No external credentials are required for this ticket. Tutor evidence, approved listings, discovery, live SMTP, privacy approval and deployment remain separate tasks or launch dependencies.

## Comments


