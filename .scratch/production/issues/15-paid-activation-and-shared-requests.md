# 15: Activate paid access once and connect accepted Tutors

Status: ready-for-agent
Type: task
Blocked by: 11 — Accept a Contact Request and establish an authorised Connection; 14 — Purchase the ₹599 Access Pass through hosted checkout

**What to build:** After confirmed capture, a payer sends requests against one purchase and eligible acceptance activates one 30-day pass and authorised Connections.

## Acceptance criteria

- [ ] First-purchase requests require capture; access starts only with eligible acceptance and its interval is fixed once.
- [ ] Two Tutors accepting concurrently share one funded cycle, entitlement and charge; each eligible Connection is created once.
- [ ] Acceptance and activation lock the same purchase records used by cancellation; external calls occur outside transactions.
- [ ] Suspension or abandonment in flight records actual money but prevents contact release and routes to resolution.
- [ ] Tests replay/out-of-order events and crash after provider success, asserting correct ledger/access and no duplicate logical charge.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


