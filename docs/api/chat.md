# Durable private text chat

Task 12 adds adult participant chat at `/chat/<connectionId>`. Open **Your Connections → Open chat**, or use the link on a Connection's detail page. Messages discuss teaching arrangements; they do not book a lesson or collect Tuition Fees.

## Local testing

Run `npm run setup:local` with the local stack stopped after pulling migrations, then `npm run dev`. If the database is already running, use `npm run db:migrate` before restarting the API. Migration 013 adds encrypted messages and read positions without changing existing approvals or accounts.

An approved Tutor profile/Listing alone does not authorize chat. This currently requires task 11's active Connection and independent access grant. Use the [isolated fictional coverage workflow](contact-requests.md#isolated-testing-before-payments), or `npm run test:browser -- --grep "fictional Tutor evidence"` for the complete two-browser journey. Fixture grants are forbidden in the ordinary development database and production. Fictional MATCHING/PENDING_GRANT Connections cannot chat. [Verified paid acceptance](paid-access.md) now establishes ACTIVE Connections with separate grants; current permission checks apply equally to those paid conversations.

The UI supports text up to 2,000 characters, keyboard send (Shift + Enter for a newline), earlier history, live replies, read receipts and unread counts in the Connection list. Refresh Connections to update that list. Unknown send outcomes offer **Retry message** using the same message ID/text. Drafts and retry state remain in memory; refreshing discards unsent drafts. Message attachments are disabled.

## HTTP interface

All endpoints require an authoritative HttpOnly account session and return `Cache-Control: no-store`. Writes require an allowed Origin and JSON. Unknown fields, forged sender information, attachments and malformed cursors are rejected.

| Method and path under `/v1/me/connections/:id` | Behaviour |
| --- | --- |
| `POST /messages` | Strict `{client_message_id: UUID, text: string}`. Returns 201 `{message, replayed}` after commit. |
| `GET /messages` | Latest 50 messages by default, returned in ascending sequence order. Optional `limit` 1–100 and either `after` or `before` nonnegative safe integer. |
| `POST /read-position` | Strict `{sequence: number}`. Advances the actor's position monotonically; a position beyond recorded history returns 400. |
| `GET /events?after=<sequence>` | Cookie-authorized server-sent events. `Last-Event-ID` takes precedence over the query cursor. No query tokens. |

History includes safe offer/participant-role context, `last_sequence`, `next_after`, `has_more`, `has_older`, `read_sequence`, `peer_read_sequence` and `unread_count`. Each message contains sequence, client ID, text, sender role, whether it belongs to the viewer, and server creation time. It does not expose account IDs, private email contacts, evidence or child profile information. A Guardian writes from their own adult account.

Forward recovery follows `next_after` until `has_more` is false. `last_sequence` is the conversation's latest recorded sequence, **not** a safe recovery cursor until those messages have been delivered. Older-history queries use `before=<earliest displayed sequence>`. Merely fetching history does not mark it read. Unread counts exclude your own messages. The UI marks through rendered, contiguous history only while visible and at the latest messages; peer receipts are positions reported by that adult's client, not proof of learning or lesson attendance.

## Durability, permissions and retries

Submission holds the existing `ConnectionsService.withConnection` transaction and conversation row lock. The sequence increment, encrypted message, deduplication key and text-free audit event commit together before the HTTP acknowledgement. Unique `(conversation, sender, client ID)` retries return the original message; reusing that key for different normalized text returns 409. Concurrent sends share one increasing conversation sequence. There is a 60-new-message-per-minute fixed-window actor limit; replaying an existing message does not consume it. Restarts preserve acknowledged messages and read positions.

Every history/send/read command and emitted realtime batch rechecks current account/session, adult membership, Guardian consent where applicable, Tutor evidence, blocks, Listing/Connection safety restrictions and access grant. Unrelated participants, including staff without membership, cannot read chat. Ordinary offer pause or pass expiry preserves an established authorized relationship; current safety/grant restrictions deny it. Production still rejects all fixture coverage. [Task 13](safety.md) implements user-facing blocks/reports and scoped staff Connection investigations.

Realtime delivery uses SSE for server-to-browser updates and HTTP for writes. PostgreSQL `LISTEN/NOTIFY` carries only a Connection UUID or an empty authority-change wakeup; it never carries message text. Durable history remains authoritative. Multiple API instances can listen to the same database. A two-second guarded fallback checks expiry/revocation and recovers missed wakeups; the listener reconnects after interruptions. `state` events carry bounded history/read metadata and an ID equal to the delivered cursor. Permission loss emits `access-revoked`, ends the subscription and clears chat/draft data in the UI. A transient failure emits `reconnect`; the UI fetches missing HTTP history and reconnects with bounded backoff.

Frames are enqueued synchronously while current authority locks are held. A later restriction cannot recall bytes already sent. Connections cap at four concurrent streams per account and 200 per API process; slow subscribers pause on socket backpressure and close after ten seconds without drain. Shutdown/disconnect cleans listeners, intervals and sockets. These are implementation limits, not measured production capacity; task 27 owns load/accessibility acceptance.

## Deployment and remaining work

Serve API/UI under one HTTPS origin, forward cookies, and disable reverse-proxy buffering/caching for `/events`. The endpoint sets `X-Accel-Buffering: no`; configure proxy idle/read timeouts above the 15-second heartbeat. PostgreSQL must allow a dedicated session connection for LISTEN, including when the query pool uses transaction pooling. A missed notification cannot authorize access or lose a committed message.

Ciphertext uses the shared `AUTH_SECRET`; preserve it through restore and include chat in any reviewed re-encryption/key-rotation procedure. Do not send message bodies into logs, analytics, notifications or monitoring payloads. No automatic retention duration is invented: task 23 must implement the approved retention, export and deletion policy before launch. Task 20 owns notifications, task 26 deployment/restore proof and task 27 realistic load/accessibility checks. Live payment, SMTP, Guardian/privacy policy and merchant approvals remain release dependencies.

Protocol references: [SSE stream/reconnect format](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [PostgreSQL transactional NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html).
