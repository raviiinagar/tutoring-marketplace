# Production MVP: India tutoring contact marketplace

Status: ready-for-agent
Owner: VEER
Decision date: 10 October 2026

The owner instructed the design process to use recommended defaults for subsequent questions. The decisions below therefore include confirmed answers and explicitly identified adopted defaults. This specification supersedes the older narrow catalogue assumptions. Business naming, legal merchant identity, live credentials and external approvals remain release dependencies, not invented facts.

## Problem Statement

Learners across India need to find suitable, responsive tutors across school, entrance examination, higher education, career and other learning domains. Tutors need relevant enquiries and a trustworthy way to describe their offers. The owner needs a production application that charges for useful tutor connections, protects private information, accounts for money correctly, and supports failed matches, refunds and safety cases.

## Solution

Build an online-first responsive web marketplace covering eight learning domains. Browsing is free; a ₹599 Access Pass covers 30 days from first eligible tutor acceptance with confirmed payment. A payer can contact multiple tutors under one pass, with at most five pending Contact Requests. Tuition Fees are settled directly with Tutors.

Guardian-controlled access serves child Learners. Adult Tutors undergo staff review before publication. The product includes approved Listings, structured discovery, hosted payment, requests, authorised Connections, durable text chat, moderated Reviews, self-service support/privacy workflows and an owner-operated staff console.

## User Stories

