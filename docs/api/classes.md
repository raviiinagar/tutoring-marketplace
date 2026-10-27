# Private Google Meet Class Invitations

This feature extends the contact marketplace with coordination inside an existing authorized Connection. A Class Invitation stores a planned time and a Tutor-supplied Google Meet URL. It does not establish attendance, completed teaching, Google admission or payment of Tuition Fees.

## Scope and authority

Every read/write/Join enters `ConnectionsService.withConnection`, preserving verified account, adult participant/Guardian authority, current safety/block restrictions and the original Connection grant. An expired Access Pass does not by itself disable an established Connection. Staff have no general Class Invitation read endpoint.

Only the Connection's Tutor creates, edits or cancels classes. The adult Learner or Guardian sees schedule/status and can use the authorized Join action. No Google login is added to marketplace identity. The supplied-link version requires no Google OAuth client. Google's Meet REST API supports automatic space creation through user OAuth, which remains a separate integration: https://developers.google.com/workspace/meet/api/guides/authenticate-authorize .

## API

All paths start with `/v1/me/connections/:connection/classes`. Authenticated JSON mutations require the existing exact Origin and session protections.

| Method/path | Body/result |
| --- | --- |
| GET `/` | `{viewer_role,server_time,classes}`; each class has status/revision, UTC start/end, duration and authoritative `can_join` |
| POST `/` | `{request_key,title,meet_url,starts_at,duration_minutes}`; returns 201 `{class,replayed}` |
| POST `/:id` | `{revision,title,meet_url,starts_at,duration_minutes}`; returns the updated class |
| POST `/:id/cancellation` | `{revision}`; returns the cancelled class |
| POST `/:id/join` | `{}`; rechecks Connection, class and joining window, then returns `{url}` |

Titles contain 5–120 characters. Duration is 15–240 minutes. Start must be in the future within 366 days. UTC/offset ISO timestamps are canonicalized. The UI explicitly accepts and displays IST.

Meet URLs must use HTTPS, exactly `meet.google.com`, no credentials or custom port, and a standard `abc-defg-hij` room path. Query/fragment/account-selection parameters are removed. The application never manufactures a working meeting room from a fixture code.

Create retries with the same request key and normalized payload return the same Class Invitation; changing that payload conflicts. Revision checks reject stale edits/cancellation. Rescheduling a class whose original start time has arrived is denied; schedule another invitation instead. At most 50 future scheduled invitations exist per Connection; the read lists the latest 200 invitations.

Join is available 15 minutes before start through 15 minutes after scheduled end. CANCELLED classes cannot release a link. The Learner list never contains the raw Meet URL; the Tutor can retrieve it for editing. Join rechecks all permissions before returning it. The resulting external room remains subject to Google's host/admission controls; the marketplace cannot invalidate an already copied external URL.

Stored states are SCHEDULED and CANCELLED. A past time is displayed as a passed scheduled time, never proof of attendance. The `CLASS_MEETING_LINK_RELEASED` audit event means only the website authorized opening a link.

## Privacy and validation evidence

Migration 029 stores encrypted title/Meet URL with immutable create retry hash and structured timing/status/revision metadata. Audit events contain identifiers only, not title/link. No field is exposed in public discovery.

Account exports include invitations authored by that account. A receiving account gets its schedule metadata without the other participant's meeting URL. Account erasure and scoped child-consent withdrawal cancel related invitations and overwrite the encrypted meeting content. Recovery inventories and erasure tolerate older archives without the additive table before migrations run.

Five real PostgreSQL/public API scenarios cover Tutor/participant boundaries, encrypted storage, idempotency, revision/Join lifecycle, hostile URL/time/overposting validation, safety revocation, export and actual privacy-worker erasure. UI tests cover IST conversion, saved status, Learner controls, Join authorization/popup fallback and cancellation. Actual host-created Google meeting admission remains a separate human verification step.
