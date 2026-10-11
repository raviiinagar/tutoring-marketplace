# 12: Send durable text messages and recover after reconnect

Status: ready-for-agent
Type: task
Blocked by: 11 — Accept a Contact Request and establish an authorised Connection

**What to build:** Connected adult participants exchange text messages, view unread status and recover acknowledged history after retry or disconnect.

## Acceptance criteria

- [ ] Messages persist before acknowledgement with client deduplication and per-conversation sequence ordering.
- [ ] HTTP history and realtime subscription are participant-scoped; changing IDs reveals no unrelated data.
- [ ] Reconnect fetches missing sequences and read positions advance monotonically.
- [ ] Retries return the existing message; websocket/provider interruption does not lose acknowledged messages.
- [ ] Browser/integration tests prove durable history, unread state, reconnect and private access; chat uploads remain disabled.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