1. As a Learner, I want to browse all eight Learning Domains, so that I can find tutoring for my goal.
2. As a Learner, I want subject, level, curriculum, exam, teaching-language and price filters, so that results match my actual requirement.
3. As a Learner, I want accurate availability and optional notification signup for an empty category, so that I do not pay against unavailable supply.
4. As a Learner, I want clear hourly rates, trial terms and precise verification labels, so that I can compare Tutors.
5. As an account holder, I want verified sign-in and secure recovery, so that my account remains under my control.
6. As an account holder, I want Learner and Tutor roles on the same identity, so that I do not need duplicate accounts.
7. As an account holder, I want to revoke sessions, so that I can respond to a lost or compromised device.
8. As a Guardian, I want to manage a child Learner's profile and communication, so that the child does not operate an independent account.
9. As a Guardian, I want a clear verification and consent process, so that child-data processing and my authority are recorded.
10. As a Tutor, I want to submit identity and relevant qualification/experience evidence privately, so that staff can review my teaching claims.
11. As a Tutor, I want accurate subject/level/curriculum/exam combinations on my Listings, so that I receive relevant enquiries.
12. As a Tutor, I want review feedback and publication status, so that I can correct an unapproved Listing.
13. As a Tutor, I want to edit, pause and resume approved offers, so that availability stays accurate.
14. As a Learner, I want an eligible available Tutor before checkout, so that my request has a real recipient.
15. As a payer, I want the platform charge shown separately from Tuition Fees, so that I understand what I am buying.
16. As a payer, I want verified payment and visible pending/failure states, so that a browser redirect cannot misrepresent my purchase.
17. As a payer, I want multiple requests to share a purchase, so that several acceptances do not create several charges.
18. As a payer, I want recorded request and purchase deadlines, so that I know when a Tutor can respond and when a refund is due.
19. As a Tutor, I want to accept or decline my own pending requests, so that I control which enquiries I take.
20. As a payer, I want my 30-day access period fixed at activation, so that later acceptances do not change it.
21. As a payer, I want retries and simultaneous acceptances handled safely, so that I am not charged twice.
22. As a payer, I want existing authorised Connections after pass expiry, so that established communication continues.
23. As a payer, I want a request covered at submission to remain eligible until its recorded expiry, so that ordinary pass expiry does not require a second charge.
24. As a payer, I want explicit manual repurchase, so that there are no automatic recurring charges.
25. As a payer, I want to cancel before activation and receive a full platform-fee refund, so that an unactivated purchase is reversible.
26. As a payer, I want an automatic full refund initiated if no eligible acceptance arrives within 72 hours of confirmed capture, so that unmatched purchases are resolved.
27. As a payer, I want an individual refund review after contact release, so that duplicate-charge, fraud and service-failure issues can be addressed.
28. As a payer, I want truthful refund progress, so that initiation is not presented as money received in my bank.
29. As a payer, I want receipts and payment history, so that charges, refunds and invoice details are inspectable.
30. As a connected participant, I want authorised text messaging, so that I can discuss tutoring privately.
31. As a connected participant, I want durable messages, unread status and reconnect recovery, so that acknowledged communication is not lost.
32. As a participant, I want to block another account and report a problem, so that unsafe communication can stop and be investigated.
33. As a connected Learner or Guardian, I want to submit a Review after seven days and attest to actual interaction, so that feedback has declared evidence.
34. As a Tutor, I want policy-compliant positive and negative Reviews treated consistently, so that reputation is credible.
35. As a participant, I want a review/moderation appeal, so that an incorrect decision can be examined.
36. As an account holder, I want case-based support with status, so that I can track an unresolved issue.
37. As an account holder, I want service notifications and preferences, so that I can respond to requests and messages.
38. As an availability subscriber, I want an optional signup and unsubscribe, so that availability alerts remain under my control.
39. As an account holder, I want verified data export, deletion and consent withdrawal workflows, so that privacy requests have an outcome.
40. As a staff operator, I want MFA and scoped permissions, so that privileged actions and evidence access are controlled.
41. As a finance operator, I want payment/refund/settlement reconciliation, so that platform records agree with provider and bank facts.
42. As a finance operator, I want refunds and chargebacks reconciled together, so that the customer is not reversed beyond the captured amount.
43. As a trust operator, I want to restrict Listings and Connections with a reason, so that safety decisions take effect immediately.
44. As an owner, I want redacted audit records, so that financial and safety decisions are accountable without exposing secrets.
45. As an owner, I want manageable catalogue terms and aliases, so that all domains share consistent discovery.
46. As an owner, I want useful rendered public pages and metadata, so that actual tutor supply is discoverable.
47. As an owner, I want search, request, connection and refund outcomes by domain, so that national demand claims can be tested against delivered value.
48. As an owner, I want critical billing/security/backup alerts outside support hours, so that serious failures are visible.
49. As an owner, I want independent backups and a measured restore, so that the application can recover from failure.
50. As an owner, I want isolated environments and compatible deploy/rollback behaviour, so that releases do not corrupt financial history.
51. As an operator, I want durable jobs, failed-job visibility and audited replay, so that an external outage does not lose committed work.
52. As an owner, I want immutable commercial policy versions, so that edits do not change previous commitments.
53. As a Learner, I want accessible core flows on mobile, so that I can use discovery, checkout and communication on common devices.
54. As a privacy operator, I want approved retention classes and deletion propagation, so that private evidence and other personal data do not persist without a purpose.

## Implementation Decisions

### Product and catalogue

- Online tutoring across India, INR, English interface, Tutor-declared Teaching Languages. In-person discovery follows later.
- Eight initial Learning Domains: school education; entrance examinations; higher education; competitive examinations; professional qualifications; career skills; languages/communication; arts/other learning.
- Include JEE Main/Advanced, NEET and CUET alongside school curricula and other approved tracks. Catalogue support is separate from available supply and demonstrated growth.
- Model offer combinations, not independent unqualified profile tags: a Tutor teaching CBSE class 10 Physics and JEE Mathematics must not match a JEE Physics search unless that offer is approved.
- Keep Curriculum, Learner Level, Subject, Exam Track, Teaching Language and learning goal separate. A JEE/NEET repeater need not be enrolled in class 12.
- Empty categories show honest availability and optional consented notification signup. Paid requests require an eligible recipient; do not fabricate Tutors, reviews or availability.
- Public Tutor pages show approximate locality where useful, rate unit and trial terms, but never private contacts, identity evidence or child information.
- Use a neutral development placeholder until the owner supplies a public brand. VEER is the owner, not the brand.

### Identity, guardians and evidence

