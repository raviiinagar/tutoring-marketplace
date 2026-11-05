# API and browser test rebase - 5 November 2026

Worktree: `D:/WORK/P1/.local/audit-test-rebase`. Branch: `fix/audit-test-rebase`, created from `fix/audit-ui` at `fd45a00`. The root checkout and its uncommitted files were not edited. No application, deployment, dependency or configuration files are part of this release.

## Before and after

| Suite | Fresh before | Final after |
| --- | --- | --- |
| API (235 cases) | 104 pass / 131 fail / 0 skip | **231 pass / 4 fail / 0 skip** |
| Original browser (19 cases) | 4 pass / 14 fail / 1 skip | **17 pass / 1 fail / 1 skip** |

The remaining failures are three stale API contracts retained to preserve the disputed financial/authorization expectations, plus two independently confirmed product defects: paused-ad content validation and signed-in Tutor branding contrast. Neither product defect is fixed or suppressed here. No flaky/retry passes are included.

## Baseline recorded before test changes

Read ADR0014 first. Re-ran all 235 API cases and the original 19 browser cases. API: **104 pass / 131 fail / 0 skip**, exactly matching the audit. Browser: **4 pass / 14 fail / 1 skip**, compared with the audit's 3 / 15 / 1. The additional pass is the QA01 accessibility case fixed on the parent branch. This difference was reported before implementation. Evidence: `evidence/2026-11-05/test-rebase-api-before.json` and `test-rebase-browser-before.json`.

The original 19-case browser run excludes only the three additional QA01/QA05 regression cases introduced by the parent UI branch (`--grep-invert 'QA01:|QA05:'`). No original case is removed. Those extra cases require their own fresh stack because they publish fictional supply and would invalidate original empty-marketplace fixtures.

## Scope and assertion preservation

The central API publication fixture saves a complete private adult introduction and sends an explicit real owner PUBLISH request. Existing optional evidence is still scanned and reviewed. Qualification reviews precede the identity review that completes the one-ID workflow. Identity approval is asserted to leave publication DRAFT until the owner publishes. Publication does not fabricate reviewer identity, a badge, identity approval or a Pro purchase. Short legacy fixture titles/descriptions now use valid 12-word / 40-word content; deliberate invalid-input tests do not use that normalizer.

Public supply from previous cases is explicitly paused in each isolated database before the next case. Previously, advancing the clock expired identity evidence and implicitly hid supply. Optional identity means that was no longer valid test isolation. This cleanup retains accounts, claims, restrictions, money and established history. Deterministic pagination fixtures retain explicit IDs and copy the current publication policy; the intentionally empty first page still contains legacy candidates filtered by projection, not candidates removed before pagination.

An AST comparison found **211 of 235 API test bodies unchanged**. Financial suite test bodies (including finance, coupons, payments, refunds, reconciliation, privacy-finance and support-finance) remain unchanged; fixture setup changed. Existing account ownership, staff MFA, concurrent one-use downloads, exact money/ledger, idempotency, scope, stale revision, blocking, retention and restriction assertions remain. Retired staff ad approvals are replaced with explicit owner publication, immediate validated live edits, and an actual owner-edit versus staff-suspension concurrency race asserting exactly one success and one conflict.

No test cases were deleted. No expected-failure annotations, retries, disabled axe rules or swallowed assertions were added. Full assertion-bearing changed-line inventory (including moved assertions) is in `evidence/2026-11-05/test-rebase-expectation-changes.json`.

### Reasons for changed expectations

| Area | Change and justification |
| --- | --- |
| Shared publication setup | Draft creation remains 201; explicit PUBLISH remains 200 and asserts PUBLISHED/eligible. SUBMIT no longer enters a review queue. Staff approval calls removed only where the current workflow has no pending review. ADR0014. |
| Listing live edits and safety | Valid live edits remain online; stale revisions still reject. Lifting a previously published ad's safety suspension leaves PAUSED, requires explicit owner resume and does not auto-publish. Draft visibility, stale approval rejection, suspension and taxonomy guards remain. |
| Listing declared subjects | Current selected subjects, not optional qualification approvals, define free ad subject choices. Wrong combinations and inactive taxonomy still reject. |
| Portraits | CLEAN, consented PENDING portraits can self-publish; assert self_published and real public image loading. Expired optional ID removes verification without hiding the portrait. Old replacement URLs still invalidate; scope, consent, malware, metadata and ownership checks remain. |
| Optional identity/qualification | Expiry/revocation alone no longer hides free ads or substitutes for a public safety restriction. Identity badge becomes false on expiry. Actual audited publication suspension separately verifies private/404 and contact denial. Mandatory adult-declaration fault injection preserves acceptance-denial assertions without reintroducing an ID gate. |
| Production discovery | Eligible free ads remain discoverable, while test-only identity evidence gives no verified badge and no evidence labels. Missing adult declaration still hides supply. |
| Public SEO | Exact title assertion derives from the valid shared fixture title instead of the obsolete short title. Privacy/canonical/no-JavaScript assertions remain. |
| Recovery migrations | Expected verified count derives from sorted real SQL files; old rollback candidate omits the actual newest migration; future candidate uses the next actual number. All checksum, money and unsupported rollback assertions remain. |
| Browser labels and navigation | Exact current accessible labels and roles replace retired links, collapsed details are explicitly opened, mobile admin navigation is explicitly opened, status assertions are scoped away from the route announcer, and search waits match the actual discovery request. |
| Browser Tutor journey | Current wizard and ad editor replace retired all-in-one forms. Retired qualification widgets use a real compatibility API fixture for the same private evidence assertions. Staff ad review controls are absent for a published direct ad, not merely disabled. Draft-private/publication/no-fabricated-review assertions added. Current two portrait cards must both load. Enquiry still requires existing learner coverage, and server-side price/contact/chat/safety assertions remain. |

