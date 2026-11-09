# Learner profiles

> **ADR0015 (9 November 2026):** child profiles and Guardian verification are retired. Every Learner profile is an adult's own profile; a parent books for their child from it. This supersedes the Guardian/child flow that ADR0002 and ADR0006 described.

A Learner profile belongs to an adult account. It is a private beneficiary record, not a login identity. Each account has at most one Learner profile, created with an alias, learning requirements and an explicit 18-or-older attestation. Adult age attestation is not identity verification.

## Parents booking for a child

A parent uses their own Learner profile: the parent is the Learner on the account, books and pays, and Tutors talk only to the parent. No child profile, child name, age band or Guardian evidence is collected. The profile page and the enquiry copy ask parents to describe the level and goal without the child's name, school or other identifying details.

## Historical child profiles

Production never enabled child-data collection, so none are expected. Any child profile, Guardian verification or consent row created before ADR0015 is kept read-only:

- it is listed to its owner as "no longer available" and can never be used for an enquiry, a Connection or an edit;
- its owner can still withdraw the consent they gave (`POST /v1/me/learners/:id/consent-withdrawals`);
- privacy export and erasure still include it.

No table, column or row was dropped or rewritten, and no migration was needed. No Guardian verifier can be configured any more; `GUARDIAN_VERIFICATION_MODE` is still parsed (production still refuses `test`) but has no effect.

## API

All writes use strict JSON schemas, Origin checks and HttpOnly cookie sessions. Private reads require the owner. There is no public profile endpoint.

| Method/path | Purpose |
|---|---|
| GET `/v1/learner-policy` | Always `{child_profiles_enabled:false,test_only:false,policy:null}` |
| GET `/v1/me/learners` | Caller-owned profiles and current eligibility (historical child profiles are never usable) |
| POST `/v1/me/learners/adult` | `{alias,learning_requirements,adult_confirmed:true}` |
| GET `/v1/me/learners/:id/eligibility` | Owned profile; rejects unusable profiles with 403 `LEARNER_UNAVAILABLE` |
| POST `/v1/me/learners/:id` | Edit alias and requirements of a usable profile |
| POST `/v1/me/learners/:id/consent-withdrawals` | `{}`; withdraw consent for a historical child profile |

Retired, answering 410 `CHILD_PROFILES_RETIRED`: POST `/v1/me/learners/children`, POST `/v1/me/learners/:id/consents`, GET and POST `/v1/me/guardian-verifications`, GET `/v1/staff/guardian-verifications`, POST `/v1/staff/guardian-verifications/:id/inspections` and `/reviews`.

An unrelated profile returns 404. A missing Learner role or an unusable profile returns 403; a duplicate adult profile returns 409.

## Test isolation

API tests use fresh PostgreSQL clusters. Tests that need a pre-ADR0015 child row write it directly with `apps/api/test/helpers/historical-child.ts`.
