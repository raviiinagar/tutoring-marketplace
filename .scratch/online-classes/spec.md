# Connection-scoped Google Meet Class Invitations

Status: ready-for-agent
Owner decision: 27 October 2026

The owner requested online teaching coordination and selected website scheduling with a Join class button opening Google Meet. This explicitly extends the production MVP's earlier scheduling exclusion for this narrow coordination feature. Attendance verification, embedded video, recordings, Calendar synchronization, automatic Meet creation, and platform collection of Tuition Fees remain outside this slice.

## Adopted defaults

- Only the Tutor in a currently authorized Connection can create, reschedule or cancel its Class Invitations. The connected adult Learner or Guardian can inspect them and join. Reuse current account, participant, safety, Guardian and Connection authorization on every operation. Access Pass expiry alone does not remove an existing authorized Connection.
- The Tutor provides a real existing Google Meet link. A helper opens Google's meeting creation page in a new tab; the application never invents a working room or claims OAuth integration. Automatic room creation requires separate Google OAuth client configuration and Tutor consent.
- Store title and meeting URL encrypted at rest. Date/time, duration, creator, status, revision and timestamps remain structured. Titles contain 5–120 characters; meetings run 15–240 minutes; future invitations are within one year. Form times are explicitly IST, stored in UTC.
- Join is available from 15 minutes before scheduled start until 15 minutes after scheduled end. Cancelled invitations cannot be joined. The backend rechecks current permission on Join and returns only a canonical HTTPS `meet.google.com/abc-defg-hij` URL. Google controls actual meeting admission; a previously copied external link cannot be revoked by the marketplace.
- Creating an invitation and retrying its request key is idempotent; revision checks prevent stale edits/cancellation. Only SCHEDULED and CANCELLED states are stored. A past scheduled time is not evidence that a class happened.
- Private meeting data participates in account export and erasure/retention handling. No meeting URL/title appears in public catalogue, operational logs, audit metadata or analytics.
- No new external paid service or Google credentials are needed for the supplied-link version. Validate with fictional Connections first and keep the existing temporary deployment deadline.

## Acceptance

Implement under issues/01-schedule-and-join.md. Completion requires API ownership/role/safety and validation tests, lifecycle/idempotency/privacy tests, accessible UI states, and hosted sandbox verification. Mark actual Google-call acceptance separately: a host-created working link and real Google admission cannot be inferred from a syntactically valid fixture URL.
