# 17: Cancel unactivated purchases and refund unmatched payments

Status: ready-for-agent
Type: task
Blocked by: 16 — Expire requests and offer learner-selected alternatives

**What to build:** A payer can cancel before activation, and unmatched captured purchases automatically initiate a full refund at the matching deadline with visible progress.

## Acceptance criteria

- [ ] Cancellation ends relevant unconnected requests; reversal/activation races cannot both connect an unactivated purchase and reverse it.
- [ ] Full no-match/cancellation refund intents reserve the refundable amount and use stable provider operation keys.
- [ ] Insufficient reserve, provider timeout and failed/unknown refunds remain visible, retriable and escalated.
- [ ] UI distinguishes initiation, confirmed provider result and bank timing without reducing the full customer refund by gateway costs.
- [ ] Race/failure tests prove one refund effect, no late resurrection and correct ledger/access outcome.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


