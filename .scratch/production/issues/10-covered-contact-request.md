# 10: Send and inspect a covered Contact Request

Status: ready-for-agent
Resolution: completed
Type: task
Blocked by: 04 — Manage adult and guardian-controlled Learner profiles; 08 — Find eligible Tutors and inspect public offers

**What to build:** A Learner or Guardian submits a tutoring enquiry, sees its status/deadline and shares an existing qualifying entitlement across up to five pending requests.

## Acceptance criteria

- [x] Submission checks beneficiary authority, active Tutor/Listing, subject/mode, current blocks and qualifying access.
- [x] Initial text is validated/minimised, includes learning requirements and preferred times, and is not a pre-connection chat channel.
- [x] Five pending requests per payer is enforced atomically; duplicate submission returns its existing result.
- [x] The request records authorising entitlement/policy and immutable expiry; access cannot be supplied by a client-controlled flag.
- [x] Tests use isolated nonproduction fixture grants; production has no fixture-grant bypass and rejects missing access.

## Verification evidence

Implemented on 12 October 2026:

- Available offer detail contains a responsive enquiry form. Anonymous users sign in; account holders choose a usable adult/Guardian-controlled Learner and enter bounded learning goals and preferred times. Without qualifying server coverage the form is disabled and the API rejects submission. `/requests` and the account link expose only the payer's private history, current effective status and recorded response deadline. Pending enquiries do not establish lessons, chat or contact disclosure.
- Migration 010 adds immutable `contact-v1` request policy (five pending requests, 72-hour lifetime), authoritative test coverage records, directed account-block foundation, encrypted Contact Requests and durable retry-key mappings. Public discovery includes Listing revision to bind submission to the exact inspected offer. Client-supplied payer/Tutor/access/payment/policy/deadline fields are rejected.
- Submission checks active verified identity and Learner role, owned/currently usable beneficiary, current Guardian approval/consent, current qualified/available Listing and exact Subject/mode/revision, self-contact exclusion, blocks in either direction and qualifying coverage inside one transaction. Participant user rows are locked in UUID order before sessions/profiles/Listings, preventing opposing dual-role requests from taking opposite user-lock orders. Future block commands must use the same participant locks before mutations.
- Payer serialization enforces five pending requests across all beneficiaries, offers and coverage records. Six simultaneous valid enquiries produce five pending requests and one limit rejection. Same-key retries return the original result; reused keys with changed payload conflict. Identical pending beneficiary/Listing enquiries return the existing request and persist any alternate retry key, preserving that result after expiry. No duplicate notification or billing effect is introduced.
- Matching coverage expires strictly before its capture-based matching deadline; expiry is the minimum of that deadline and submission plus 72 hours. Active coverage requires `starts_at <= now < ends_at` at submission and does not shorten already covered request expiry when access later ends. Immutable coverage/offer/policy snapshots and a database update trigger prevent deadline or submission rewriting. Historical pending status becomes EXPIRED at equality; subsequent submission retires elapsed rows before counting slots. Scheduled request lifecycle/refund work remains tasks 16–17.
- Initial text permits 20–500-character learning requirements and 5–160-character preferred times; obvious email/phone/link/social-handle sharing and control characters are rejected. Enquiry text is encrypted at rest and excluded from audit metadata. Owner responses exclude raw account/contact IDs and entitlement details. Child consent withdrawal hides alias and message content even on retry; historical encrypted records remain subject to approved task-23 retention/deletion.
- Successful pre-payment coverage is explicitly FIXTURE only, confined by the CLI/helper to loopback `*_test` databases and verified fictional `@example.test` identities. The helper is outside the API build; no HTTP grant route exists. Production denies fixture coverage, replay and history, even if test records are accidentally present. No production coverage writer or checkout is claimed: verified capture/commercial policy/activation integration must arrive in tasks 14–15. The ordinary development database cannot receive helper grants.
- `npm test` passed all 70 PostgreSQL/API tests and nine UI tests together. Eight new API scenarios cover missing/forged access, authority/role/self/foreign IDs, invalid text and stale/exact offers, encrypted/immutable snapshots, same/alternate-key retry races and delayed replay, atomic pending limits and equality, matching/active deadlines, blocks/revocation/expired evidence, Guardian withdrawal, production isolation and opposing dual-role lock ordering.
- Initial new fixtures attempted to create adult Learner profiles while retaining Tutor-only roles; fixtures now explicitly enable both roles before those checks. The fixture CLI was made asynchronous without top-level await to support the root package's module format. Corrected full regression passed.
- All eight browser journeys have passing evidence: six unchanged journeys passed in the full run; the corrected catalogue and expanded Tutor/request journey then passed together in a fresh isolated stack (3.5 minutes). The first catalogue failure was a five-second cold-page assertion; trace showed successful catalogue responses starting after that assertion, so initial catalogue loading now allows 15 seconds. The request journey exposed unstable implicit textarea labels with prefilled content; explicit accessible labels fixed the exact-label interaction. The rerun verified mobile no-access disabling, isolated grant, successful enquiry, pending history/deadline after reload, no horizontal overflow, and existing Tutor approval/safety/revocation flows. A 390px private request screenshot was inspected.
- Root typecheck/build passed again after final labels/copy. Migration 010 was applied to the existing development database and the verified stack restarted on 3000/4000/5433; isolated browser fixture ports stopped. Local secrets, database/mail, screenshots and diagnostic traces remain ignored.

API contract, future integration boundaries and manual isolated-testing commands: [Contact Request guide](../../../docs/api/contact-requests.md). Next numbered slice: task 11 Tutor decisions and authorised Connections. Live payments/contact release, real SMTP, approved Guardian/privacy/retention procedures and deployment remain explicit later dependencies.

## Comments


