# Existing browser suite audit - 5 November 2026

The unchanged baseline completed all 19 declared cases: **3 passed, 15 failed, 1 skipped**. Fourteen failures are stale UI/navigation/network selectors; one is a real current accessibility defect. This is not a clean end-to-end baseline. The newer isolated current-policy journeys in the main report are separate evidence.

| Test | Result | Diagnosis |
| --- | --- | --- |
| `tests/browser/accessibility.spec.ts:5` - keyboard users skip navigation and recover focus after mobile menu and route changes | failed | STALE_UI_ASSERTION: Spec expects a previous page heading or Hello greeting; intended later assertions are not reached. |
| `tests/browser/accessibility.spec.ts:45` - discovery and authentication expose labelled forms, contrast and announced errors | failed | CONFIRMED_ACCESSIBILITY_DEFECT: Actual axe WCAG 2.5.3 failure in the current public header. |
| `tests/browser/accessibility.spec.ts:69` - signed-in mobile and desktop checkout, Tutor, support and privacy forms are accessible | failed | STALE_UI_ASSERTION: Spec expects a previous page heading or Hello greeting; intended later assertions are not reached. |
| `tests/browser/accessibility.spec.ts:154` - form boundaries and keyboard focus stay visible against the input surface | passed | PASS:  |
| `tests/browser/accessibility.spec.ts:202` - client-side form errors announce themselves and describe each invalid input | passed | PASS:  |
| `tests/browser/account.spec.ts:4` - Lovable account journey from http://localhost:3100 | failed | STALE_AMBIGUOUS_SELECTOR: Non-exact password label matches both the input and its Show-password control. |
| `tests/browser/account.spec.ts:4` - Lovable account journey from http://127.0.0.1:3100 | failed | STALE_AMBIGUOUS_SELECTOR: Non-exact password label matches both the input and its Show-password control. |
| `tests/browser/availability.spec.ts:2` - mobile empty search confirms optional adult availability consent and unsubscribes using captured email | timedOut | STALE_NETWORK_EXPECTATION: Spec waits for old GET /v1/discovery; current search uses POST /v1/discovery/searches. |
| `tests/browser/catalogue.spec.ts:10` - public catalogue aliases and Trust maintenance stay consistent | timedOut | STALE_NAVIGATION_SELECTOR: After sign-in, spec waits for Open staff console on the old dashboard; current account navigation differs. Later privileged operations are not reached. |
| `tests/browser/discovery.spec.ts:2` - mobile public search has honest empty results across eight families and unavailable detail | failed | STALE_UI_ASSERTION: Spec expects a previous page heading or Hello greeting; intended later assertions are not reached. |
| `tests/browser/learners.spec.ts:14` - private adult profile and fictional Guardian approval, child consent withdrawal and revocation | failed | STALE_UI_ASSERTION: Spec expects a previous page heading or Hello greeting; intended later assertions are not reached. |
| `tests/browser/mobile-performance.spec.ts:5` - built public journeys meet the adopted mobile lab LCP profile | skipped | SKIPPED:  |
| `tests/browser/operations.spec.ts:59` - operations console records scoped health, pauses checkout and keeps mobile recovery controls private | failed | STALE_AMBIGUOUS_SELECTOR: Non-exact password label matches both the input and its Show-password control. |
| `tests/browser/payments.spec.ts:2` - mobile Access Pass page shows the real server price and keeps unconfigured payments disabled | timedOut | STALE_NAVIGATION_SELECTOR: Spec waits for removed Access Pass payment link on dashboard. Current access tools are collapsed with a different destination label. |
| `tests/browser/privacy.spec.ts:38` - verified export and deletion complete with a read-only receipt on mobile | failed | STALE_NAVIGATION_SELECTOR: Spec expects a previous dashboard link; intended workflow is not reached. |
| `tests/browser/public-indexing.spec.ts:3` - served indexing documents block development crawlers and exclude private pages | passed | PASS:  |
| `tests/browser/staff.spec.ts:10` - staff MFA enrollment, scoped console, audit and authenticator recovery | timedOut | STALE_NAVIGATION_SELECTOR: After sign-in, spec waits for Open staff console on the old dashboard; current account navigation differs. Later privileged operations are not reached. |
| `tests/browser/support.spec.ts:38` - owner and scoped staff exchange a support case while private notes stay staff-only | failed | STALE_NAVIGATION_SELECTOR: Spec expects a previous dashboard link; intended workflow is not reached. |
| `tests/browser/tutors.spec.ts:16` - fictional Tutor evidence, private reviewer download, approvals and revocation | failed | STALE_UI_ASSERTION: Spec expects a previous page heading or Hello greeting; intended later assertions are not reached. |

[Complete sanitized results](evidence/2026-11-05/browser-suite-results.json). Raw Playwright traces remain ignored because they can contain fictional session/email tokens. No implementation or old assertion was changed to force a pass.
