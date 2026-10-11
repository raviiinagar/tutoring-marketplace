# Tutor onboarding and private evidence

An active verified account with the Tutor role can create a private adult profile at `/tutor`. The profile has a display name, biography and encrypted date of birth. Exact UTC calendar age must be at least 18; invalid dates, underage profiles and ownership overposting are rejected. Staff also confirm identifiable-adult evidence before identity approval: an attestation alone cannot qualify a Tutor.

## Profile and claim workflow

`GET/POST /v1/me/tutor` reads/saves only the current account's profile. Each profile save creates a new draft revision and invalidates the applicability of older claims/approvals. Clean uploaded files may be referenced by fresh claims; the owner must resubmit. `POST /v1/me/tutor/claims` accepts one identity claim and Subject-specific qualification/experience claims with a description and a separate owned evidence ID. Subject IDs must refer to active catalogue Subjects, not exams or languages. At most ten claims are allowed per revision.

`POST /v1/me/tutor/submissions` requires an identity claim and at least one Subject claim, all with clean-scanned owned evidence. Statuses are DRAFT, SUBMITTED, CHANGES_REQUESTED, APPROVED and REVOKED. Staff can request corrections or reject a claim; a corrected profile starts a fresh revision. Approval is reached only after all current claims are approved. Revocation blocks profile eligibility; the owner can submit a revised profile for another review but cannot restore old approvals.

Each review records its actor, specific check, outcome, reason, adult-identity confirmation and explicit future expiry (no more than two years). Review history is append-only. Approval is a statement about the described evidence/check, not a teaching-quality or qualification-authenticity guarantee. The owner sees exact checks, outcomes and expiry. Expired approvals, a disabled account, removed Tutor role, changed profile revision or revoked approval prevent eligibility.

`TutorsService.requireQualified(client, userId, subjectId)` is the transaction boundary for task 07. It locks current owner/profile facts and requires current clean, unexpired identity and matching Subject evidence approvals. Profile locking serializes it with review/revision changes. This does not publish a listing; teaching offers still require their own approval.

## Uploads and storage

- `GET /v1/tutor-policy` reports whether uploads are enabled and whether only fictional testing is configured.
- `POST /v1/me/tutor/evidence` accepts strict JSON `{media_type,data}` where data is canonical base64. PDF, PNG and JPEG are allowlisted, with matching signatures and a 1 MiB decoded limit. Obvious active/embedded PDF content is rejected; the signature/marker check is not a full document parser or substitute for malware scanning. The larger 1400 KiB JSON limit applies only to this upload route; ordinary forms keep the 8 KiB limit.
- Evidence is encrypted with AES-GCM in PostgreSQL, avoiding public filesystem paths and original filename/path handling. At most twelve retained/recent uploads per account or day are permitted. Quarantined, scan-rejected, scan-error and withdrawn files cannot be claimed or downloaded as accepted review evidence.
- Scanning happens outside the database transaction, with quarantine committed before scan. Scanner exceptions/errors fail closed. A process interrupted during scanning can leave quarantined evidence; the owner withdraws the unusable upload and replaces it. Automatic retry/replay is not claimed in this task.
- `DELETE /v1/me/tutor/evidence/:id` authorizes the owner and clears encrypted bytes while retaining minimal audit metadata. Evidence attached to a current pending/approved claim requires a revised draft before withdrawal. Broader retention/export/deletion policy remains task 23.
- No public profile/evidence endpoint is exposed by this task. Own reads require the Tutor session; staff queues exclude date of birth/file bytes.

## Scanning configuration

Default `EVIDENCE_SCANNER=disabled` leaves upload disabled. For local fictional testing, set `EVIDENCE_SCANNER=test`; the UI provides **Upload fictional sample**, disables real-file selection and displays the test-only notice. The test scanner only releases a fixture carrying the fictional marker, rejects malicious-fixture markers and simulates scan errors. It is not an antivirus engine. Test-scanned files remain marked test-only and cannot authorize production publication/downloads. Production rejects both test configuration and injected test scanner adapters.

For production scanning configure `EVIDENCE_SCANNER=clamav`, `CLAMAV_HOST` and `CLAMAV_PORT` (default 3310). The adapter streams bounded bytes with the documented [ClamD INSTREAM protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), accepts only an exact `stream: OK`, and fails closed on detections, malformed/oversized replies, connection errors and the 15-second deadline. The configured daemon must be operated in a trusted private network or through a secure tunnel: ClamD TCP does not provide encryption/authentication. Deployment must provision ClamAV, maintained signatures, compatible scan limits and real clean/malicious fixture checks. Protocol tests use an isolated TCP fixture, not a provisioned live antivirus daemon.

## Staff review and downloads

Trust staff with active account-bound MFA open `/staff/tutors`. `GET /v1/staff/tutors` lists cases; `POST /v1/staff/tutors/:userId/inspections` requires a 10–240 character purpose and audits private inspection. Reviewers cannot inspect/review their own evidence. `POST /v1/staff/tutor-claims/:claimId/reviews` accepts APPROVE, CHANGES_REQUESTED, REJECT or REVOKE, a specific check and reason, adult-identity confirmation and approval expiry. Stale/concurrent repeated decisions are rejected. Support/Finance scope alone cannot access the workflow.

`POST /v1/staff/tutor-evidence/:id/download-grants` records purpose and returns a random 60-second, one-use token bound to the current account/staff sessions, actor and profile revision. The database stores only its hash. `POST /v1/staff/tutor-evidence/downloads` sends the token in JSON, rechecks MFA/ownership eligibility, current revision and scan/claim status, consumes the token transactionally and audits the actual download. Expired, reused, foreign-session, revoked-session, stale-revision or unavailable evidence grants cannot release bytes. Downloads are attachments with a generated filename, no-store, nosniff and restrictive sandbox CSP. Token values and document contents are absent from audit metadata.

Before live document collection, complete the deployment scanning checks, evidence checklist and staff operating procedures, encryption-key recovery/rotation, and approved privacy/retention handling. The new encrypted profile/evidence fields must be included in any future AUTH_SECRET rotation/re-encryption process.
