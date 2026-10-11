# 10: Send and inspect a covered Contact Request

Status: ready-for-agent
Type: task
Blocked by: 04 — Manage adult and guardian-controlled Learner profiles; 08 — Find eligible Tutors and inspect public offers

**What to build:** A Learner or Guardian submits a tutoring enquiry, sees its status/deadline and shares an existing qualifying entitlement across up to five pending requests.

## Acceptance criteria

- [ ] Submission checks beneficiary authority, active Tutor/Listing, subject/mode, current blocks and qualifying access.
- [ ] Initial text is validated/minimised, includes learning requirements and preferred times, and is not a pre-connection chat channel.
- [ ] Five pending requests per payer is enforced atomically; duplicate submission returns its existing result.
- [ ] The request records authorising entitlement/policy and immutable expiry; access cannot be supplied by a client-controlled flag.
- [ ] Tests use isolated nonproduction fixture grants; production has no fixture-grant bypass and rejects missing access.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


