# 14: Purchase the ₹599 Access Pass through hosted checkout

Status: ready-for-agent
Type: task
Blocked by: 04 — Manage adult and guardian-controlled Learner profiles; 08 — Find eligible Tutors and inspect public offers

**What to build:** A payer reviews platform-versus-tuition pricing and creates one server-priced hosted checkout with verified payment status and honest pending/failure screens.

## Acceptance criteria

- [ ] One stable membership/cycle owns the versioned amount, currency and policy; client amounts are ignored.
- [ ] Only an eligible Tutor recipient allows checkout; customer total and configured invoice/tax disclosures are visible.
- [ ] Server verifies Checkout signatures and captured provider state; browser redirect alone grants no access.
- [ ] Webhook raw-body validation, durable inbox, replay protection and captured financial journal are included.
- [ ] Sandbox/adapter tests cover forged amounts, bad signatures, lost callbacks, unknown attempts and no duplicate replacement charge.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


