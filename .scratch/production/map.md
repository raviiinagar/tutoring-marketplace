# Production design interview

## Notes

The user invoked `grill-with-docs` to define a production release. On 10 October 2026 the owner instructed: "take yes for all which are coming". Recommended remaining defaults are therefore recorded without further routine confirmation; factual account details and external approvals are still tracked as launch dependencies. The consolidated specification is [spec.md](./spec.md). On 11 October 2026 ticket 01 was implemented with PostgreSQL integration and browser evidence; see the [implementation index](./README.md).

## Decisions-so-far

- Paid contact marketplace with direct tuition settlement and a complete learner/tutor/staff flow: [ADR-0001](../../docs/adr/0001-launch-paid-contact-marketplace.md).
- Guardian-controlled access for child learners: [ADR-0002](../../docs/adr/0002-guardian-controlled-child-access.md).
- Online-first India launch, with in-person discovery later: [ADR-0003](../../docs/adr/0003-online-first-india-launch.md).
- Release readiness determines launch timing; no hard date supplied.
- Current owner name: VEER. The business/platform name is undecided; VEER is not the product brand.
- VEER currently owns technical and business operations, including approvals, support, refunds and safety reports. Accepted support coverage is Monday–Saturday, 10 am–6 pm IST; incident handling outside staffed coverage remains unresolved. This records accountability, not a claim of completed technical or legal review.
- Accepted monthly planning ceiling: ₹10,000 for hosting, database, backups, monitoring, email and SMS; excludes development, marketing and payment transaction fees. Vendor costs and production adequacy still need verification.
- Access offer: proposed price accepted at ₹599 for 30 days; the access clock begins on first eligible tutor acceptance with confirmed payment. Tax/invoice treatment remains to be resolved before final checkout wording.
- One Access Pass covers multiple tutor connections during its access period.
- Manual repurchase in the first release; no automatic recurring charge. Existing authorised connections remain usable after expiry, subject to safety restrictions; new connections require qualifying access.
- First-purchase requests are sent after confirmed payment. If no eligible tutor accepts within 72 hours of payment, initiate a full platform-fee refund; initiation and arrival in the customer's bank are different states.
- Initial catalogue covers eight groups: school education, entrance examinations, higher education, competitive examinations, professional qualifications, career skills, languages/communication, and arts/other learning. This supersedes the three-subject and proposed CBSE-only launch limits: [ADR-0005](../../docs/adr/0005-broad-india-learning-catalogue.md). Confirmed classification and availability rules are in [catalogue.md](./catalogue.md).
- Exam-specific listings identify the target exam, taught subjects, learner level, teaching language and relevant tutor experience.
- Empty categories show an honest availability message and an optional notification signup. Paid requests require an eligible tutor to receive them.
- English interface; tutors declare teaching languages. Learning domain, subject, level, school board and exam track are distinct concepts.
- A payer may have at most five pending tutor requests. Each request expires after 72 hours; first-purchase requests cannot outlive the purchase no-match deadline.
- After contact release, refund requests receive individual review, including duplicate-charge, fraud and promised-service failure cases. The automatic full no-match refund remains; final refund wording and financial effects require detailed review.
- Tutor publication requires an adult tutor aged 18 or older and staff review of identity and relevant qualification/experience evidence. Verification labels state the check performed; evidence requirements depend on the taught domain.
- Reviews require an established connection, a seven-day wait from connection establishment, and actual-interaction attestation. VEER moderates before publication, admits positive and negative policy-compliant reviews, and supports appeals; the connection label does not verify attendance.
- Initial chat is text-only, with durable history, unread status, blocks and reconnect recovery. Tutor images and private verification uploads remain in scope; chat file attachments are deferred.
- Cancellation before any connection is established cancels purchase requests and initiates a full platform-fee refund. Cancellation/activation races must not both disclose contact and reverse an unactivated purchase.
- An approved full refund after activation ends rights to contact new tutors but preserves existing conversations unless safety restrictions apply. Previously disclosed contact information cannot be made unknown.
- TypeScript, Next.js, NestJS and PostgreSQL architecture: [ADR-0004](../../docs/adr/0004-typescript-modular-backend-and-postgresql.md).
- The owner selected Lovable for the final UI on 11 October 2026; [ADR-0009](../../docs/adr/0009-lovable-ui-and-authoritative-api.md) updates the web choice while preserving NestJS/PostgreSQL authority. The current Next.js app is a functional account harness. Configured Lovable MCP tools are unavailable in this session, so a manual generation/export prompt is provided.
- No hosting/provider constraint or existing vendor account has been supplied; do not infer vendor readiness from a general affirmative answer.
- Accepted terminology is recorded in [GLOSSARY.md](../../GLOSSARY.md).
- ADRs belong in `docs/adr/`, per the project's agent configuration. Earlier plan assumptions yield to explicit accepted decisions.
- Payment and guardian/privacy constraints have primary-source evidence in [requirements-research.md](./requirements-research.md). Implementation and legal applicability must respect the report's explicit unresolved dependencies and phased commencement.
- Adopted remaining defaults: guardian verification before live child processing [ADR-0006](../../docs/adr/0006-guardian-verification-before-child-processing.md); one-time hosted Razorpay payments with separate access activation [ADR-0007](../../docs/adr/0007-one-time-hosted-payments-and-separate-access.md); budgeted Mumbai pilot and measured recovery [ADR-0008](../../docs/adr/0008-budgeted-mumbai-pilot-and-measured-recovery.md).
- Recommended test seam accepted by standing instruction: external API/application behaviour against a real PostgreSQL test database, provider adapters for external failures, and browser tests for core journeys.
- Implementation breakdown accepted by standing instruction: 28 individually published vertical-slice tickets with prerequisite edges, indexed in [README.md](./README.md). Ticket 01 is the initial available implementation task; no application implementation is claimed by the completed design work.
- Adopted technical/commercial boundary rules, identity verification, notification defaults, retention gates, realistic pilot load and release criteria are consolidated in [spec.md](./spec.md).
- Official learning-domain evidence is in [india-learning-domains-research.md](./india-learning-domains-research.md); hosting costs and recovery limitations are in [hosting-research.md](./hosting-research.md).

## Fog

Routine recommended design choices are settled by the owner's standing instruction. Remaining items are explicit implementation measurements or launch dependencies:

- Public business/platform name and legal merchant identity; VEER is the owner.
- Approved live payment account, bank, email/phone domains and production credentials.
- Finance confirmation of ₹599 customer total, tax breakdown, invoice identity and funded refund reserve.
- Approved guardian authority/age verification method, consent, privacy/grievance procedure and data-class retention schedule before live personal-data collection.
- Final provisioned topology, actual usage/tax/exchange costs within ₹10,000, and approved independent recovery-storage location.
- Owner contact channels and incident escalation configuration outside staffed hours.
- Verified catalogue seeds, claims/evidence checklist and real responsive Tutor supply.
- Measured load, recovery, reconciliation, privacy and permission evidence before production release.
