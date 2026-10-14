# Tutor decisions and authorised Connections

Task 11 adds the Tutor inbox, accept/decline commands, transactional Connection membership/conversation metadata and permission-gated verified email contacts. Acceptance establishes a relationship, not a booked or attended lesson. Tuition remains settled directly with the Tutor.

## Local flow

1. Use task 10's [isolated coverage setup](contact-requests.md#isolated-testing-before-payments). The ordinary development database cannot receive fixture grants. Real checkout/capture/activation integration remains tasks 14–15; production refuses these test grants and Connections.
2. Send a fictional covered enquiry from the Learner/Guardian account. Sign into its target Tutor account and open **Incoming Tutor enquiries** from `/account`, or `/tutor/requests`.
3. Review goals/times and the recorded response deadline, then accept or decline. Only an eligible targeted Tutor can decide; simultaneous retries are harmless. Decline creates no Connection. An ordinary paused offer can still be declined, while acceptance requires the exact currently approved available offer.
4. With ACTIVE coverage that qualified at submission, acceptance creates one active Connection, two adult participant records, one conversation record and one Connection access grant in the same transaction. Learner and Tutor can open `/connections`; the Learner's `/requests` history also links to the Connection.
5. Select **Show verified contact** on the Connection page. The server rechecks permissions before returning the other adult participant's verified account email. A child Learner's contact is always their verified Guardian's account email, never a child email. Phone contacts are not implemented or invented.
6. Safety suspension, current blocking, unusable Learner/Guardian consent, disabled accounts, revoked Connection grants or expired/stale Tutor evidence deny subsequent reads. Refresh/focus clears any displayed contact while access is checked again. Already disclosed emails cannot be recalled. Task 12 adds permission-rechecked realtime [private text chat](chat.md); task 13 adds block/report controls.

## API

All endpoints use authoritative HttpOnly account sessions and no-store responses. Writes require an allowed Origin and JSON; query/body validation rejects unknown fields.

| Method/path | Behaviour |
| --- | --- |
| `GET /v1/me/tutor-requests?cursor=<uuid>` | Target Tutor inbox, bounded 20-item UUID pagination. Private goals/times appear only for currently eligible pending requests. Ineligible/closed entries retain safe status/offer metadata. |
| `POST /v1/me/tutor-requests/:id/decisions` | Strict `{decision: ACCEPT|DECLINE}`; records one immutable decision and returns request status, optional Connection ID/state and replay flag. |
| `GET /v1/me/connections?cursor=<uuid>` | Adult participant's bounded Connection list, with current availability/reason and safe offer metadata. No contacts. |
| `GET /v1/me/connections/:id` | Authorised active Connection detail and original enquiry; no email contacts. |
| `GET /v1/me/connections/:id/contacts` | Authorised peer account email plus precise ownership-verification/role label. Each successful read is audited without logging the email. |

Unrelated actors receive 404; unauthenticated actors receive 401. Current safety/access denial returns 403, and a stale offer, expired deadline or conflicting decision returns 409 as appropriate. A request ID is not a Connection/contact authority. Client-paid flags, recipient changes, grant IDs and decision timestamps are rejected.

Decisions require an active verified target Tutor role, current adult/Subject evidence, current beneficiary/Guardian authority, no blocks or Listing safety restriction, valid immutable submission coverage and a server time strictly before the response deadline. Acceptance additionally binds current Listing and profile revisions and exact Subject/mode to the submitted approved offer. Equality is expired. Repeating the recorded decision returns its original result even after its deadline; switching decisions conflicts and never rewrites it. Current contact access is always checked separately.

The original ACTIVE submission window remains the authority when its ordinary Access Pass end has elapsed; current entitlement revocation prevents an unconnected request from accepting. Established Connection access has its own grant: later acquisition-right revocation/full refund does not silently erase an established relationship, while explicit Connection-grant revocation and current safety restrictions deny reads. Ordinary Listing pause stops new acceptance and leaves established communication permission intact; a safety suspension stops both. Evidence/profile restrictions fail closed.

## Transactions and later integrations

Migration 011 adds unique-per-request Connections/decisions, unique participant roles, one conversation per Connection, one Connection grant and payer/Tutor history indexes. Acceptance and decline hold sorted participant account locks, then current beneficiary/Tutor/Listing locks, the authorising entitlement (future purchase coordination) lock and the request row transition. Concurrent acceptance/decline produces one decision; a conversation insertion failure rolls back the entire decision/Connection/grant. Retry returns committed current status read after lock acquisition, avoiding stale pre-lock metadata.

Inbox/list planning uses a read-only session-owner lookup only to collect bounded participant IDs for sorted locks. It does not authorize access; full session/account checks still run before projection. Request rows are refreshed after acquiring participant locks. No raw session, identity evidence, child account or private email is projected into an inbox/list/audit.

`ConnectionsService.withConnection` is the transaction/permission boundary for task 12 messaging/history commands. It rechecks adult membership, beneficiary consent, current Tutor qualification, blocks, Listing/Connection restrictions and the Connection grant before invoking trusted server code. Future safety/finance commands must use the same participant/purchase locks and revoke the relevant rights explicitly.

MATCHING coverage acceptance is recorded atomically with a **PENDING_GRANT** Connection, participants and conversation metadata. It creates no contact grant and does not start a 30-day Access Pass. Detail/contacts remain denied and the UI says activation is pending. Task 15 must attach verified activation/grants under the existing purchase coordination lock; there is no public activation or fixture-grant bypass here. ACTIVE test coverage can exercise the fully authorised Connection path without claiming real payment.

Durable messages/realtime transport are implemented in [task 12](chat.md); user block/report/staff Connection controls remain task 13, verified payment/activation tasks 14–15, scheduled request/refund lifecycle tasks 16–17 and notification delivery task 20. Production sender, merchant, Guardian/privacy/retention and deployment approvals remain release dependencies.
