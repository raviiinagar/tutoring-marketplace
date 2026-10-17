# Production implementation index

The [production specification](./spec.md) consolidates the owner's confirmed choices and standing acceptance of recommended defaults. VEER is the owner; the business/platform name is undecided.

## Current state

Latest completed work: [ticket 23: verified export, deletion and retention](./issues/23-privacy-export-deletion-and-retention.md). Owned clean-photo/evidence exports, recent password proofs, expiring downloads, read-only deletion tracking, exact-scope Guardian withdrawal, scoped retention/holds and signed restore tombstones are implemented. SMTP handling stays in external review until verified by Support. Verification: all 161 API regression scenarios, the final eight privacy/Finance scenarios, all 34 UI tests and the isolated mobile export/deletion browser journey passed; build/typecheck passed. Migration 025 preserves the existing 28 users, with no owner erasure requests. Development exports work; erasure requires configured retention approval. Real policy approval, independent storage and the measured recovery drill remain release dependencies. See the [privacy guide](../../docs/api/privacy.md).

Earlier completed work: [ticket 22: support cases and appeal adjudication](./issues/22-support-and-appeal-cases.md). Owner-only case history/replies, scoped staff MFA, assignment, private notes and immutable outcomes are implemented. Review/safety appeals link atomically; Trust decisions preserve source restrictions and withdrawal, while refund reconsideration opens a separate Finance-owned review without editing the original decision. Human coverage is Monday-Saturday, 10 am-6 pm IST. Verification: 29 relevant API scenarios, all 30 UI tests, the complete owner/staff browser journey, build and typecheck passed. Migration 024 preserves all 28 existing users; the latest localhost stack is active. See the [Support guide](../../docs/api/support.md).

Earlier completed work: [ticket 21: connection-linked Reviews and moderation](./issues/21-connection-linked-reviews.md). Seven-day adult/Guardian feedback, explicit interaction attestation, rating-neutral Trust/MFA moderation, live public aggregates, author withdrawal and private appeal references are implemented. Source consent/safety and production coverage are rechecked; lesson attendance is not claimed as verified. Verification: 35 relevant API scenarios, all 26 UI tests, the extended mobile Tutor browser journey, build and typecheck passed. Migration 023 and the latest localhost stack are active. See the [review guide](../../docs/api/reviews.md).

Earlier completed work: [ticket 20: transactional notifications and preferences](./issues/20-transactional-notification-delivery.md). Committed minimal events, versioned templates, consent/preferences, durable retries and Support/MFA delivery monitoring are implemented. Optional critical refund SMS is limited to the configured verified operations owner with a daily budget and no blind resend after an unknown result. Real SMTP/SMS onboarding remains external. See the [notification guide](../../docs/api/notifications.md). Final batch verification covers 143 API scenarios across the broad run and corrected fixture reruns, all 24 UI tests and nine browser journeys; build/typecheck pass. The owner database has migrations through 022 without resetting existing records.

Earlier completed work: [ticket 19: financial documents and reconciliation](./issues/19-payment-history-and-reconciliation.md). Owner-only payment confirmations/history, immutable balanced postings, provider/bank imports, audited exceptions and missing-callback recovery are implemented. Live daily reconciliation is read-only and deduplicated. Merchant tax-invoice setup, real credentials and bank evidence remain external launch dependencies. See the [reconciliation guide](../../docs/api/reconciliation.md).

Earlier completed work: [ticket 18: reviewed refunds and chargebacks](./issues/18-post-connection-refunds-and-chargebacks.md). Finance/MFA decisions, cumulative reversal limits, explicit access treatment, verified provider refund/dispute reconciliation and excess-capture liabilities are implemented. Seven financial scenarios, 22 UI tests and build/typecheck passed. Existing safe conversations survive full financial reversal; future acquisition is revoked.

Earlier completed work: [ticket 17: cancellation and no-match refunds](./issues/17-cancellation-and-no-match-refund.md). Full refund intents, reserve accounting, leased provider retries, cancellation/activation coordination and payer/Finance status controls are implemented and tested. Real credentials, funded reserve and merchant sandbox verification remain launch dependencies. See the [refund guide](../../docs/api/refunds.md).

