# Learner and Guardian profiles: task 04

Learner profiles belong to an adult account. They are private beneficiaries, not login identities. One account can have one adult Learner profile and multiple Guardian-controlled child profiles. A Learner role is required to create/edit/use them; removing that role makes existing profiles unusable without exposing them to another account.

## Adult profiles

Open **Manage Learner profiles** from `/account`. Create your own profile with an alias/preferred name, learning requirements and an explicit 18-or-older attestation. Adult age attestation is not identity verification. Names are 2–40 characters and learning requirements 10–300 characters. Owner-only editing keeps the beneficiary type and owner immutable. No date of birth, legal document, phone or address is required here.

## Guardian verification and child profiles

Production child-data collection remains disabled until an approved verification method, evidence checklist and notice/consent policy are supplied and integrated. This follows ADR-0006. A checkbox, email verification, role or payment is not Guardian verification. Setting an arbitrary environment variable to `approved` cannot enable the workflow.

`GuardianVerifier` is a replaceable boundary for assessment of previously obtained private evidence/receipts. Its policy carries method ID, notice/consent versions, their text, approval reference and explicit production approval/test-only flags. Assessment records identifiable-adult and lawful-authority outcomes. External evidence acquisition must occur outside database transactions; production receipt acquisition, private uploads/scanning and the actual approved method are separate launch dependencies. The current registered adapter is exclusively for fictional testing; no live provider, document checklist or policy approval is invented.

For a local fictional test, start a fresh development stack with:

```powershell
$env:GUARDIAN_VERIFICATION_MODE='test'
npm run dev
```

Stop the existing development stack before starting another one. Use fictional identities and aliases only. After testing, unset the variable with `Remove-Item Env:GUARDIAN_VERIFICATION_MODE` and restart normally. The default remains `disabled`; production refuses `test` at configuration startup. Approved production adapters must be integrated through the application factory, reject test-only policy/receipts and supply the actual approved policy. The current UI does not upload identity documents.

The test adapter accepts `test-adult-confirmed` and `test-authority-confirmed` as its synthetic passing receipts; any other permitted test reference does not satisfy that review. These are not evidence of real identity or authority. In production all `test-` evidence references are rejected even with an independently injected adapter.

1. A Guardian submits adult/authority evidence references, adult confirmation and the current notice/consent versions. References are encrypted at rest. Open/approved applications are unique per account; rejected or revoked applications allow a new submission.
2. A different Trust staff member with current MFA opens the private application with a recorded inspection reason. Support/Finance staff and ordinary accounts cannot inspect it. Self-review is forbidden.
3. Approval requires positive adapter assessment and explicit identifiable-adult/authority review, matching the current policy and consent versions. Reviews append reviewer, outcome, checked evidence categories, method/version identifiers and reason. Reject/revoke outcomes also remain in history.
4. Only after approval may that Guardian create a child profile, with an alias, age band (`UNDER_13`, `13_15`, `16_17`), learning requirements and separate profile consent. No independent child account, email, password, exact birth date or identity document is created or accepted. This deliberately avoids collecting child fields while adult/authority approval is pending.
5. Withdrawing consent immediately blocks profile use/editing. A currently approved Guardian can accept the current notice/consent again; old consent history remains immutable. Revocation, expired/superseded policy, missing consent, account disabling or removal of the Learner role prevents eligibility. Reapproval does not silently relink an old child profile; explicit current consent is required.

Withdrawal stops use; it does not claim completed erasure. Owner-visible minimal records and history remain pending the approved retention/export/deletion workflow in task 23. Child/evidence payloads are absent from automatic audit metadata, public rendering and general analytics. Reasons must describe the operational purpose without adding credentials or private evidence.

## API

All writes use strict JSON schemas, Origin checks and HttpOnly cookie sessions. Private reads require the owner or an authorized Trust reviewer. There is no public profile/evidence endpoint. The server calculates `usable`; clients cannot grant it themselves.

| Method/path | Purpose |
|---|---|
| GET `/v1/learner-policy` | Enabled/test-only flags and current notice/consent text/versions |
| GET `/v1/me/learners` | Caller-owned profiles and current eligibility |
| POST `/v1/me/learners/adult` | `{alias,learning_requirements,adult_confirmed:true}` |
| POST `/v1/me/learners/children` | `{alias,age_band,learning_requirements,consent}` |
| GET `/v1/me/learners/:id/eligibility` | Owned profile; reject currently unusable beneficiaries |
| POST `/v1/me/learners/:id` | Edit alias and requirements; owner/type cannot change |
| POST `/v1/me/learners/:id/consent-withdrawals` | `{}`; stop child profile use |
| POST `/v1/me/learners/:id/consents` | Explicit current consent; approved Guardian required |
| GET `/v1/me/guardian-verifications` | Own verification status/history; no unrelated IDs |
| POST `/v1/me/guardian-verifications` | Adult/authority references, adult confirmation, consent |
| GET `/v1/staff/guardian-verifications` | Trust/MFA-scoped queue; excludes private evidence |
| POST `/v1/staff/guardian-verifications/:id/inspections` | `{reason}`; audited private evidence read |
| POST `/v1/staff/guardian-verifications/:id/reviews` | `{decision,identifiable_adult_reviewed,authority_reviewed,reason}` |

Consent is `{accepted:true,notice_version,consent_version}`. Decision is `APPROVE`, `REJECT` or `REVOKE`. Rejection applies to pending cases; revocation applies to approved cases. Concurrent decisions serialize on the verification. Future Contact Request code must use `LearnersService.requireUsable` inside its business transaction: it locks the owning identity, profile, Guardian verification and consent before checking current permission. Session revocation and account status are still checked through the authenticated transaction boundary.

An unrelated profile returns 404. Missing role/Guardian approval/eligible consent returns 403; missing/current-version consent validation returns 400; duplicate adult/open-case or changed review state returns 409. Disabled child collection returns `GUARDIAN_POLICY_UNAVAILABLE` (503) without writing evidence or child fields.

## Test isolation

API tests use fresh PostgreSQL clusters. Browser tests now automatically use their own fresh cluster, capture mail, encryption secret and ports 3100/4100/5434, without reusing the owner's localhost stack or database. `.local/browser-tests.env` is a private ignored fixture configuration consumed only by explicit operator commands in browser tests. Generated cases use fictional data; reviewer permissions are revoked in cleanup.
