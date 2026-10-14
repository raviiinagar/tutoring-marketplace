# 12: Send durable text messages and recover after reconnect

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 11 — Accept a Contact Request and establish an authorised Connection

**What to build:** Connected adult participants exchange text messages, view unread status and recover acknowledged history after retry or disconnect.

## Acceptance criteria

- [x] Messages persist before acknowledgement with client deduplication and per-conversation sequence ordering.
- [x] HTTP history and realtime subscription are participant-scoped; changing IDs reveals no unrelated data.
- [x] Reconnect fetches missing sequences and read positions advance monotonically.
- [x] Retries return the existing message; websocket/provider interruption does not lose acknowledged messages.
- [x] Browser/integration tests prove durable history, unread state, reconnect and private access; chat uploads remain disabled.

## Verification evidence

Implemented durable, encrypted text messages through the existing current Connection transaction/permission boundary. A per-conversation lock assigns ordered sequences; sender-scoped client IDs deduplicate simultaneous retries and conflict on changed text. Persistence and the text-free audit event commit before acknowledgement. No message attachment endpoint exists.

Added bounded latest/older/forward HTTP history, durable monotonic read positions, peer receipts and Connection-list unread counts. SSE subscriptions use cookie sessions and reauthorize each emitted batch while participant/authority locks are held. Transactional PostgreSQL notifications contain only wakeups; guarded fallback/reconnect recovers committed history after missed notifications or disconnect. Streams have per-account/process caps, backpressure limits and shutdown cleanup. Unrelated accounts/staff and pending access cannot read chat; session or current safety revocation denies subsequent operations and closes live delivery.

The Lovable UI adds `/chat/<connectionId>` and Open chat links, a mobile viewport layout, text composer, safe unknown-outcome retry, ordered deduplication, earlier-history loading and HTTP recovery before reconnect. Read positions advance only through rendered contiguous history while visible at the latest messages. Revoked access clears message/draft state. Contact email disclosure remains a separate audited action.

Verification on 14 October 2026:

- TDD evidence in ignored `.local/task12-red-01.log` through `red-06.log` and corresponding green logs: restart durability; duplicate races; unread/read positions; bounded catchup; live reconnect/revocation; private text-only, rate-limited submissions. All six chat API scenarios passed together in `task12-chat-all.log` and in the full regression run.
- `npm test`: **92 API scenarios and 10 UI tests passed** (`.local/task12-full-tests.log`). Real isolated PostgreSQL, public authenticated HTTP and actual stream delivery are the feature assertion seams; external mail/scan/payment fixtures are fictional setup dependencies.
- Browser coverage: the full eight-journey run passed seven, with an ambiguous pre-existing staff `role=status` locator failing. Scoped that assertion to staff content; its targeted rerun passed. The expanded Tutor/chat journey passed on the final targeted rerun (`.local/task12-browser-chat-final.log`), covering both adults, live reply, upstream-committed/lost HTTP acknowledgement and safe retry, refresh durability, offline recovery, unread count, mobile overflow and live safety revocation. Thus every one of the eight journeys has passing evidence after corrections.
- The final rerun exposed asynchronous teaching-offer initialization clearing typed title/description. A deliberately delayed public metadata response reproduced the failure (`task12-draft-red.log`). Initialization now changes only untouched teaching defaults and preserves typed draft content; the same browser test passed.
- Root typecheck passed. Final build evidence is recorded in the completion comment below. Migration 013 was applied successfully to the existing local database with `npm run db:migrate`, preserving accounts/approvals; the running local API health returned 200 and the private chat route returned 401 without a session.
- Inspected the mobile chat screenshot; heading and composer remain visible with internal message scrolling. No pilot capacity/accessibility claim is inferred from functional coverage; task 27 owns measurement.

See [chat interface, setup and deployment guide](../../../docs/api/chat.md). Production still refuses fixture Connection grants; real capture/activation remains tasks 14-15. Task 13 adds block/report investigations, task 20 notifications, task 23 approved retention/export/deletion and tasks 26-27 deployment/restore/load proof. Live SMTP, merchant credentials and Guardian/privacy approvals remain launch dependencies. Changing the encryption secret requires a chat re-encryption/restore plan.

## Comments

Implementation started after the owner's instruction to continue and use suitable skills. Applying the TDD skill at the already accepted seams: authenticated public HTTP commands/history and realtime delivery against real PostgreSQL, plus browser-visible chat/reconnect journeys. These seams are confirmed by the production specification's Testing Decisions and standing delegated defaults; no new testing approval is needed. External mail/scan/payment fixtures remain isolated nonproduction dependencies.

Planned interfaces: Connection-scoped message submission with a stable client ID, bounded ordered history, monotonic read position and cookie-authorized realtime subscription. All use the existing current Connection permission boundary. A dedicated private chat page preserves draft/retry state during reconnect; message attachments remain out of scope. First tracer: an acknowledged message is retrievable by the other participant after API restart.



Completion: final `npm run build`, `npm run typecheck` and `git diff --check` passed after the draft-preservation correction. No new dependencies or external credentials were introduced. The next dependency-ready numbered ticket is 13.
