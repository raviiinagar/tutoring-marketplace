# Password usability - 28 October 2026 IST

Implementation source: `62e31fdde21fbd3d0499a52779ad16ab55cb53b4`, branch `feature/password-usability`, pushed. Deployment prepared but **not yet promoted**: AWS CLI session expired and the operator public IP changed. `aws login --profile tutoring-test` is running with the owner's earlier explicit authorization; provider browser approval is pending. No UI deployment branch was pushed and the live password policy is still the previous minimum until promotion succeeds.

## Behavior and evidence

- New/reset passwords: minimum 8, maximum 128; sign-in still checks existing credentials without imposing a new minimum. Shared backend contract and UI validation/hints agree.
- Shared password Field starts masked and has a per-field accessible Show/Hide eye button. Toggle preserves the typed value and never submits the form. Applies to signup, signin, reset, staff and other existing shared password fields.
- Thirteen real PostgreSQL/authenticated HTTP auth tests passed. Registration rejects 7 and accepts 8; reset rejects 7 and accepts 8, preserving single-use tokens, hashing, session revocation and other identity regression behavior.
- UI: 52 tests across 17 files passed, including independent masking/toggle/value preservation/no-submit behavior. UI typecheck passed after fixing test query option types. Focused lint has no errors (one existing shared-module fast-refresh warning); formatting passed.

## Resume deployment after browser approval

1. Check the running local aws-login exec session, then `aws sts get-caller-identity --profile tutoring-test`. Never print credential files or values.
2. Use `.local/coupon-ssh-access.py prepare`, `review`, then `execute` only when the change set modifies solely the existing SSH Security Group without replacement. Its previous-template update changes just the current operator IPv4 /32. Synchronize operator-cidr.txt using its status mode.
3. Source is cherry-picked locally into ordinary deployment commit `20c1041` and sandbox `42a31e1`; these are not yet pushed.
4. Portable contract overlay is `.local/password-20261028-62e31fdde21f.tgz`, SHA256 `48847abe1f55368eba1ed6986929da08e5727f0b28c8790b17a6b9bb83f639f7`. `.local/install-password-overlay.py` verifies the current coupon release, archive provenance/allowlist and Linux 7/8 contract boundaries, copies only two compiled contract files into a new compatible runtime, updates RELEASE_ID and sandbox WorkingDirectory, and starts both API/worker pairs. No DB migration or credentials/password reset.
5. Transfer/install overlay with strict known-host SSH. Push both prepared UI branches only after backend healthy. Check Netlify readiness through existing protected child-process helpers.
6. `.local/verify-password-sandbox.mjs` verifies fictional-only hosted 7/8 registration and reset; run as tutoring_sandbox with its protected runtime env. `.local/password-browser.cjs` verifies ordinary mobile signup/signin UI and intercepts registration so no normal account/email is created.
7. Record final releases/deploys, health, unchanged config and stop timer. Existing VM stop remains 30 October 2026 00:23:31 IST; do not extend it implicitly.

Pending human action is AWS browser authorization, not a request to share a password or key in chat. The root workspace contains unrelated previous work; continue from the prepared worktree and preserve it.