Earlier completed work: [ticket 16: deadlines and learner-selected alternatives](./issues/16-request-deadlines-and-alternatives.md). Background expiry and deduplicated lifecycle events share the synchronous strict response deadline. In-app reminders and explicit matching alternatives preserve learner intent without automatic billing or contact release. Verification: 39 API checks, 20 UI tests, build/typecheck and the mobile Tutor browser journey passed.

Earlier completed work: [ticket 15: paid coverage and shared Access Pass activation](./issues/15-paid-activation-and-shared-requests.md). Verified captured money funds matching enquiries; the first eligible acceptance fixes one 30-day entitlement and atomically creates authorised Connections. Concurrent Tutors share the same funded cycle without resetting dates or charging again. Ordinary expiry preserves covered pending requests and established safe communication; a new purchase requires an explicit checkout after activated-pass expiry. Suspension, role withdrawal, test-mode isolation and financial review fail closed while retaining money history. See the [paid-access guide](../../docs/api/paid-access.md). Final verification evidence is recorded on the ticket. Real provider credentials, merchant/invoice/tax setup and credentialed sandbox verification remain external launch dependencies; ordinary local checkout stays disabled.

Earlier completed work: [ticket 14: hosted checkout and verified capture](./issues/14-hosted-pass-checkout.md). Server-priced hosted Orders, durable signed webhook capture, immutable money history and truthful payment status/resume flows are implemented. See the [payment guide](../../docs/api/payments.md).

Earlier completed work: [ticket 13: blocking, reports and safety investigations](./issues/13-blocking-reporting-and-suspension.md). Participants stop communication and report selected evidence; Trust staff with MFA inspect scoped encrypted cases and apply independent account/Listing/Connection restrictions. Restricted adults can track decisions and lodge a durable appeal without regaining marketplace access. See the [safety guide](../../docs/api/safety.md).

Earlier completed work: [ticket 12: durable private chat](./issues/12-durable-text-chat.md). Adult Connection participants exchange encrypted text with committed acknowledgements, stable retry IDs, unread/read positions, bounded history and permission-rechecked realtime reconnect. The mobile UI links from Connections; safety/session revocation hides messages and closes delivery. Its acceptance evidence remains on the ticket.

Earlier alignment correction: [review follow-up](./alignment-review.md) and completed [ticket 29: public Tutor photos](./issues/29-public-tutor-photos.md). Staff/participant lock ordering is consistent, approved portrait upload/review/display is integrated and navigation reflects cookie-session state. Live launch dependencies remain unchanged.

Earlier verification: [ticket 11 evidence](./issues/11-tutor-decision-and-connection.md). All 80 API tests, nine UI tests and eight browser journeys passed, along with final build/typecheck. Tutors can accept/decline eligible covered requests; transactional Connections, adult membership/conversation metadata and separate verified-email contact permission checks are integrated. Current safety/consent/grant revocation blocks reads, while ordinary pass expiry preserves established rights. Paid MATCHING acceptance now activates through task 15; production refuses fictional and provider-test coverage. See the [Connection guide](../../docs/api/connections.md). Real payment/SMTP, approved Guardian/privacy/retention procedures and deployment remain release dependencies. Earlier evidence is retained on each completed ticket.

Design and research are recorded. There are 29 implementation tickets with acceptance criteria and blocking edges; tickets 01–22 and 29 are implemented and verified. A triage role is distinct from its `Resolution: completed` field.

The next numbered dependency-ready task is [ticket 23: privacy export, deletion and retention](./issues/23-privacy-export-deletion-and-retention.md). Support cases and encrypted events now join the personal-data inventory. Operational/deployment/recovery gates follow. Functional completion of the current slices does not claim a production launch.

## Work sequence

Choose a ticket only when its prerequisites are complete. A ready-for-agent status describes specification readiness, not completion or freedom from its listed blockers. Record tests, review results and unresolved dependencies on each ticket. Update this index or the design map with verified progress after a work batch.

The main delivery chain is accounts → approved supply/discovery → requests and Connections → paid access/refunds → operational/privacy workflows → measured release readiness. Independent branches can proceed once their actual blockers finish.

## Ticket index

