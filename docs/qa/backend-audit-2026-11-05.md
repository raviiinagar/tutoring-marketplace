# Backend audit - 5 November 2026

All 37 files and 235 cases ran against isolated real HTTP/PostgreSQL: **104 passed, 131 failed, 0 skipped**. No application fix or legacy expectation was changed during this audit.

Failure classification after checking stacks, fixtures and current ADR0014:

- 122 fail while arranging obsolete publication fixtures, generally short text passed through SUBMIT, which now means direct publication with current validation.
- 7 assert the old automatic identity-approval/public-eligibility relationship. New private drafts require explicit publication; verification is a separate fact.
- 1 recovery test cannot find pg_dump at the isolated worktree default path. The same encrypted PG16 export/restore case passed in a supplemental rerun using the already-installed tools through PG_RECOVERY_BIN.
- 1 rollback test hard-codes28 verified migrations; the actual schema has 38.

These are test-maintenance/environment diagnoses, not 131 demonstrated live product defects. They still prevent the later financial, concurrency, safety and edge-case assertions from being treated as verified. Updating fixtures may reveal further failures.

| File | Passed | Failed |
| --- | ---: | ---: |
| `apps/api/test/account-profile.test.ts` | 3 | 0 |
| `apps/api/test/admin.test.ts` | 5 | 0 |
| `apps/api/test/auth.test.ts` | 13 | 0 |
| `apps/api/test/availability.test.ts` | 6 | 2 |
| `apps/api/test/catalogue.test.ts` | 5 | 0 |
| `apps/api/test/chat.test.ts` | 0 | 12 |
| `apps/api/test/classes.test.ts` | 0 | 5 |
| `apps/api/test/connections.test.ts` | 1 | 14 |
| `apps/api/test/contact-requests.test.ts` | 0 | 10 |
| `apps/api/test/coupons.test.ts` | 0 | 6 |
| `apps/api/test/direct-tutor-publication.test.ts` | 9 | 0 |
| `apps/api/test/discovery.test.ts` | 0 | 7 |
| `apps/api/test/finance.test.ts` | 0 | 7 |
| `apps/api/test/learners.test.ts` | 6 | 0 |
| `apps/api/test/listings.test.ts` | 1 | 7 |
| `apps/api/test/marketplace-metrics.test.ts` | 0 | 2 |
| `apps/api/test/notification-delivery.test.ts` | 2 | 0 |
| `apps/api/test/notifications.test.ts` | 1 | 7 |
| `apps/api/test/operations.test.ts` | 5 | 5 |
| `apps/api/test/payment-provider.test.ts` | 2 | 0 |
| `apps/api/test/payments.test.ts` | 0 | 14 |
| `apps/api/test/privacy-finance.test.ts` | 0 | 1 |
| `apps/api/test/privacy.test.ts` | 5 | 2 |
| `apps/api/test/public-pages.test.ts` | 0 | 2 |
| `apps/api/test/reconciliation.test.ts` | 2 | 5 |
| `apps/api/test/recovery-storage.test.ts` | 3 | 0 |
| `apps/api/test/recovery.test.ts` | 3 | 2 |
| `apps/api/test/refunds.test.ts` | 0 | 4 |
| `apps/api/test/reviews.test.ts` | 0 | 6 |
| `apps/api/test/staff-governance.test.ts` | 6 | 0 |
| `apps/api/test/staff.test.ts` | 10 | 0 |
| `apps/api/test/support-finance.test.ts` | 0 | 1 |
| `apps/api/test/support.test.ts` | 2 | 1 |
| `apps/api/test/tutor-onboarding-drafts.test.ts` | 3 | 0 |
| `apps/api/test/tutor-reputation.test.ts` | 3 | 0 |
| `apps/api/test/tutor-simple.test.ts` | 2 | 8 |
| `apps/api/test/tutors.test.ts` | 6 | 1 |

Important current-policy coverage that passed: account editing3; auth13; admin5; staff governance6; staff/MFA10; Learner/Guardian6; catalogue5; direct free publication9; private drafts3; reputation3. Other cases are enumerated in the evidence.

Policy examples: `apps/api/test/listings.test.ts:55` uses the former submission flow; `listings.test.ts:59` and `privacy.test.ts:891` infer visibility from approval; `tutor-simple.test.ts:217` expects a public profile without explicit publication; `recovery.test.ts:538` expects28 rather than 38 migrations.

[All case-level outcomes, source locations and sanitized failures](evidence/2026-11-05/backend-results.json). [Current policy](../adr/0014-free-direct-ad-publication-and-optional-identity.md).
