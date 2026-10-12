# Covered Contact Requests

Task 10 implements enquiry submission and the payer's private history. Tuition remains payable directly to the Tutor. A pending enquiry is not an accepted lesson, Connection or permission to release contacts. Tutor acceptance/decline follows in task 11; checkout and paid activation follow in tasks 14–15.

## API and UI

Available public offer pages contain **Send a Contact Request**. Anonymous visitors can sign in; an account holder selects a currently usable adult/Guardian-controlled Learner, adds learning requirements and preferred times, and sends an enquiry only when the server reports qualifying coverage. `/requests` lists private enquiry snapshots, response status and deadline; `/account` links there. Without coverage, submission stays disabled and the API rejects it. There is no checkout or free grant button.

| Method/path | Behaviour |
| --- | --- |
| `GET /v1/me/request-access` | Current coverage eligibility, pending count/limit, immutable request-policy version and explicit checkout availability (`false` until payment integration). |
| `POST /v1/me/contact-requests` | Submit or replay a covered enquiry; returns 200 with `{request, replayed}`. |
| `GET /v1/me/contact-requests?cursor=<uuid>` | Payer-owned history; bounded 20-item UUID pagination and next cursor. |
| `GET /v1/me/contact-requests/:id` | Payer-owned detail; unrelated account/Tutor access returns 404. Tutor inbox is task 11. |

Submission accepts exactly `request_key`, `listing_id`, `listing_revision`, `learner_id`, `subject_id`, `teaching_mode: ONLINE`, `learning_requirements` (20–500 characters) and `preferred_times` (5–160 characters). Emails, URLs, obvious phone numbers/social handles and control characters are rejected. This is bounded enquiry text, not chat or document upload; deliberately encoded contact sharing cannot be perfectly detected. The client cannot set payer, Tutor, access source, payment, policy or expiry. Public discovery exposes the Listing revision so a stale offer is rejected before a fresh submission.

The transaction checks the active verified payer/Learner role, beneficiary ownership/current Guardian approval and consent, currently approved/unpaused/unsuspended exact Listing and evidence/taxonomy, selected Subject/mode, self-contact exclusion, current blocks in either direction and authoritative coverage. Multi-account submission locks user rows in UUID order before session/profile/Listing locks. Payer serialization enforces five unexpired pending requests across every Learner, Tutor and coverage record. Future block commands must take the same sorted participant locks before changing `account_blocks`; merely reading a public offer never grants access.

`contact-v1` is an immutable request policy: five pending requests and a 72-hour request lifetime. Matching coverage caps expiry at its recorded capture-based matching deadline. Active coverage requires `starts_at <= now < ends_at` at submission; its later ordinary expiry does not shorten the request's immutable expiry. Equality is expired. History projects elapsed pending requests as EXPIRED immediately; subsequent submission retires elapsed rows under the payer lock. The scheduled deadline/refund lifecycle follows in task 16–17.

Request/offer revisions, encrypted message, original coverage/policy snapshots and expiry are immutable database fields; status may change in later commands. The same payer/key returns its original result even after coverage or Listing availability changes. Changed payload with a reused key conflicts. An identical pending enquiry for the same beneficiary/Listing also returns the existing request; its alternate retry key is durably mapped so a delayed retry cannot create another enquiry after expiry. No notification or billing effect is repeated.

Enquiry text is encrypted at rest and omitted from audit metadata. Owner responses omit private Tutor contacts, account IDs and raw entitlement details. A withdrawn/unusable child profile hides alias and enquiry text even on idempotent replay; stored encrypted history remains subject to task-23 approved retention/deletion. Request history does not authorize Tutor contact access.

## Isolated testing before payments

The current `access_entitlements` schema supports **FIXTURE only**. Production refuses fixture coverage, fixture replays/history and the test grant helper. There is no production coverage writer or HTTP grant endpoint; verified capture/commercial policy and activation integration are intentionally required in tasks 14–15 before live requests can succeed. Do not present a fixture as a payment or activated paid Access Pass.

Automated API/browser tests exercise successful coverage in fresh loopback `*_test` databases. To manually test the same isolated UI:

1. From the repository root, start `node scripts/browser-stack.mjs`. It creates a fresh fictional stack at `http://localhost:3100` (API 4100, PostgreSQL 5434), separate from the normal 3000/4000/5433 database. Do not run it while browser tests use those ports.
2. Create/verify a fictional `learner@example.test` account using its captured inbox and create an adult Learner profile. Prepare a different fictional Tutor and Trust reviewer using the existing Tutor approval guide; publish an eligible offer. Guardian testing uses the explicitly fictional test policy, never real child/evidence data.
3. Grant isolated coverage from another terminal:

```powershell
node --env-file=.local/browser-tests.env node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json scripts/contact-request-fixture.ts learner@example.test
```

4. Reload the available offer, select the Learner, describe goals/times and send. Open **View your Contact Requests** and refresh to verify durable pending status/deadline. The UI explicitly says no payment was made.
5. The optional final CLI argument `MATCHING` exercises fictional capture-based matching coverage rather than ACTIVE coverage. It does not start the 30-day access clock. Stop the isolated stack with Ctrl+C when finished.

The helper rejects production, non-loopback connections, databases without the `_test` suffix, non-fictional email domains and unverified/inactive identities. It is outside the API build and cannot grant coverage in the ordinary development marketplace database. Normal local testing can inspect the missing-access state until actual sandbox checkout is implemented.