### Skips and environment

One requested conditional skip was added to the PG16 encrypted export/restore case: when `PG_RECOVERY_BIN` is unset it prints a clear requirement for a PostgreSQL 16 directory containing `pg_dump` and `pg_restore`. A focused unset-variable run confirmed **one explicit prerequisite skip / zero failures**. The full after run supplies `PG_RECOVERY_BIN=D:/WORK/P1/.local/tools/pg16/pgsql/bin`, so this case must execute there. The early recovery-readiness test intentionally uses a nonexistent tools sentinel when unset, proving validation precedes any external tool invocation.

The original mobile lab performance case retains its existing conditional skip unless `PLAYWRIGHT_BUILT_UI=true`; it was not deleted or newly skipped. No browser configuration changed. Chrome is selected through the existing environment variable. All backend/browser data are fictional local fixtures, not the owner's database or deployed site.

## Results and remaining failures

API after: **235 cases, 231 pass / 4 fail / 0 skip / 0 cancelled**, versus 104 / 131 / 0 before. All 37 API files ran. Duration: 1,151,148 ms. The after run used two files concurrently, each with a separate random isolated database, instead of the baseline's one; within-test money and authority concurrency assertions are unchanged. Evidence: `evidence/2026-11-05/test-rebase-api-after.json`.

| Suite / location | Classification | Failing assertion and suspected cause |
| --- | --- | --- |
| API `apps/api/test/listings.test.ts:114` | **(b) Real product defect** | RESUME of a paused ad edited to a four-word title expects HTTP400; returns 200 and publishes. `apps/api/src/listings.ts:96` enters the RESUME branch without the `publishable(row.payload)` check used at line101 for PUBLISH. A new negative boundary assertion inside the existing lifecycle case exposes this; retained positive controls pass. |
| API `apps/api/test/tutor-simple.test.ts:221` | **(a) Stale test** | Creating an ad without Tutor Pro expects403; returns201 under free ads. Preserved this financial authorization assertion rather than silently reversing it. Later Pro coupon/consent/expiry assertions in this case are blocked; it also retains legacy expiry-hides-offers expectations. Those must be deliberately re-specified as optional benefits, not fixed by status substitutions. |
| API `apps/api/test/tutor-simple.test.ts:253` | **(a) Stale test** | After explicitly revoking Tutor Pro, accepting a separately covered pending enquiry expects403; returns200. ADR0014 removes the Pro prerequisite for ordinary enquiries. Existing learner coverage, ordinary expiry and established-contact assertions preceding it pass. Preserved the disputed paid authorization assertion. The contact assertion after this failure is not reached. |
| API `apps/api/test/tutors.test.ts:100` | **(a) Stale test** | Legacy evidence approval expects public eligibility=true immediately; actual=false. This fixture still has a short legacy introduction and no explicit owner publication, whereas current eligibility requires a complete introduction and owner publication separately from optional identity review. The entire original private-review case remains unchanged, including its later expiry, revocation, correction and self-review assertions; assertions after this failure are not reached. |
| Browser `tests/browser/accessibility.spec.ts:158`, assertion in `tests/browser/accessibility.ts` | **(b) Real product defect** | Full axe violations array must be empty. At 390px on the Tutor form, `.brand-tutor` has foreground #ff6167 on #ffffff, 21px bold text, contrast2.93:1 versus required3:1. Suspected cause: `lovable-ui/src/styles.css:547`. The case remains failed and no axe rule was disabled. |
| Browser `tests/browser/mobile-performance.spec.ts:10` | **(c) Environment prerequisite, existing skip (not a failure)** | Requires `PLAYWRIGHT_BUILT_UI=true` and an actual built UI stack. Unchanged from the baseline; no LCP verification is claimed. |

