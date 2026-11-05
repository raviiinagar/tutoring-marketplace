# P2: Password-reset copy contradicts the actual minimum

Status: needs-triage
Type: task

`lovable-ui/src/routes/auth.reset-password.tsx:17` says 12-128 characters. Current validation requires 8-128 and a real browser8-character reset passed. The incorrect guidance was read on both the live and isolated pages using a dummy fragment without submitting a reset.

Suggested acceptance: share password-policy guidance with signup/validation so the minimum stays consistent, then verify8 accepted and7 rejected on applicable new-password screens. No security-policy reduction is requested by this issue.
