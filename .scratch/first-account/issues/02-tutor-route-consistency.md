# Apply the account redesign consistently to Tutor routes

Status: ready-for-agent
Type: task

The owner reported that `/tutor` still showed the old white nested shell, yellow draft wizard and premature Pending cards after the account-page redesign. Correct the shared shell for all Tutor workspace routes, retain private drafts, and verify the exact saved About-you step on desktop/mobile.

## Comments

5 November 2026: reproduced with five failing route tests. Root cause: only explicitly opted-in account pages used the redesigned shell; Tutor routes still selected the legacy wrapper. The shared shell now recognizes `/tutor` and `/tutor/…` and renders a single external dark teaching navigation with the new header. The header/navigation stay together on scroll. Removed the new-profile Pending overview and redundant nested About heading; retained actual profile statuses once a profile exists. Draft step/name persistence is unchanged. Wizard colors now match the coral account style. Suppressed the programmatic main-container focus outline while retaining form-control focus indications. Forty-one UI tests, typecheck/build and real desktop/mobile Chrome checks passed. [Browser evidence](../../../docs/research/evidence/tutor-shell/browser-results.json).