- One account may hold Learner and Tutor roles; staff permissions are granted separately and cannot be self-assigned.
- Default sign-in: verified email/password with secure reset and session revocation. Verify phone ownership before releasing a phone contact. Staff use mandatory MFA and narrowly scoped roles, even while one person holds several operational responsibilities.
- Tutors must be adults aged 18 or older. Staff review identity and relevant qualifications/experience before publishing each teaching claim; public labels state exactly what was reviewed and can be revoked.
- Private evidence uses authorised uploads, type/size limits, malware scanning, short-lived authorised downloads and reviewer auditing. Unscanned/rejected uploads are never served as accepted evidence.
- Child Learners use Guardian-controlled profiles and adult participants for payment/chat. Collect only an alias, necessary age band and learning requirements; do not request child identity documents as a default.
- Implement a guardian-verification interface and staff workflow that records identifiable-adult verification, parental/lawful authority evidence, reviewer, decision and accepted consent version. The approved method and evidence checklist must be confirmed before live child-data collection. A checkbox or successful payment alone does not establish sufficient verification.
- Do not target advertising to child profiles or send child-message/document payloads into general analytics. Consent withdrawal and deletion are tracked operations.

### Requests, payment and access

- Adopt Razorpay Standard hosted Checkout for one-time payments, subject to approved account capabilities. Never store raw card/CVV data.
- Proposed ₹599 is the customer-visible total; applicable tax breakdown, merchant details and invoice format require finance confirmation before live checkout. Server-side immutable plan versions determine amounts in integer paise.
- Create a server Order against a stable purchase cycle and use immediate automatic capture. Verify provider identity, amount, currency and captured state server-side; a browser response never authorises access.
- Persist provider capture time. The first-purchase matching deadline is capture time plus 72 hours, not webhook receipt time. If confirmation arrives after that deadline without an eligible request/acceptance, reconcile money and initiate refund rather than silently extend the promised deadline.
- Submit first-purchase Contact Requests only after confirmed capture. A payer can have at most five pending requests. Each expires after 72 hours from submission, capped by the first-purchase matching deadline when applicable.
- Tutor actions require ownership and current eligibility. Acceptance is valid only strictly before the recorded deadline; equality is expired. Store decisions synchronously, under the same purchase lock used by cancellation/refund coordination, rather than letting a delayed notification determine whether acceptance occurred.
- First eligible acceptance plus capture activates one entitlement for 30 days. Fix start/end once, using server instants. Parallel acceptances share the cycle and can establish several eligible Connections without extra charges.
- If an accepted Tutor is restricted before contact release, disclose no contact; seek an explicitly chosen alternative until the existing deadline, then refund if no eligible match exists.
- Requests submitted under active access retain that submission entitlement until request expiry; ordinary period expiry does not charge again. Revocation, full reversal, blocking or suspension can prevent an unconnected request from completing.
- Full cancellation before activation ends related pending requests and starts one full-refund operation. Refund eligibility and activation use deterministic locked transitions; whichever valid transition commits first determines whether a connection was established.
- No-match expiry initiates a full platform-fee refund. Failed/unknown initiation remains visible and retriable; keep a funded refund reserve and escalate insufficient balance.
- Post-connection refund requests are case-reviewed with reason/audit. An approved full refund revokes future acquisition rights and cancels outstanding unconnected requests while preserving established conversation access unless a safety restriction applies. Partial adjustments do not silently change access; a staff decision explicitly records the outcome.
- Preserve captured money history. Refunds and chargebacks are distinct provider facts; cumulative completed/reserved reversal must not create duplicate customer recovery. Unexpected excess capture is recorded and routed to a refund liability.
- Manual repurchase only. A pending/unknown payment attempt blocks replacement checkout until reconciled; retries reuse stable provider/business identifiers.
- Existing authorised Connections survive ordinary pass expiry, subject to current blocks/sanctions. Suggestions never charge or reveal contacts; the Learner chooses alternatives.

### Messaging, reviews and support

