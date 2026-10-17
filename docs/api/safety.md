# Blocking, reports and safety investigations

Task 13 adds participant controls, private Trust case review, independent restrictions and a durable appeal entry. These are safety workflows; they do not grant an Access Pass, book lessons or process Tuition Fees.

## Participant workflow

Use **Safety and reports** from `/account`, or **Report or block** beside a Contact Request/Connection. Chat messages have **Report #n**, which preselects that message at `/safety/connection/<connectionId>?message=n`. Pending enquiries use `/safety/request/<requestId>`.

**Block account** records your block immediately and prevents new enquiries, acceptance, contact reads, chat history, sends and further realtime batches between those adults. It applies across their interactions. Each adult owns their own block: removing yours cannot remove the other's block or a staff restriction. Previously disclosed contacts or bytes already sent cannot be recalled. Block/unblock effects are independent of report review.

**Submit report** accepts a category, 10–2,000-character description and up to ten different message sequence numbers. Only selected messages are copied into frozen evidence; an initial-enquiry report also copies that specifically reported enquiry. There are no report attachment uploads. Reports remain available after blocking, Guardian consent withdrawal or a safety restriction using retained adult membership. This limited safety identity grants no contact or conversation-history permission.

Reports use a stable request key: identical retries return the original case, while changed details conflict. Unknown outcomes keep a retry payload in memory; drafts/retry state are cleared if the account changes. `/safety` shows recent report/decision metadata, blocks, active/lifted restriction notices and the actor's appeal status. It exposes no other adult's identity, private report description or frozen message evidence.

An affected participant can select **Appeal decision** after a recorded decision/restriction and submit 10–2,000 characters. One appeal per participant/case revision is persisted with an idempotent request key and **PENDING_REVIEW** status. It does not restore communication or acquisition rights. Task 22 links each appeal atomically to [Support](support.md), where Trust staff record explicit upheld, superseded or case-specific restriction-lift outcomes. Closing a report alone does not decide its appeal.

## Trust workflow

At `/staff`, choose **Investigate safety reports**, or open `/staff/safety`. Current TRUST scope, an active account session and session-bound MFA are mandatory. SUPPORT and FINANCE alone cannot inspect evidence or apply safety decisions. A reviewer cannot inspect or moderate a case involving their own account.

The recent-case queue contains metadata only. Select a case or enter a known case reference, provide a 10–240-character access purpose, and choose **Inspect safety case**. The reason is audited on each evidence read. Inspection exposes the report description, its frozen selected evidence, restriction history and specifically submitted appeal text. It never opens the rest of a conversation. Evidence clears on focus revalidation, permission failure and the known MFA expiry deadline.

Decisions require the current case revision and a **public decision reason**. Do not put reporter identity, child information or private evidence into that reason. The server derives targets from the case; a client cannot supply an arbitrary account/Listing/Connection ID.

| Operation | Effect |
| --- | --- |
| `RESTRICT_ACCOUNT` / `LIFT_ACCOUNT` | Restrict/lift this case's reported adult account restriction. Ordinary marketplace commands and communication are denied while any account restriction remains. Verified identity, safety decisions, blocking/reporting and appeal entry remain available. |
| `RESTRICT_LISTING` / `LIFT_LISTING` | Restrict/lift this case's teaching-offer restriction, including established communication tied to it. |
| `RESTRICT_CONNECTION` / `LIFT_CONNECTION` | Restrict/lift this case's particular Connection. It preserves the underlying grant/history and denies their use while restricted. |
| `RESOLVE` | Close an open report with a public outcome. Active restrictions remain until explicitly lifted. |
| `DISMISS` | Close an open report only after this case's restrictions have been explicitly lifted. |

Each restriction is an independent record. Lifting one does not clear another case or the earlier manual Listing safety flag. Restricting an account/Listing pauses its published supply and advances offer revisions; lifting never silently republishes it. The owner must resume an otherwise eligible approved offer. Closed cases cannot create new restrictions; explicit lifting remains available. Stale revisions and duplicate/inapplicable transitions return 409.