These three stale cases are explicitly unresolved because mechanically flipping their expectations would violate the request to preserve financial/authorization/safety assertions. They are not labelled product defects. Rewriting their domain contracts is separate from fixing shared setup.

The signed-in Tutor accessibility diagnostic also exposed **(b) a product contrast defect** at `lovable-ui/src/styles.css:547`: `.reference-account .brand-wordmark` uses #ff6167 on white, giving the `.brand-tutor` node 2.93:1, below the large-text 3:1 requirement. The full axe assertion remains enabled. Final browser counts and reproduction evidence follow below.

Environment adjustment: Windows retained the prior isolated browser database's port5434 listener after its parent process had gone. A graceful `pg_ctl` stop against the verified worktree data directory reported no such process. An ignored temporary copy of the existing browser runner used fresh local database ports55434-55437; ignored Playwright wrapper uses the same test/config settings with absolute paths and that runner command. No repository configuration was edited or committed. One attempted restart was not executed because automatic permission review timed out; the retry was authorized and executed. Startup failures are not counted as completed suite runs.


## Commits and changed files

### `8b70b23` - test: record fresh unchanged API and browser rebase baselines

- `docs/qa/evidence/2026-11-05/test-rebase-api-before.json`
- `docs/qa/evidence/2026-11-05/test-rebase-browser-before.json`

### `d5ca29c` - test: rebase publication fixtures onto explicit free ads

- `apps/api/test/availability.test.ts`
- `apps/api/test/chat.test.ts`
- `apps/api/test/classes.test.ts`
- `apps/api/test/connections.test.ts`
- `apps/api/test/contact-requests.test.ts`
- `apps/api/test/coupons.test.ts`
- `apps/api/test/discovery.test.ts`
- `apps/api/test/finance.test.ts`
- `apps/api/test/helpers/publication.ts`
- `apps/api/test/listings.test.ts`
- `apps/api/test/marketplace-metrics.test.ts`
- `apps/api/test/notifications.test.ts`
- `apps/api/test/operations.test.ts`
- `apps/api/test/payments.test.ts`
- `apps/api/test/privacy-finance.test.ts`
- `apps/api/test/privacy.test.ts`
- `apps/api/test/public-pages.test.ts`
- `apps/api/test/reconciliation.test.ts`
- `apps/api/test/refunds.test.ts`
- `apps/api/test/reviews.test.ts`
- `apps/api/test/support-finance.test.ts`
- `apps/api/test/support.test.ts`
- `apps/api/test/tutor-simple.test.ts`

### `58869df` - test: derive recovery migrations and require explicit PG16 tools

- `apps/api/test/recovery.test.ts`

### `f05ad33` - test: follow current account navigation and direct-ad browser journeys

- `tests/browser/accessibility.spec.ts`
- `tests/browser/account.spec.ts`
- `tests/browser/availability.spec.ts`
- `tests/browser/catalogue.spec.ts`
- `tests/browser/discovery.spec.ts`
- `tests/browser/learners.spec.ts`
- `tests/browser/navigation.ts`
- `tests/browser/operations.spec.ts`
- `tests/browser/payments.spec.ts`
- `tests/browser/privacy.spec.ts`
- `tests/browser/staff.spec.ts`
- `tests/browser/support.spec.ts`
- `tests/browser/tutors.spec.ts`


### `4ea989d` - test: target catalogue shortcut buttons explicitly

- `tests/browser/catalogue.spec.ts`

The first complete browser diagnostic was 16 pass / 2 fail / 1 skip: known Tutor contrast plus an erroneous support Subject combobox locator. The latter was corrected to the observed textbox in `f05ad33`. A repeat exposed a nondeterministic catalogue-card click; `4ea989d` targets the exact All entrance examinations options and All career skills options buttons. It changes no assertions. Intermediate diagnostics and interrupted runs are not final acceptance counts.

## Verification limits and reproduction

- All API cases ran against isolated local PostgreSQL databases; gateway fixtures preserve exact financial assertions, but these are not real Razorpay charges or a deployed-environment check. Forty cases in finance, coupons, payments, refunds, reconciliation, privacy-finance and support-finance all passed with their test bodies unchanged.
- Assertions following the three retained stale API failures were not reached. In particular, this report does not claim that all assertions inside those failing cases were verified merely because their setup now succeeds.
- The existing built-mobile-performance case requires a built UI stack. Its existing prerequisite skip remains; no fresh LCP result is claimed.
- The signed-in multi-page accessibility case stops at the real Tutor contrast failure. Later widths/pages in that case are not covered by that run. Keyboard and axe automation do not constitute manual screen-reader verification.
- No fresh UI unit/build/typecheck completion is claimed in this test-only task. Supplementary Vitest attempts were interrupted before case results to prioritize the requested complete API/browser runs. No application source was edited.
- No production deployment, AWS changes, SMTP delivery or live payment operation was performed. Raw Playwright traces and reports remain ignored locally; committed evidence omits cookies, tokens, captured mail and raw request bodies.

