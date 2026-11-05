# P2: Starting teaching lands on a collapsed role selector

Status: needs-triage
Type: task

For a signed-in Learner, "Give private classes" opens `/account/settings` without a fragment. "How you use your account" remains collapsed and the Tutor checkbox is not visible. The path is functional but the next required action is hard to discover.

[Actual isolated browser evidence](../../../docs/qa/evidence/2026-11-05/start-teaching-gap.json). Sources: `account/ui.tsx` teacherPath and `account-settings.tsx` details#roles.

Suggested acceptance: provide a clear start-teaching action or open/focus the relevant role choice, preserving explicit consent and keeping staff roles separate. Confirm the first-user journey on mobile and desktop.