## HTTP interface

All routes use existing HttpOnly cookie sessions and no-store responses. Writes require allowed Origin and JSON, strict body fields and current authorization. Unknown objects/unrelated participants return 404; missing sessions 401; current scope, MFA or interaction restrictions 403. Input errors return 400. Report creation is limited to ten new reports per actor/hour; appeal entry to ten per actor/day. Successful retry replays do not consume another creation slot.

| Method/path under `/v1` | Behaviour |
| --- | --- |
| `GET /me/connections/:id/safety` | Participant-owned block metadata and safe offer context. |
| `POST /me/connections/:id/safety/block` | Strict `{blocked: boolean}`. Set/remove only the caller's block. |
| `POST /me/connections/:id/safety/reports` | Strict `{request_key, category, description, message_sequences}`; 201 `{case, replayed}`. Categories: HARASSMENT, FRAUD, CHILD_SAFETY, OTHER. |
| Same three paths under `/me/contact-requests/:id/safety` | Safety controls on an owned initial enquiry, including before acceptance. |
| `GET /me/safety` | Own recent cases, restriction notices, blocks and appeal statuses. Only self account ID is returned for client state scoping. |
| `POST /me/safety-cases/:id/appeals` | Strict `{request_key, description}`; 201 `{appeal, replayed}`. |
| `GET /staff/safety-cases` | TRUST/MFA metadata-only queue. |
| `POST /staff/safety-cases/:id/inspections` | Strict `{reason}`; audited case-specific evidence read. |
| `POST /staff/safety-cases/:id/actions` | Strict `{revision, operation, reason}`; revisioned decision and restriction history. |

Recent case/appeal views and the Trust queue are bounded at 50 entries; a known older reference can be inspected directly by authorized Trust staff. Complete support case browsing/adjudication remains task 22.

## Permissions, persistence and verification

Migration 014 adds encrypted reports, restrictions and encrypted appeal descriptions. Safety identity locks the actor and both participants in UUID order before sessions and mutable case/interaction state, matching Contact Request/Connection commands. New account sanctions never change password/session ownership or bypass disabled-account checks. Password recovery and later login do not lift restrictions. Basic `/me` identity remains available; every marketplace command still uses full authorization.

The same case restrictions are checked in ordinary authentication, current Learner/Tutor eligibility, Listing availability, public discovery/photos and Connection permission checks. A stale public search result cannot authorize a new restricted enquiry. Acceptance and restriction commands share participant locks: either acceptance commits first and subsequent communication is restricted, or restriction wins and acceptance cannot create usable rights. Existing manual restrictions and current Guardian/evidence checks still apply.

Account block changes and restriction writes issue transactional, payload-free chat authority notifications. Every emitted batch independently rechecks current authority while the shared locks are held; missed notifications also recover through task 12's guarded fallback. Audits record actor, case/target, action, revision and purpose/public reason, never report/appeal text or message bodies. No broad Support conversation endpoint exists.

Integration assertions use public HTTP/realtime interfaces against isolated PostgreSQL; browser coverage exercises blocking a live peer, selected evidence, Trust review, restriction, appeal entry and explicit lift. Run `npm test`, `npm run typecheck`, `npm run build` and `npm run test:browser`. The targeted complete journey is `npm run test:browser -- --grep "fictional Tutor evidence"`. On Windows, use `PLAYWRIGHT_CHANNEL=msedge` when Chromium is not installed.

After pulling, run migrations before restarting the API (`npm run db:migrate` with the database running, or `npm run setup:local` with the stack stopped). Positive paid Connections still use [isolated fictional grants](contact-requests.md#isolated-testing-before-payments); ordinary development and production cannot receive fixture coverage. Live capture/activation remains tasks 14–15. Public brand/merchant identity, SMTP, approved Guardian/privacy/retention procedures and deployment remain launch dependencies. Frozen safety evidence and appeal descriptions must be included in task 23's approved retention/export/deletion and encryption-key rotation/restore procedures; this task invents no retention duration or launch compliance claim.
