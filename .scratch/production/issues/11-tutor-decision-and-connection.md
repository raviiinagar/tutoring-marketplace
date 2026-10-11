# 11: Accept a Contact Request and establish an authorised Connection

Status: ready-for-agent
Type: task
Blocked by: 10 — Send and inspect a covered Contact Request

**What to build:** A target Tutor accepts or declines a request, and a qualifying covered request establishes one Connection with grant-gated contact access.

## Acceptance criteria

- [ ] Only the targeted eligible Tutor can decide an unexpired pending request; retries are harmless and deadline equality is expired.
- [ ] Connection/contact reads require participant authority and current safety eligibility.
- [ ] Connection, participant and conversation creation are transactional and unique per request.
- [ ] Requests covered at submission may complete after ordinary pass expiry but cannot use revoked access.
- [ ] Race/permission tests cover repeated acceptance, unrelated Tutors, suspension and stale eligibility.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