| Ticket | End-to-end slice | Blocked by |
|---|---|---|
| 01 | [Create a verified account and first session](./issues/01-verified-account-and-first-session.md) | None |
| 02 | [Manage roles, account recovery and sessions](./issues/02-roles-recovery-and-session-revocation.md) | 01 |
| 03 | [Sign in to a scoped staff console with MFA](./issues/03-staff-mfa-and-scoped-console.md) | 02 |
| 04 | [Manage adult and guardian-controlled Learner profiles](./issues/04-learner-and-guardian-profiles.md) | 02, 03 |
| 05 | [Browse and administer the eight-domain catalogue](./issues/05-eight-domain-catalogue.md) | 03 |
| 06 | [Onboard an adult Tutor and review private evidence](./issues/06-adult-tutor-evidence-review.md) | 02, 03 |
| 07 | [Publish approved teaching offers and manage availability](./issues/07-listing-approval-and-availability.md) | 05, 06 |
| 08 | [Find eligible Tutors and inspect public offers](./issues/08-discovery-and-public-tutor-detail.md) | 07 |
| 09 | [Subscribe to availability in an empty category](./issues/09-empty-category-availability-signup.md) | 08 |
| 10 | [Send and inspect a covered Contact Request](./issues/10-covered-contact-request.md) | 04, 08 |
| 11 | [Accept a Contact Request and establish an authorised Connection](./issues/11-tutor-decision-and-connection.md) | 10 |
| 12 | [Send durable text messages and recover after reconnect](./issues/12-durable-text-chat.md) | 11 |
| 13 | [Block communication and investigate safety reports](./issues/13-blocking-reporting-and-suspension.md) | 03, 12 |
| 14 | [Purchase the ₹599 Access Pass through hosted checkout](./issues/14-hosted-pass-checkout.md) | 04, 08 |
| 15 | [Activate paid access once and connect accepted Tutors](./issues/15-paid-activation-and-shared-requests.md) | 11, 14 |
| 16 | [Expire requests and offer learner-selected alternatives](./issues/16-request-deadlines-and-alternatives.md) | 15 |
| 17 | [Cancel unactivated purchases and refund unmatched payments](./issues/17-cancellation-and-no-match-refund.md) | 16 |
| 18 | [Review refunds after connection and reconcile chargebacks](./issues/18-post-connection-refunds-and-chargebacks.md) | 13, 17 |
| 19 | [Inspect receipts and reconcile payments to settlements](./issues/19-payment-history-and-reconciliation.md) | 18 |
| 20 | [Deliver transactional notifications with preferences](./issues/20-transactional-notification-delivery.md) | 09, 12, 17 |
| 21 | [Submit and moderate connection-linked Reviews](./issues/21-connection-linked-reviews.md) | 13 |
| 22 | [Resolve support cases and appeals through scoped actions](./issues/22-support-and-appeal-cases.md) | 18, 21 |
| 23 | [Export or delete personal data with tracked retention](./issues/23-privacy-export-deletion-and-retention.md) | 04, 06, 09, 19, 20, 22, 29 |
| 24 | [Publish useful pages and inspect delivered matching value](./issues/24-public-seo-and-marketplace-metrics.md) | 09, 15, 19, 21, 29 |
| 25 | [Detect critical failures and replay durable work safely](./issues/25-critical-alerts-and-job-replay.md) | 19, 20, 22 |
| 26 | [Deploy a pilot and demonstrate complete recovery](./issues/26-deployment-backup-and-restore.md) | 23, 25 |
| 27 | [Verify accessible journeys under pilot load](./issues/27-accessibility-and-realistic-load.md) | 12, 23, 24 |
| 28 | [Complete production readiness and a controlled real-user pilot](./issues/28-production-readiness-and-controlled-pilot.md) | 26, 27 |
| 29 | [Upload, review and publish Tutor portraits](./issues/29-public-tutor-photos.md) | 03, 06, 08 |

## Release dependencies

Email testing decision: the owner deferred live SMTP setup until buying a domain. Use local captured email and `/dev/inbox` during development. This does not block the next implementation ticket; a verified sender/domain and real delivery check remain release dependencies.

Before live release, supply actual brand/legal merchant identity, approved payment account/bank and credentials, invoice/tax decisions, guardian/privacy/retention approval, real responsive Tutor supply, funded refunds, budgeted provisioning and alert configuration. These are explicit dependencies, not values an agent should invent.

## References

- [Design decisions and launch dependencies](./map.md)
- [Accepted broad catalogue](./catalogue.md)
- [Official payment and guardian/privacy research](./requirements-research.md)
- [Official learning-domain demand evidence](./india-learning-domains-research.md)
- [Hosting prices and recovery limitations](./hosting-research.md)