- Text-only chat initially; verification uploads and profile images remain supported. Persist before acknowledgement; unique client message identifiers and per-conversation sequence ordering support retry and reconnect history.
- Check participant and current safety permission on HTTP history, contact access and realtime subscriptions. Revocation disconnects relevant sessions and prevents subsequent reads.
- Initial request text contains learning goals and preferred times, not a pre-connection chat channel. Validate/minimise sensitive free text, reject obvious contact-sharing patterns and provide report controls; do not promise perfect automatic detection of deliberately encoded text.
- Connection-linked Reviews require seven days from Connection establishment and an actual-interaction attestation. Reject self/duplicate/ineligible reviews; staff moderate before publication and publish positive/negative compliant feedback consistently. Connection evidence never implies verified attendance.
- Scope staff case access by purpose, record reasons and give review/safety/refund appeals a support case. Immediate user blocking takes effect before staff review.
- VEER owns operations; support coverage is Monday–Saturday, 10 am–6 pm IST. Automated processing runs continuously. Critical security/billing/recovery alerts go to the owner outside those hours; human support is not advertised as 24/7.
- Start with transactional email; add configured SMS for selected critical events within the approved budget and provider/template requirements. Separate service notices, availability subscriptions and marketing consent.

### Architecture and operations

- TypeScript UI generated with Lovable, NestJS modular backend and separate worker processes; PostgreSQL is authoritative for requests, money, access, messages, inbox/outbox, audit and durable job state. The Next.js account screens are a temporary integration harness until the Lovable export is integrated; [ADR-0009](../../docs/adr/0009-lovable-ui-and-authoritative-api.md) updates ADR-0004's web choice at the owner's request on 11 October 2026.
- Domain modules own writes and expose business commands. Avoid independent microservices initially; external calls occur outside database transactions.
- Use a transactional outbox, validated durable webhook inbox, business-key uniqueness, leased durable operations and idempotent consumers. Assume at-least-once delivery; claim one business effect, not universal exactly-once transport.
- Raw-body webhook signature verification precedes durable acknowledgement. Validate merchant/order/payment amount and currency; deduplicate event identifiers and reconcile out-of-order/unknown facts with provider fetches.
- Reconcile payment/refund uncertainty promptly, plus daily settlements/bank receipts. Disabled webhook delivery, backlog, unknown payments, funded-but-unactivated purchases and refund reserve failures produce operator alerts.
- Pilot hosting default: AWS Lightsail Mumbai application VM and encrypted managed PostgreSQL, with public images separated from private evidence and independent encrypted recovery exports. Published fixed baseline is $57/month before extras/tax; the ₹10,000 ceiling must be checked against actual billing, usage, tax and backup location before provisioning.
- The small-pilot layout has single-application and single-database outage risks. Do not claim the earlier 99.9%/zero-AZ-loss objectives without a topology and measured evidence supporting them. If budget and mandatory reliability conflict, resolve by improving the deployment or limiting rollout, not silently weakening release evidence.
- Recovery objectives adopted for pilot planning: independent regional-export data-loss window at most 24 hours and complete recovery within 4 hours, subject to measured drills. Same-region managed recovery uses available point-in-time backups; five-minute restore selection is not a guarantee of regional RPO. Schedule exports more frequently than the maximum loss window, alert on backup age and test recovery of database, assets and deployment configuration together.
- Approve recovery storage location and costs before provisioning. Provider database snapshots alone do not constitute cross-region recovery. After restore, reapply deletion tombstones and reconcile external payment/refund facts before resuming checkout.
- Separate development, staging and production databases, secrets, payment modes and assets. Test access grants/mock payments are confined to isolated nonproduction environments.
- Use HTTPS, private DB connections, secrets management, secure sessions, CSRF protection where applicable, rate limits and redacted structured logs. Staff privilege changes, finance/safety actions and evidence reads are audited.
- Staging deploy, compatible migrations and application rollback must be demonstrated. Build artefacts outside the production VM; rollback does not restore an old financial database.
- Collect service/funnel metrics from durable server facts. Do not report direct Tuition Fees as platform revenue or infer attendance from a Connection.
- Data retention is configurable by approved class/purpose; live collection requires an approved retention schedule and documented financial/evidence exceptions. Export/deletion verifies the actor, propagates through public/cache/analytics systems and is tracked to completion.