On a fresh machine with free local test ports, reproduce with the existing repository runner (PowerShell):

```powershell
npm run build -w @tutoring/contracts
$env:PG_RECOVERY_BIN = '<PostgreSQL 16 bin directory>'
$apiTestFiles = @(Get-ChildItem apps/api/test -Filter *.test.ts | Sort-Object Name | ForEach-Object {$_.FullName})
node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json --test --test-reporter=tap --test-concurrency=2 @apiTestFiles
$env:LOCAL_POSTGRES_MAJOR = '16'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npx playwright test --grep-invert 'QA01:|QA05:'
# Separate invocation with its own fresh stack:
npx playwright test --grep 'QA01:|QA05:'
```

For this host's orphaned-port workaround, the browser command instead used `--config .local/browser-after.config.ts`; that ignored wrapper retains the repository settings and invokes the ignored stack copy using a fresh local database port. The wrapper, generated environment, database directories and dependency junctions are not committed.

## Final browser verification

Final original suite: **17 pass / 1 fail / 1 unchanged prerequisite skip**, all 19 cases accounted for, zero flaky cases, duration506597ms. The support textbox and catalogue shortcut corrections pass in this complete run. The full Tutor journey passed: current introduction wizard, optional evidence and portrait scanning, private staff download/review, explicit free draft/publication, no fabricated ad reviewer or Pro purchase, public HTML/privacy checks, covered versus uncovered enquiries, acceptance replay, contacts, chat retry/offline/unread behavior, review moderation/withdrawal, selected-message safety evidence, blocking/restrictions/appeals, ad pause/resume, live rate edit, qualification revocation and separate audited public restriction.

Evidence: `evidence/2026-11-05/test-rebase-browser-after.json` records every original case; `test-rebase-axe-after.json` contains the rendered-state axe results and the exact contrast measurements. The retained contrast failure prevents the later pages/widths in that particular multi-page accessibility case from running; the Tutor functional journey is independently verified by its separate passing case.

The three additional parent-branch QA01/QA05 regressions also passed on a separate fresh database: six home/search checks across1440/390/320px with both public card variants, twelve full audit combinations across1440/390px, and the keyboard Tutor-role focus flow. Label-content-name-mismatch violations: **0 in all18 QA01 rendered states**. The full twelve-combination scan records all axe findings, rather than suppressing other rules. Evidence: `test-rebase-browser-regressions.json` and `test-rebase-axe-regressions.json` in the same evidence directory.

Only tests and QA evidence differ from `fd45a00`. The generated route tree was restored after the local dev server finished. The root checkout remains at `f204414`; its source and uncommitted work were not edited. No configuration, package, secret or application implementation is committed.

### Additional non-gating scan observation

The twelve-combination attachment records **one other color-contrast rule finding (four nodes)** at390px on `/`, on `.scroll-reveal[data-reveal="pending"]` card text. Captured contrast is1.02:1. This is distinct from the confirmed Tutor wordmark defect. `lovable-ui/src/styles.css:276-278` transitions pending content from opacity0 to1; the capture therefore appears to overlap a reveal state. Classification: **(c) scan-state/timing uncertainty**, not a confirmed steady-state product defect. This task did not verify it after all reveal animations settled. The existing parent QA01 regression asserts the requested accessible-name rule and records other findings; that assertion scope was not changed here. The finding is preserved in `test-rebase-axe-regressions.json`, not dropped from evidence.

### Final evidence and verification commit (this report)

This commit records the final sanitized results and also removes trailing spaces on five blank fixture lines in the three API test files listed below. Those whitespace-only edits do not change the tested executable code; no additional API rerun is claimed for blank-line cleanup.

- `apps/api/test/chat.test.ts`
- `apps/api/test/classes.test.ts`
- `apps/api/test/listings.test.ts`
- `docs/qa/evidence/2026-11-05/test-rebase-api-after.json`
- `docs/qa/evidence/2026-11-05/test-rebase-assertion-preservation.json`
- `docs/qa/evidence/2026-11-05/test-rebase-axe-after.json`
- `docs/qa/evidence/2026-11-05/test-rebase-axe-regressions.json`
- `docs/qa/evidence/2026-11-05/test-rebase-browser-after.json`
- `docs/qa/evidence/2026-11-05/test-rebase-browser-regressions.json`
- `docs/qa/evidence/2026-11-05/test-rebase-commits.json`
- `docs/qa/evidence/2026-11-05/test-rebase-expectation-changes.json`
- `docs/qa/evidence/2026-11-05/test-rebase-recovery-prerequisite.json`
- `docs/qa/test-rebase-2026-11-05.md`
