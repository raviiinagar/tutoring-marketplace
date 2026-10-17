# Support cases and appeals

Task 22 adds `/support` for account holders and `/staff/support` for authorized operators. Both are linked from the respective account/console. Review and safety appeals create a support case in the same database transaction as the originating appeal. Refund decisions can be appealed from the payment history refund-review panel. There are no independent child support accounts; the adult account holder owns the case.

Human support coverage is **Monday–Saturday, 10 am–6 pm IST**, timezone `Asia/Kolkata`. Requests are accepted outside coverage and wait for staff. `/v1/support-policy` publishes coverage, current open/closed status and the next opening. This is not an immediate-response or 24/7 human-support promise. Automated payment and notification processing keeps its existing schedule.

## Account-holder interface

| Method and path | Behaviour |
| --- | --- |
| `GET /v1/support-policy` | Public coverage and privacy notice. |
| `GET /v1/me/support-cases` | Latest 100 owned case summaries and coverage. No other account's cases or private staff notes. |
| `POST /v1/me/support-cases` | `{request_key,category,subject,description}`; categories `ACCOUNT`, `BILLING`, `OTHER`. A 5–120 character subject and 10–2000 character description are encrypted. Exact request-key retries return the original case; changed payloads conflict. |
| `GET /v1/me/support-cases/:id` | Owned description, current status and customer-visible chronological events; unrelated IDs return 404. |
| `POST /v1/me/support-cases/:id/messages` | `{revision,message}`; append a customer reply to an unresolved owned case. Stale revisions conflict; a repeated unknown-result submission must first refresh history. |
| `POST /v1/me/refund-cases/:id/appeals` | `{request_key,description}`; the payer may appeal a closed refund review once. An open refund review cannot be appealed. |

Existing review/safety submission paths stay supported. Their new and existing pending appeal records are linked into Support by migration 024. Review appeals reference the exact appealed review revision. New safety appeals reference the safety-case revision; a participant can appeal another recorded revision after a new decision. Imported safety appeals predate revision storage: their baseline is the safety-case revision at migration, so operators must inspect the original history before acting.

Case creation and refund appeals are limited to ten new cases per account per day; customer replies are limited to fifty per day. Existing safety appeal rate limits remain. Restricted adults can identify their own support records and appeal without regaining marketplace, contact or chat permission. Requests and cases do not collect Tuition Fees or confirm lesson delivery.

## Staff interface

Every request rechecks the active verified account, current staff scope, and account-bound, unexpired MFA session. The case scope cannot be chosen or upgraded by the customer: account/other questions require `SUPPORT`, billing/refund appeals require `FINANCE`, and review/safety appeals require `TRUST`. A participant cannot adjudicate their own case or a review/safety appeal involving their account, even if they hold the matching staff scope.

| Method and path | Behaviour |
| --- | --- |
| `GET /v1/staff/support-cases?scope=...&reason=...` | Audited queue for one assigned scope; up to 100 cases, unresolved first. Metadata only; no descriptions, notes or customer identity fields. |
| `POST /v1/staff/support-cases/:id/inspections` | `{reason}`; purpose-recorded selected case body and staff-only history. |
| `POST /v1/staff/support-cases/:id/actions` | `{revision,operation,reason,message?}`; revision-checked assignment, notes, replies and explicit outcomes. |

`reason` is 10–240 characters and records an operational purpose, not credentials or private evidence. A response/private note is 10–2000 characters. Claim a case before writing; another operator cannot act until the assignee releases it. Assignment uses the current actor, never a caller-supplied staff identity. Changing roles/MFA or losing account authority denies subsequent reads/actions. An unavailable assignee must have their access restored through the existing audited operator workflow to release the case; this MVP does not silently take over assignments.

`CLAIM` starts `IN_PROGRESS`; `RELEASE` returns `OPEN`; `NOTE` appends a restricted staff note; `REPLY` sets `WAITING_CUSTOMER`. An owner reply returns the assigned case to `IN_PROGRESS`. `RESOLVE` closes a general support question with a customer response. Resolved cases are terminal through this interface; a new issue needs a new case. Concurrent/stale changes return 409 and require inspection before retrying.

## Appeal outcomes and domain authority

Generic `RESOLVE` cannot close an appeal. The explicit operation must match its domain:

| Appeal | Supported resolution | Effect |
| --- | --- | --- |
| Review | `UPHOLD` | Preserve the current moderation decision. |
| Review | `REOPEN_REVIEW` | Reviews command returns a rejected/removed review to `PENDING` and records a new immutable moderation decision. Publication requires a separate fresh policy check, with existing source eligibility checks. Withdrawn feedback is never restored. |
| Review/safety | `SUPERSEDED` | Close only when the source revision changed; retain the source state. |
| Safety | `UPHOLD` | Preserve the current safety outcome. |
| Safety | `LIFT_ACCOUNT`, `LIFT_LISTING`, `LIFT_CONNECTION` | Safety command lifts only that appealed case's active restriction for the selected target. Other cases, blocks and consent restrictions remain effective. Lifting never republishes a paused Listing. |
| Refund | `UPHOLD` | Preserve the immutable original Finance decision. |
| Refund | `RECONSIDER_REFUND` | Finance command opens a new refund-review case linked to the original and the support case. This does not approve, initiate or complete a refund. |

Changing review/safety source revisions blocks a stale appeal action. Operators inspect the current domain record and close a superseded appeal explicitly. To remove a published review, use the existing policy-coded Review moderation command, then close the now superseded appeal. The support screen links to each evidence workspace and shows original record/appeal references.

Refund reconsideration never edits a closed `refund_cases` row or any financial journal. The new Finance review still needs an explicit amount/access-treatment decision and all existing capture, cumulative reversal, refund-reserve and provider reconciliation checks. Existing safe conversations survive ordinary financial reversal under the existing policy.

Domain effects, source-appeal closure, support revision/status, immutable encrypted event and redacted audit record commit in one transaction. The orchestrator calls authorized domain commands with the same database client; it does not impersonate a Tutor, start nested domain transactions, or make provider calls under database locks. Accounts lock in UUID order before case/source transitions. No case operation itself authorizes contact release.

## Storage and verification

Migration `024-support-cases.sql` is additive. It preserves accounts, money records, source evidence and historical decisions. Support descriptions/messages/private notes are encrypted with the configured application key. Events and refund-reconsideration links reject updates/deletes. Queue/audit metadata excludes message bodies. Production filters fictional cases; test adapters use fresh isolated PostgreSQL databases. Evidence is referenced in its original authorized workspace; support has no document-upload bypass.

`apps/api/test/support.test.ts` exercises ownership, scoped MFA, self-review exclusion, assignment conflict, private notes, owner replies, stale/terminal outcomes, exact IST coverage, review reopening/withdrawal and revisioned safety appeals through HTTP. `support-finance.test.ts` exercises payer-only refund appeals, Finance separation, immutable original decisions, a new domain review and preserved established contact access. Existing chat, Review and Finance regressions run alongside them. UI tests cover submission, scoped inspection, signed-out coverage and clearing private content after authorization failure. The isolated browser journey exchanges a complete owner/staff case and checks private-note exclusion and mobile width.

Remaining operations dependencies are the already documented staffed coverage, legal operator/contact details, actual email/payment configuration and launch approvals. Retention/deletion orchestration remains task 23. Support history is currently checked in the application; adding this feature does not claim that real email/SMS delivery is configured.
