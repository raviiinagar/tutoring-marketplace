# Connection-linked Reviews

Task 21 lets a connected adult Learner or Guardian submit feedback after seven complete days from Connection establishment, with an explicit actual-interaction attestation. The server uses its own clock; equality at seven days is eligible. An Access Pass's ordinary expiry does not remove an established safe Connection's review rights.

The adopted duplicate rule is **one review per adult account and Tutor relationship**, including multiple Listings, Connections or child profiles represented by that adult. Ratings are integers 1–5; feedback is 30–1500 characters. One request key retries the same content idempotently. Reusing it for different content conflicts. Reviews do not prove booked/completed lessons, attendance or learning outcomes.

## Try the workflow

1. Open `/connections`, then **Tutor feedback and review eligibility**. `/reviews/:connectionId` shows the server's eligible time. Choose a rating, describe the interaction and explicitly confirm that it happened.
2. New feedback is `PENDING`, with its text encrypted until a Trust decision. Obvious contacts/links and control characters are rejected; human privacy and content review remains necessary, including checking for child names and private documents.
3. A different Trust staff member with current MFA opens `/staff/reviews`, supplies an operational purpose, inspects the selected review, and records a policy finding and reason. Apply the same relevance, privacy, abuse and unsupported-claim checks to positive and negative feedback. A low rating is never itself a rejection reason.
4. Compliant reviews become `PUBLISHED`. Tutor search cards show actual count/average only when nonzero. Public offer detail shows feedback, its count/average, the anonymous role **Adult learner** or **Guardian**, and the attendance disclaimer. No account/Connection/profile IDs, child aliases, contacts or documents appear in the public projection.
5. `/reviews` shows your submitted and received moderation outcomes. Authors can withdraw their own feedback, even after Guardian consent or marketplace rights are withdrawn. Tutors cannot withdraw someone else's review. Private pending/rejected/removed text is not exposed to the Tutor. Trust can remove a published policy violation with a recorded reason.
6. Related adults can lodge a private, revision-linked moderation appeal after a decision. Its stable reference and `PENDING` status are available now; adjudication and support-case linking are task 22. An appeal does not republish removed feedback.

Participant blocking still stops chat and contacts. It does not prevent an otherwise eligible review or erase a published rating: this prevents a participant block from suppressing honest negative feedback. Current safety restrictions, account status, Guardian consent and Connection grants remain authoritative.

## API

Private endpoints use verified cookie sessions; writes require allowed Origin and JSON. Request schemas reject extra fields.

| Method/path | Behaviour |
| --- | --- |
| `GET /v1/me/connections/:id/review` | Payer-only current eligibility, server time, eligible time, own existing review and `review-v1` notice. |
| `POST /v1/me/connections/:id/review` | `{request_key, rating, text, interaction_attested:true, policy_version:review-v1}`; returns 201, initially pending; exact retries return the original review. |
| `GET /v1/me/reviews` | Latest 50 own/received review outcomes, history and the current actor's appeal references. Pending private content remains author-only. |
| `POST /v1/me/reviews/:id/withdrawals` | Author-only `{revision}`; withdrawal is terminal and idempotent. |
| `POST /v1/me/reviews/:id/appeals` | `{request_key, revision, description}`; 10–2000-character encrypted private explanation. Current `PUBLISHED`, `REJECTED` or `REMOVED` outcomes can be appealed once per actor/revision. |
| `GET /v1/staff/reviews?reason=...` | Trust + MFA and audited 10–240-character purpose; queue metadata excludes review bodies and identity fields. |
| `POST /v1/staff/reviews/:id/inspections` | `{reason}`; audited selected review content and immutable decision history. Participants cannot self-moderate. |
| `POST /v1/staff/reviews/:id/decisions` | `{revision, outcome, policy_code, reason}`. `PUBLISH` requires `POLICY_COMPLIANT`; `REJECT`/`REMOVE` require `PERSONAL_DATA`, `ABUSE`, `IRRELEVANT` or `UNSUPPORTED_CLAIMS`. |
| `GET /v1/discovery/:listingId/reviews?cursor=...` | Anonymous read for a currently discoverable offer. Stable UUID pages of 10; Tutor-wide count/average cover all currently eligible published feedback, independent of the current page. |

`PENDING → PUBLISHED/REJECTED`, `PUBLISHED → REMOVED`, and author withdrawal are revisioned, locked transitions. Removed/withdrawn/rejected feedback cannot be silently republished through an old decision. Decision history is immutable and audit metadata omits review/appeal text. Appeals remain encrypted and are not part of public review responses.

## Publication and isolation

Public totals are computed from a shared PostgreSQL read projection, not a separate counter that can drift after removal. Each discovery snapshot and its summary use the same transaction. Current account/role state, grants, Guardian approval and matching current consent versions, learner withdrawal, and account/Listing/Connection safety restrictions filter both the list and the aggregate. A temporarily restricted source remains hidden while restricted; a terminal review state cannot reappear when a source restriction lifts.

Production reads exclude fictional/provider-test reviews and additionally verify the originating Connection's coverage classification, so a copied review with an incorrect flag cannot contribute to a live rating. The configured Guardian policy is checked by the public projection; live child-profile collection remains gated on the already required approved verification/consent adapter. Anonymous offer visibility still rechecks current Tutor evidence and Listing eligibility.

Migration 023 adds review, decision and appeal storage without resetting existing data. Task 22 links appeals atomically into [Support](support.md); authorized Trust staff can uphold the current outcome, return rejected/removed feedback to fresh moderation, or close a changed source as superseded. Withdrawal remains terminal. Retention/deletion orchestration remains task 23. There is no independent child account, automated sentiment-based moderation, invented rating, or attendance-verification claim.

## Verification

Real-PostgreSQL HTTP tests cover exact seven-day timing, current adult authority, interaction attestation, contact validation, idempotency/duplicates, both rating polarities, scoped MFA and self-moderation, public aggregate recalculation, terminal/stale decisions, Guardian consent withdrawal, blocks, safety suppression, private appeal references and imported-fixture isolation. UI tests verify explicit attestation and honest zero-review presentation. The isolated mobile Tutor browser journey exercises submission, Trust publication of negative feedback, public display and author withdrawal. Final run results are recorded in ticket 21.
