# Production implementation index

The [production specification](./spec.md) consolidates the owner's confirmed choices and standing acceptance of recommended defaults. VEER is the owner; the business/platform name is undecided.

## Current state

Latest completed work: [ticket 13: blocking, reports and safety investigations](./issues/13-blocking-reporting-and-suspension.md). Participants can stop communication and report selected evidence; Trust staff with MFA inspect scoped encrypted cases and apply independent, revisioned account/Listing/Connection restrictions. Restricted adults can track decisions and lodge a durable appeal without regaining marketplace access. All 98 API scenarios and 11 UI tests passed; every one of the eight browser journeys has passing evidence across the full run and synchronized availability rerun. Final build/typecheck passed. Migration 014 is applied and the local stack is running the new API. See the [safety guide](../../docs/api/safety.md).

Earlier completed work: [ticket 12: durable private chat](./issues/12-durable-text-chat.md). Adult Connection participants exchange encrypted text with committed acknowledgements, stable retry IDs, unread/read positions, bounded history and permission-rechecked realtime reconnect. The mobile UI links from Connections; safety/session revocation hides messages and closes delivery. Its acceptance evidence remains on the ticket.

Earlier alignment correction: [review follow-up](./alignment-review.md) and completed [ticket 29: public Tutor photos](./issues/29-public-tutor-photos.md). Staff/participant lock ordering is consistent, approved portrait upload/review/display is integrated and navigation reflects cookie-session state. Live launch dependencies remain unchanged.

Earlier verification: [ticket 11 evidence](./issues/11-tutor-decision-and-connection.md). All 80 API tests, nine UI tests and eight browser journeys passed, along with final build/typecheck. Tutors can accept/decline eligible covered requests; transactional Connections, adult membership/conversation metadata and separate verified-email contact permission checks are integrated. Current safety/consent/grant revocation blocks reads, while ordinary pass expiry preserves established rights. MATCHING acceptance waits for task-15 activation before contact release; production refuses fixture coverage. See the [Connection guide](../../docs/api/connections.md). Real payment/SMTP, approved Guardian/privacy/retention procedures and deployment remain release dependencies. Earlier evidence is retained on each completed ticket.

Design and research are recorded. There are 29 implementation tickets with acceptance criteria and blocking edges; tickets 01–13 and 29 are implemented and verified. A triage role is distinct from its `Resolution: completed` field.

The next numbered dependency-ready task is [ticket 14: hosted payment and verified capture](./issues/14-hosted-pass-checkout.md). The Lovable UI uses authoritative NestJS/PostgreSQL cookie sessions. Production rejects fixture coverage; real checkout/capture and shared activation remain tasks 14-15. Appeal entries are recorded, while full support adjudication is task 22. Notification delivery and the remaining launch gates retain their later slices. Current functional tests do not claim a production launch.

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

