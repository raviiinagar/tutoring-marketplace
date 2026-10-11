# 16: Expire requests and offer learner-selected alternatives

Status: ready-for-agent
Type: task
Blocked by: 15 — Activate paid access once and connect accepted Tutors

**What to build:** Learners and Tutors see consistent response deadlines/reminders, expired requests stop accepting, and the Learner can choose relevant alternatives.

## Acceptance criteria

- [ ] Each request expires after 72 hours, capped by the capture-based first-purchase no-match deadline where applicable.
- [ ] Workers and synchronous decisions enforce the same strictly-before-deadline acceptance rule.
- [ ] Late webhook/capture receipt cannot silently extend the promised purchase deadline.
- [ ] Suggestions match the intent and neither charge nor release contact without explicit Learner selection.
- [ ] Tests cover deadline equality, delayed workers, covered requests after pass expiry and replacement selection.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


