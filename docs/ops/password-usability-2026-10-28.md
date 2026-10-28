# Password usability - 28 October 2026 IST

Implemented and deployed to the ordinary preview and isolated fictional sandbox. New/reset passwords accept 8-128 characters; sign-in continues to verify existing longer credentials. All shared password fields start masked and offer an accessible independent Show/Hide eye button that preserves typed input and never submits the form. Applies to signup, signin, reset, staff and other existing shared password fields.

## Verified acceptance

- Thirteen real PostgreSQL/authenticated HTTP identity scenarios passed. Registration and reset reject 7 and accept 8 characters; hashing, single-use reset, session revocation, expiry and other auth regression checks remain passing.
- UI: 52 tests across 17 files passed, including independent masking/toggle/value preservation/no-submit. UI typecheck passed; focused lint has no errors (one existing shared-module fast-refresh warning), formatting passed.
- Hosted fictional sandbox verified actual 7/8 registration boundaries, verification/login and 7/8 reset boundaries followed by login. Real user passwords/accounts were not changed.
- Hosted ordinary mobile browser verified the 8-character hint, 7-character client rejection, 8-character client acceptance and signup/signin visibility toggles preserving the input. Registration was intercepted in this UI-only check, so no real account/email was created. No horizontal overflow.
- Both health endpoints return 200; all four API/worker services active. Ordinary paid checkout remains disabled, sandbox test checkout enabled. Protected ordinary API/backup configuration comparison showed only RELEASE_ID changed. Existing backup status is success; no fresh database-backup claim for this contract-only release.

## Published release

- Implementation source: `62e31fdde21fbd3d0499a52779ad16ab55cb53b4`, branch `feature/password-usability`.
- Backend release: `password-20261028-62e31fdde21f`, a two-file portable compiled-contract overlay on verified `coupons-20261027-d25043d1ab92`. Reuses the verified Linux dependencies after lock/hash checks; not a fresh full CI/Linux build claim. Archive SHA256 `48847abe1f55368eba1ed6986929da08e5727f0b28c8790b17a6b9bb83f639f7`. Archive allowlist/path checks, actual Linux contract imports/boundaries and derived 428-file release manifest passed. No database migration; schema remains 30.
- Ordinary UI commit `20c1041903ce4a75768e005dedbf025a8e9a0fa7`, ready Netlify deploy `6ae1fd47c36bed73caf9ce8d`.
- Sandbox UI commit `42a31e18f2af9b872028b0d93e1a7e7c47d9c518`, ready Netlify deploy `6ae1fd4ae79c8a0a23b2cbd5`.

AWS login was renewed after the owner's browser approval, and identity verified. Operator network IP changed: reviewed previous-template CloudFormation update modified solely the existing SSH Security Group without replacement to the current operator IPv4 /32. HTTPS, compute and stop deadline were preserved. No new resources, paid services, live payment mode, secret changes or real-user password resets.

Existing VM stop remains **30 October 2026 at 00:23:31 IST**. This password change does not extend that deadline or complete unrelated launch gates. The root workspace contains unrelated previous work, which was preserved.
