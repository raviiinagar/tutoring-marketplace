# P2: Signup says existing Guardian tools are a later update

Status: needs-triage
Type: task

`lovable-ui/src/routes/auth.signup.tsx:52` says child profiles and Guardian tools will come later. The project already implements them; six Learner/Guardian backend cases passed. Production availability still depends on the approved verification/policy configuration, so copy should describe that state accurately rather than promise an unavailable release or imply automatic Guardian approval.

Suggested acceptance: align signup guidance with the actual Learner policy and explain the verified-Guardian requirement where enabled.
