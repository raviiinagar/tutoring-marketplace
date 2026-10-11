# Learning catalogue

The homepage browses the eight confirmed Learning Domains from PostgreSQL through `GET /v1/catalogue`. It searches domain labels, term labels and aliases, and shows separate Subjects, Learner Levels, Curricula, Exam Tracks and Teaching Languages. Catalogue options describe supported learning needs; they do not establish tutor supply. Tutor discovery and availability subscriptions follow in tasks 08–09.

## Public API

- `GET /v1/catalogue`: fixed ordered domains and active terms, with stable IDs, labels, aliases and associated domain IDs.
- `GET /v1/catalogue/resolve/:kind/:name`: resolves an active canonical label or alias within `SUBJECT`, `LEVEL`, `CURRICULUM`, `EXAM` or `LANGUAGE`. Matching uses Unicode NFKC, lowercase and removal of punctuation/whitespace. For example `IIT-JEE` resolves to `exam-jee`; JEE Main and Advanced retain their own IDs.
- `POST /v1/catalogue/validations`: strict JSON `{domain_id, subject_id, level_id, language_id, curriculum_id?, exam_id?}`. Requires the normal allowed Origin header. Unknown, inactive, mistyped or domain-incompatible IDs return 400. Exam and curriculum are optional; an entrance repeater does not need a school class or board.

This validates taxonomy membership, not an approved tutor offer or exam/subject qualification. Tasks 07–08 must match actual approved offer combinations. `CatalogueService.requireSelection(client, input)` can be used in a listing transaction; shared term locks prevent deactivation during that write. Previously saved identifiers must be revalidated for new marketplace actions.

## Staff maintenance

Open `/staff`, complete MFA, then **Manage learning catalogue**. Both reads and writes require current Trust scope, an active verified account and a staff session bound to the account session. Support and Finance scope alone cannot maintain the catalogue.

- `GET /v1/staff/catalogue`: includes inactive terms for maintenance.
- `POST /v1/staff/catalogue/terms`: strict `{id, kind, label, aliases, domain_ids, active, reason}` creates or edits a term. IDs and kinds remain fixed. Domains come from the fixed eight-domain set; at least one association is required. Reasons are 10–240 characters.
- Every committed change records actor, target ID, kind, active state, correlation and reason as `CATALOGUE_TERM_SAVED` in the audit trail.
- Labels and aliases share one normalized namespace per kind. Inactive terms reserve their names; collisions return 409. Concurrent name changes serialize transactionally, so two terms cannot claim the same alias.
- Deactivation removes a term from public browsing/resolution and makes new selections invalid. Reactivation retains the original stable ID. Terms are not deleted.

## Local testing

With the development database running, apply migration 005 using `npm run db:migrate`, then restart `npm run dev`. Visit `/`, search `IIT JEE`, and open Entrance examinations to see JEE, NEET, CUET, subjects, levels and teaching languages. School education shows CBSE, ICSE, ISC and a representative state-board group. These initial representative terms can be expanded by Trust staff; a generic state-board group does not claim coverage of every specific state curriculum.

Grant Trust access to an existing verified account using the operator instructions in [staff.md](staff.md). Add a term, give it an alias and domain, save with a reason, then confirm it appears in public browsing. Deactivate it and confirm it disappears. Public API reads require no login.

No provider credentials are needed for this task. Live tutor onboarding, approved listings, privacy approval and deployment remain separate launch dependencies.
