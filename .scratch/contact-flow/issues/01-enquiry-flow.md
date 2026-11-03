# Improve composing, reviewing and tracking Tutor enquiries

Status: ready-for-agent
Type: task

## Acceptance

- REA evidence and honest browser-action attribution; distinguish observed composition from unknown delivery/payment stages.
- Compose and review without submitting or creating a payment; explicit final send only with existing access and a usable Learner.
- Keep original paid checkout, coupons, tuition and activation rules; no release of private contacts.
- Keep same payload/idempotency key on ambiguous retries; prevent duplicate UI submission and retain edits on definite errors.
- Validate missing access, pending limit, no Learner, final error/success, account changes, safe sign-in return, desktop/mobile.
- Typecheck, appropriate tests, Cloudflare build/deploy and evidence.

## Comments

3 November 2026: completed and deployed Cloudflare version `1259dab1-efba-4d5e-ad22-4812b5e000d1`. [Evidence/adaptation/acceptance report](../../../docs/research/superprof-contact-flow-2026-11-03.md) records the REA capture, fallback click attribution, privacy boundary and unknown later Superprof stages. Typecheck/build, 19 targeted tests and controlled local/hosted desktop/mobile scenarios passed. Final feedback tests passed again. Existing payment/access components and backend rules remain unchanged. Main has no published offers, so end-to-end sending to a real backend account was not exercised; controlled submissions did not contact any real Tutor. No further implementation work remains for the UI ticket.