## Testing Decisions

- Prefer public REST/application behaviour against a real PostgreSQL test database as the principal integration seam. Use provider/mail/scan adapters only for external dependencies; separately test provider sandbox contracts. There is no existing code/test prior art.
- Use browser tests for mobile discovery, Tutor approval, paid request, Connection/chat, Review, support and privacy journeys. Assert user-visible states and data isolation, not private function call sequences.
- Test two Tutor acceptances, five pending requests, concurrent cancellation/acceptance, deadline equality, late capture, pass-expiry acceptance and full-refund revocation of unconnected requests.
- Replay duplicate/out-of-order webhooks, lose browser callbacks, crash after provider success, delay events, retry unknown refunds and overlap refund/chargeback recovery. Assert one logical funded cycle/grant, exact money reconciliation and no premature contact release.
- Exercise cross-account IDs, unrelated Guardians, staff role boundaries, unscanned files, signed-download expiry, blocked participants and realtime revocation. Use explicit negative tests for each object type.
- Demonstrate durable acknowledged messages on disconnect/retry and recovery after provider/queue outage. Test backlogs, dead-letter visibility and audited replay.
- Prove no false subject/exam combinations and no checkout against empty/suspended supply. Test all eight catalogue families with representative approved offers.
- Test Review waiting period/attestation, self/duplicate rejection, negative feedback publication, removal/aggregate recalculation and appeal linkage.
- Verify export/deletion/withdrawal, approved retention exceptions and restore-time deletion reapplication. Keep child/evidence payloads out of general logs/analytics.
- Pilot acceptance load: 100 concurrent sessions including realtime users and a realistic 20 dynamic requests/second mix. Proposed p95 first-party search/write response ≤500 ms and durable chat acknowledgement ≤300 ms; p75 mobile LCP ≤2.5 seconds under agreed device/network conditions. These are targets to measure, not observed capacity or promises. Re-estimate load and topology before broader acquisition.
- Measure complete restore and rollback, backup freshness, provider reconciliation and original-file recovery. Block launch on failed financial/permission scenarios, unresolved unexplained reconciliation differences or missing recovery evidence.

## Out of Scope

- Native mobile applications, in-person/radius discovery, independent child accounts and tutor organisations.
- Recurring billing, Tutor Pro/promotion, independent recommendation invitations, favourites and advanced ML ranking.
- Lesson scheduling/attendance verification, platform Tuition Fee collection, tutor balances/payouts, escrow/wallets, classroom/video/recording, course sales, mock tests and exam question banks.
- Guaranteed tutoring outcomes, verified lesson attendance from contact-only data, nationwide Tutor availability in every category, or an unsupported claim that every learning market is growing.

## Further Notes

- Official participation evidence supports large demand and some growth, but enrolment/registration is not paying tutoring demand. Category priorities should use responsive supply and observed marketplace fulfilment.
- Payment refund arrival is provider/method-dependent; the research reports normal refunds taking 7–10 working days and original gateway fees/tax not returned. Keep money reserve, initiation, provider success and customer-facing status distinct.
- DPDP commencement is phased. Guardian account ownership does not, by itself, resolve identifiable child-data obligations. Use the official-source report for the implementation review and confirm applicable commencement, amendments, consent verification, retention and grievance duties before live collection.
- Live launch dependencies: business/public name and legal operator/merchant identity; approved payment account and settlement bank; actual credentials; merchant/invoice/tax confirmation; approved Guardian-verification/consent/retention workflow; budgeted infrastructure and recovery region; contact and alert configuration. Development can use explicitly isolated test adapters without pretending these are complete.
- The earlier agentic 6–10-week estimate is provisional. Broad catalogue support and verification increase data/operations work. Re-estimate from the first two completed vertical slices and current integration dependencies; completion means passing release gates, not elapsed time.

