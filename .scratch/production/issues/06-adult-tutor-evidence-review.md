# 06: Onboard an adult Tutor and review private evidence

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 02 — Manage roles, account recovery and sessions; 03 — Sign in to a scoped staff console with MFA

**What to build:** A Tutor creates a profile and submits identity and relevant experience/qualification evidence; trust staff review it and the Tutor sees precise outcomes.

## Acceptance criteria

- [x] Only adult Tutors aged 18 or older can qualify for publication; profile validation and correction states work.
- [x] Uploads enforce ownership, allowlisted formats, size limits and scanning; unscanned/rejected files are inaccessible as approved evidence.
- [x] Private evidence cannot appear in public responses; reviewer downloads are scoped, expiring and audited.
- [x] Decisions specify the check, actor, outcome and expiry/revocation where relevant rather than a generic teaching-quality guarantee.
- [x] Tests exercise cross-account files, malicious uploads, reviewer scopes and revoked verification.

## Verification evidence

Implemented on 11 October 2026:

- Migration 006 adds private adult Tutor profiles, revision-bound claims, encrypted evidence, append-only review decisions and hashed download grants. Profile saves start a fresh draft revision; earlier approvals cannot qualify a revised profile. Calendar-valid dates and exact UTC age 18 or older are enforced, and identity approval additionally requires the reviewer's identifiable-adult confirmation.
- Tutor-role accounts use `/tutor` to save a profile, upload evidence, create separate identity and Subject-specific qualification/experience claims, submit and see precise outcomes. Trust staff with account-bound MFA use `/staff/tutors` to inspect cases for an audited purpose, review specific checks, request corrections, reject, approve with an explicit expiry, or revoke. Self-review and Support/Finance-only access are denied. Evidence approval does not publish a Listing or guarantee teaching quality.
- Strict uploads accept matching PDF/PNG/JPEG content up to 1 MiB; invalid encoding, overposting, obvious active PDF content and excessive uploads are rejected. Encrypted bytes enter committed quarantine before scanning outside the transaction. Rejected/error/unscanned evidence cannot authorize claims or downloads. Withdrawal clears bytes and cannot remove current pending/approved evidence without a revised profile.
- Reviewer downloads use one-use 60-second tokens bound to actor, account/staff sessions and profile revision. Permission, clean scan and current claim/profile status are rechecked before atomic consumption; grant and actual download are audited. Downloads use attachment/no-store/nosniff/sandbox headers. Public endpoints do not expose private profiles, dates of birth or evidence, and audit metadata excludes bytes, birth dates and tokens.
- `requireQualified` is the locked eligibility seam for task 07: current active Tutor, adult profile, current clean evidence, unexpired identity approval and matching Subject approval. Revocation, revision changes, expiry and removed role/disabled account fail eligibility. Download versus profile-edit locking follows owner then profile, with a concurrent regression proving no stale release after the edit commits.
- Scanning defaults to disabled. Explicit nonproduction test mode supports fictional samples only; production refuses test configuration/adapters and test-only evidence cannot qualify there. The ClamAV adapter uses bounded INSTREAM framing and fails closed on detections, malformed/multiple/unterminated replies and network failure/deadline. Its integration test uses a TCP protocol fixture, not a provisioned live antivirus daemon.
- `npm test`: all 41 real PostgreSQL/API tests and 9 UI unit tests passed. Seven new Tutor tests cover age/encryption, ownership/malicious uploads/quarantine, claim rules/quota, reviewer boundaries/download races/expiry/audit, precise approvals/corrections/revocation and Subject eligibility, production gates, and the ClamAV protocol. Existing account, catalogue, Guardian and staff regressions also passed.
- Browser verification exposed an existing sign-out failure when a private authenticated read overlapped logout. A deterministic integration regression failed with HTTP 500 before the fix and passed with 204 afterward. Logout now locks user before session, matching authenticated operations rather than taking the session lock before the audit foreign-key user lock. Full API verification includes this regression.
- `npm run typecheck`, `npm run build` and `git diff --check` passed. Common credential-pattern checks found no matches in changed files; local environment, captured mail and test artifacts remain ignored.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:browser`: all six browser journeys passed in one final run (5.0 minutes), including both loopback account journeys/sign-out, catalogue, Guardian consent/revocation, staff MFA/recovery and the new Tutor flow. The Tutor journey creates identity/Physics qualification claims, submits, downloads private evidence through Trust MFA, approves both claims with expiry, then revokes qualification and observes ineligibility. An earlier run passed five journeys with account sign-out failing; the final run includes the logout fix. An initial Tutor browser assertion matched both claim articles; the locator now anchors the claim kind. An initial staff sign-in timeout passed on subsequent runs without a claimed root-cause fix.
- Migration 006 was applied to the existing development database. The development stack was restarted with fictional evidence scanning; `/tutor` returned 200 and policy reports uploads enabled with `test_only: true`. Production Guardian collection stays gated and no live documents are needed for local testing.

Guide and API: [docs/api/tutors.md](../../../docs/api/tutors.md). Before live evidence collection, provision and test a private ClamAV daemon with maintained signatures, approve the evidence checklist and privacy/retention procedures, and include Tutor birth dates/evidence in encryption-key recovery/rotation. Those are launch dependencies; this ticket does not claim real antivirus deployment or production readiness. Listing approval and publication are task 07.

## Comments


