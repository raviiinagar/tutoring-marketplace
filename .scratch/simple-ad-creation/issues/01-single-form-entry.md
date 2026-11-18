# My ads creation entry

Status: ready-for-agent
Resolution: completed
Type: task

## Acceptance

- [x] Reproduce the reported path with a failing route UI test for owners with zero and existing ads.
- [x] Self-service creation shows one form with saved details reused; no ten-step progress.
- [x] Preview creates/publishes no ad; draft saving is private and publication is explicit.
- [x] A usable saved photo is reused and publication without one remains disabled.
- [x] Existing profile and ads are preserved; in-person location changes preserve availability.
- [x] Server errors retain the form and cannot trigger publication.
- [x] Desktop/mobile browser, accessibility and staff-assisted regression checks pass.
- [x] Final evidence, checks and limitations are recorded in the QA report.

## Reproduction

`npm --prefix lovable-ui test -- --maxWorkers=2 src/test/simple-ad-creation.test.tsx` initially produced two failures: after clicking **Create an ad**, the Ad title field was absent and the original Subjects step was still active. The root cause was the My ads entry calling its retained ad wizard; the released one-form component was limited to `/tutor`.

The same two scenarios pass after the fix. Broader UI coverage additionally checks draft privacy, explicit publication, saved-photo reuse, unchanged shared profile, existing-ad preservation, conditional location/availability, the twelve-word title rule and server rejection.

Final local results: 303 UI tests and 11 targeted browser journeys passed, full typecheck and Cloudflare build passed, changed-file lint has no errors, and four new form/preview axe scans have zero violations. See `docs/qa/simple-ad-creation-2026-11-18.md` for evidence and limitations. The requested pre-commit assisted/unified recheck also passed all three cases. The owner subsequently authorized normal PR merge after both CI jobs pass and a frontend-only Cloudflare release; no backend or database change.
