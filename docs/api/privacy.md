# Personal data export, erasure and retention

Task 23 adds `/privacy` (linked from **My account**) and `/staff/privacy` (linked from the MFA staff console). The NestJS API owns identity, authorization, erasure and job status. The background worker runs privacy jobs alongside payment, mail and notification loops.

## Account journey

1. Enter the current account password and request a data export. Verification creates a single-use, five-minute proof bound to the account, session and action; it never returns an account session token.
2. Refresh request status. When complete, enter the password again and download `personal-data.json`. The encrypted artifact expires after 24 hours. A current account is required; the tracking cookie cannot download data.
3. For deletion, enter the password and type `DELETE MY ACCOUNT`. Acceptance immediately disables the account, revokes account/staff sessions and contact grants, pauses Listings, withdraws Learners and suppresses pending notices. The queued job removes personal content and assets. It does not cancel financial obligations.
4. Guardians can withdraw a selected child Learner's consent. The saved consent/request context loses enquiry and chat access and is erased under the policy. Other Learners and the adult account remain available. Fresh later consent does not reopen old grants; restore reapplication respects that newer consent.

The privacy-authorized state response supplies only the current owner's child profile IDs and aliases for withdrawal. This remains available to restricted adults through verified privacy identity; it does not grant marketplace access. Receipt-only tracking never includes the child list.

A separate HttpOnly cookie permits read-only tracking in the verifying browser for 30 days after account sessions are revoked. It shows request references, status and restricted retention summaries; it cannot authorize a new action, inspect retained content or download an export. **Forget tracking on this browser** clears it. Private pages are noindex; API responses and downloads use no-store. Passwords and proofs are held only in component memory.

## Data boundaries

| Data | Export | Account erasure / retention |
| --- | --- | --- |
| Account, Learners and consent history | Owned fields and adult/Guardian submissions | Identifiers and learning requirements erased; permissions withdrawn |
| Guardian and Tutor evidence, birth date, claims and decisions | Owned metadata, decrypted submissions and clean scanned asset bytes | Source bytes erased; approved EVIDENCE exception encrypted for Trust |
| Tutor photos, including old submissions | Metadata and clean asset bytes | Public availability removed; bytes erased; PHOTO exception restricted to Trust |
| Listings and submitted enquiries | Owned offer/message content and decisions | Personal free text redacted; immutable commercial terms preserved |
| Connections and chat | Own participant metadata and own sent text | Grants revoked; own sent text redacted; selected child context erased on withdrawal |
| Reviews and appeals | Own submissions and decisions | Authored Reviews withdrawn; personal text moved to restricted SAFETY retention if required |
| Safety and support | Own reports, appeals, case history and user-visible messages | Original evidence separated into Trust/assigned support scope; ordinary source text redacted |
| Purchases, receipts, refund/dispute facts and entitlements | Owned financial and access records | Amounts, states, immutable accounting facts and obligations preserved; private refund descriptions restricted |
| Availability, notifications, preferences, sessions and blocks | Own records, safe session metadata and own block choices | Contact subscriptions withdrawn; pending notices suppressed; captured local mail erased |
| Staff membership and privacy history | Own scopes/enrollment boolean and request status | Staff access disabled; secrets removed; minimal audit/tombstone references retained |

Exports omit other participants' contact details/private contributions, internal support notes, staff authentication secrets, token hashes, raw provider payloads and unsafe uploads. An export snapshot is limited to 50 MiB; a larger snapshot enters tracked retry/failure for operator handling rather than producing a partial download. No external analytics provider or application cache is configured; propagation reports that fact. Any future analytics/cache integration must add an erasure adapter before collecting personal data there. Live public eligibility is rechecked; removed photo asset URLs cease to resolve. Previously disclosed contacts, downloaded files and browser/device copies cannot be remotely recalled.

First-party [marketplace reporting](./public-pages-and-metrics.md) excludes erased accounts and withdrawn Learner contexts from operational request/Connection cohorts. It retains immutable financial obligations and their checkout-domain facts under the existing retention/exception rules; owned domain facts are included in financial exports. Anonymous daily search counters and expiring hashed retry receipts contain no account/child identifiers, raw query, IP, email or cookie and cannot be linked to an erased account. No unique-person or teaching-outcome estimate is inferred from them.

## Approved policy and local testing

`PRIVACY_RETENTION_POLICY_FILE` selects a JSON schedule (or `PRIVACY_RETENTION_POLICY` supplies the same JSON). It requires an immutable version ID, approver, approval reference, `test_only`, and explicit `{days,purpose}` rules for ACCOUNT, PHOTO, EVIDENCE, SAFETY, SUPPORT and FINANCE. Durations must be integers from 0 to 3650. No legal retention duration is invented by the application.

