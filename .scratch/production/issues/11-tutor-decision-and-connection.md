# 11: Accept a Contact Request and establish an authorised Connection

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 10 — Send and inspect a covered Contact Request

**What to build:** A target Tutor accepts or declines a request, and a qualifying covered request establishes one Connection with grant-gated contact access.

## Acceptance criteria

- [x] Only the targeted eligible Tutor can decide an unexpired pending request; retries are harmless and deadline equality is expired.
- [x] Connection/contact reads require participant authority and current safety eligibility.
- [x] Connection, participant and conversation creation are transactional and unique per request.
- [x] Requests covered at submission may complete after ordinary pass expiry but cannot use revoked access.
- [x] Race/permission tests cover repeated acceptance, unrelated Tutors, suspension and stale eligibility.

## Verification evidence

Implemented on 12 October 2026:

- `/tutor/requests` lists bounded, target-owned enquiries and their deadlines; private goals/times require current pending eligibility. Eligible Tutors accept or decline through a strict decision command. Ordinary paused offers may be declined, while acceptance requires the exact currently approved available Listing/profile revisions and Subject/mode. Self/unrelated/forged-client decisions do not authorize access; equality is expired.
- Migration 011 creates unique-per-request decisions and Connections, exactly one participant per adult role, one conversation record per Connection and one Connection access grant. Shared submission coverage is locked before the request transition, preserving the purchase coordination boundary for later activation/refunds. Participant account locks use UUID order. A failed conversation insertion rolls back decision, Connection, membership and grant together.
- Same-action retries return the original result; conflicting accept/decline actions commit one decision and reject the other. Request status is refreshed after participant lock acquisition so concurrent retries return ACCEPTED rather than a stale pre-lock PENDING value. Inbox rows are likewise refreshed after acquiring their bounded participant locks. Read-only session-owner planning never bypasses full account/session authorization.
- `/connections` lists safe participant metadata and current availability. `/connections/:id` checks adult membership, current beneficiary/Guardian consent, qualified adult Tutor, blocks, Listing/Connection restrictions and a current Connection grant before exposing the original enquiry. Contact details require a separate checked/audited GET. Only the peer's verified account email and precise role/ownership label are returned; child beneficiaries are represented by the Guardian account, and no phone contact is invented. Contacts are cleared and permission rechecked on focus/explicit refresh; already disclosed email cannot be recalled.
- ACTIVE coverage qualified at submission remains usable for the original request after ordinary pass expiry. Revoked acquisition access prevents an unconnected request from accepting. Established relationships have their own grants, so later acquisition-right revocation does not silently remove established access; explicit Connection-grant revocation or current safety restrictions deny reads. Ordinary Listing pause preserves established access, while safety suspension, current blocks, disabled accounts and unusable evidence/consent deny it.
- MATCHING acceptance records an accepted request and PENDING_GRANT Connection/member/conversation metadata, without granting contacts or starting/resetting an Access Pass. Actual activation/verified grants remain task 15. Current coverage is explicitly FIXTURE only; production rejects fixture decisions, detail/contacts and list/inbox projection. No actual payment or production contact release is claimed.
- The participant/safety/grant transaction boundary is exposed as `ConnectionsService.withConnection` for task 12 chat/history commands. Account links, payer request history Connection links and responsive private inbox/detail/list screens consume the authoritative cookie API. Contact links encode their email address for a correct mailto URI. No local auth, client-paid flag, public identity document or child contact is introduced.
- `npm test` passed all 80 PostgreSQL/API tests and nine UI tests together. Ten new scenarios cover target/foreign/unauthenticated decisions, precise private projection and contact auditing, duplicate acceptance and conflicting decisions, exact deadlines, ordinary access expiry and explicit grant revocation, revoked acquisition coverage, pending activation without contact release, paused/revised/suspended/stale offers, blocks/account/Connection safety, Guardian consent, full transaction rollback/retry, two Tutors sharing unchanged coverage dates and production fixture isolation. The enhanced retry race also asserts both replies report ACCEPTED.
- All eight Edge browser journeys passed together (4.8 minutes). The expanded Tutor journey covers incoming goals/times, acceptance and harmless replay, payer accepted history, separate contact reveal for both adults, a declined enquiry, and denied subsequent contact API/detail after safety suspension. A 390px private Connection screenshot was inspected and showed no horizontal overflow. Existing account, availability, catalogue, Guardian, staff and Tutor approval flows passed.
- Final root build/typecheck and whitespace checks passed. Migration 011 was applied to the existing development database and the verified stack restarted on 3000/4000/5433. Browser fixture ports stopped; secrets, database/mail, screenshots and test logs remain ignored.

Contracts, permission/lock rules and isolated-testing steps: [Connection guide](../../../docs/api/connections.md). Next numbered slice is task 12 durable text chat. Payment/activation, real SMTP, approved Guardian/privacy/retention policy and deployment remain later release dependencies.

## Comments


