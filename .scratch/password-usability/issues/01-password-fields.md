# Eight-character account passwords and visibility controls

Status: ready-for-agent

Acceptance: server/UI agree on 8-128 for new/reset passwords; 7 rejected, 8 accepted; longer existing credentials remain valid; shared password eye controls preserve values and form state; API auth regression and UI tests pass; publish ordinary and sandbox builds.

## Comments

28 October 2026: implementation in progress. Existing unrelated workspace changes preserved.

Source implemented and pushed as 62e31fd. Thirteen auth API scenarios and 52 UI tests passed; UI typecheck and focused formatting/lint completed. Live promotion awaits the pending AWS login browser approval after session expiry/operator IP change. Prepared artifact and exact continuation steps: [password rollout](../../../docs/ops/password-usability-2026-10-28.md).

Deployment completed after AWS browser approval: both backend pairs and both hosted UIs are healthy. Actual hosted fictional registration/reset and ordinary mobile UI checks passed. See the updated rollout record for exact artifact/deploy references.