`config/privacy-retention.example.json` is **fictional testing only**. Its one-day values are test data, not a legal or commercial recommendation. To exercise deletion locally with fictional accounts, point `PRIVACY_RETENTION_POLICY_FILE` at that file, set `PRIVACY_TOMBSTONE_DIR` to a separate local test ledger directory, initialize the ledger using the operator command below, and restart the stack. The browser suite provisions its own fictional schedule, data directory and encryption key. It never deletes owner records.

With no policy, development exports remain available and erasure controls explain that approval is pending. Production startup rejects a missing, fictional or unapproved schedule. It also requires `PRIVACY_POLICY_APPROVED=true`, `PRIVACY_LEDGER_DURABILITY_CONFIRMED=true`, a configured ledger directory, and a valid complete signed ledger. Flags record operator confirmations; they do not provision independent storage or constitute legal approval. Existing applied policy IDs cannot be reused with different rules. Each accepted erasure stores its policy snapshot.

Base deletion retention starts at request acceptance. Source evidence retention starts when the relevant evidence purpose ends: current approved teaching evidence and active approved Guardian consent remain available. A tracked sweep runs every five minutes, purges expired unreferenced/revoked evidence, revokes obsolete claims and records policy/count/outcome. Retained snapshots purge after their base deadline when no exception remains. Minimal tombstone, audit and immutable financial facts remain to prevent resurrection and preserve obligations; their independent storage lifecycle is part of the approved recovery/financial policy, not a promise of blanket removal.

## Exceptions and staff controls

SUPPORT sees the job queue and its account/support retention; TRUST sees evidence/photo/safety records; FINANCE sees financial retention. Staff MFA and an audited purpose are required before inspection. The scope comes from the retained record on the server. Expired or purged payloads return 410 and cannot be resurrected by a new hold.

Active safety restrictions/cases, unresolved scope-specific support work, uncertain purchases, outstanding refunds, disputes and reconciliation exceptions hold the relevant classes. Staff can add or release a separately audited hold using a real case/legal reference. Releasing a manual hold does not override automatic financial/safety exceptions. Original money facts and source decisions remain immutable; narrowly authorized privacy jobs can redact personal free text without changing those facts.

Jobs use leases, bounded retries, idempotent request keys and recorded outcomes. Support can replay a FAILED/RETRYING job with a reason. Local capture deletion removes the matching fictional messages, including captures that arrive after cancellation. SMTP messages already accepted externally cannot be automatically recalled: deletion remains **EXTERNAL_REVIEW** until Support records verified provider handling with its reference. The UI does not present that external work as complete.

## Recovery ledger and offline commands

Each completed non-export job first writes an fsynced HMAC-signed tombstone file and atomically updates a signed index in `PRIVACY_TOMBSTONE_DIR`, separate from the database. Writers serialize with a database advisory lock. Keep the original encryption/signing key securely recoverable. Validate all signatures, mode restrictions and indexed files before applying any restored changes. Missing or altered storage fails closed. Initialization refuses to replace a lost index when entry files already exist.

With API and workers stopped, from the repository root:

```powershell
npm run privacy:operator -- init-ledger development --traffic-stopped
npm run privacy:operator -- validate-ledger development --traffic-stopped
npm run privacy:operator -- reapply development --traffic-stopped
```

Use `production` instead of `development` only with the actual approved production configuration. Initialize only a genuinely new ledger; recover an existing ledger and its signed index from independent storage. After restoring a database, migrate it, validate the complete independent ledger and reapply erasure **before** serving traffic. Reapplication is idempotent, preserves original retention deadlines, does not resurrect purged payloads and revokes restored sessions/grants. Drain pending accepted erasure work before creating a planned recovery checkpoint; reconcile external financial facts before checkout resumes. These commands require an explicit offline acknowledgement; they do not stop traffic themselves.

Independent cross-region persistence, access controls, key recovery, storage budget, an actual restore drill and release gating belong to the recovery/deployment tickets. Preserve applied migration bytes and verify cross-host checksum compatibility during that drill; raw SQL checksums currently depend on line endings. The local restore test proves reapplication logic against an isolated database; it does not certify production RPO/RTO or power-loss durability of a local directory.

## HTTP surface

Public: `GET /v1/privacy-policy`.

Account: `GET /v1/me/privacy`, `POST /v1/me/privacy/verifications`, `POST /v1/me/privacy/requests`, `POST /v1/me/privacy/requests/:id/download`, `DELETE /v1/me/privacy/receipt`.

Staff: `GET /v1/staff/privacy?scope=...&reason=...`, `POST /v1/staff/privacy/retained/:id/inspections`, `POST /v1/staff/privacy/retained/:id/holds`, `POST /v1/staff/privacy/requests/:id/retries`, `POST /v1/staff/privacy/requests/:id/external-completions`.

Browser writes retain the existing exact-Origin, JSON and cookie protections. Export verification is rate limited, requests are bounded per account, and production queues exclude fictional records. Receipts never replace account or staff authorization.
