# Product bug fixes - 5 November 2026

Branch: `fix/audit-product-bugs`, isolated worktree `D:/WORK/P1/.local/audit-product-bugs`, based on `fix/audit-test-rebase` at `4dafe8b`. Root source and uncommitted work were preserved. No package, tracked configuration, deployment or existing test files were changed.

## STEP 0: reproduce before editing

Both reported defects still reproduced; neither was skipped. The unmodified eight-case Listing suite gave **7 pass / 1 fail**, with `apps/api/test/listings.test.ts:114` expecting HTTP 400 and receiving HTTP 200 for RESUME after a four-word-title edit. The pre-edit signed-in browser audit reached `/tutor` at 390px and reported one `color-contrast` violation on `.brand-tutor`: #ff6167 against #ffffff, 21px bold, **2.93:1**, required 3:1.

Full-suite before figures below are the completed parent-branch evidence, not newly completed full baselines. Extra full-before attempts were interrupted after the required targeted reproductions; no partial run is represented as a completed full baseline. See `evidence/2026-11-05/product-bugs-step-zero.json` and `product-bugs-listings-before.json` in that directory.

## Fixes and transition checks

`c3c5170` moves the existing `publishable(row.payload)` call after the PUBLISH/SUBMIT versus RESUME state checks, before either action publishes. State, ownership, taxonomy, safety and revision checks retain their order. RESUME now raises the same `ApiProblem(400, VALIDATION_ERROR, ..., field_errors)` as PUBLISH; the existing negative test is unchanged.

The supplemental isolated real-API probe confirmed HTTP 400 for invalid live edits, SUBMIT, PUBLISH, RESUME and RESUME after a Trust safety lift. Code, message and title/description field errors match; each response's request-specific correlation UUID is validated separately. A resume while suspended remains 409, and lifting a restriction does not publish. Existing positive lifecycle and concurrency tests remain unchanged.

`8e4b993` changes the account wordmark from #ff6167 to **#f4545b**, increasing contrast against white from 2.9339:1 to **3.3515:1**. The same small color substitution fixes the account search circle's white icon contrast. The only remaining #ff6167 usage is the decorative account initial background: its initial is `aria-hidden`, and the enclosing control has an explicit account-menu accessible name. No layout or typography changed.

## Completed verification

| Suite/check | Before, completed parent evidence | After |
| --- | --- | --- |
| Full API | 231 pass / 4 fail / 0 skip, 235 cases | **232 pass / 3 stale failures / 0 skip** across the full run and recovery rerun (see note below) |
| Original browser, excluding QA01/QA05 | 17 pass / 1 fail / 1 existing skip, 19 cases | **18 pass / 0 remaining fail / 1 existing skip** across the full run and keyboard rerun (see note below) |
| QA01/QA05 browser regressions | 3 pass / 0 fail | **3 pass / 0 fail** |
| Full UI | 196 pass / 0 fail, 41 files | **196 pass / 0 fail**, 41 files |
| Full typecheck | Not freshly rerun before these fixes | **Passed** |
| Contracts and API builds | Not freshly rerun before these fixes | **Passed** |
| Cloudflare artifact build | Not freshly rerun before these fixes | **Passed** |

The signed-in accessibility case passed all ten combinations at 390px and 1280px. Newly reached after the former failure: `/tutor/listings`, `/support`, `/privacy` at 390px, and `/payments`, `/tutor`, `/tutor/listings`, `/support`, `/privacy` at 1280px. Each state has zero axe violations, with rules left enabled.

The fresh 390px homepage scan used normal motion, scrolled all three `.scroll-reveal` containers into view, required every element to leave `data-reveal="pending"` and reach computed opacity1, then waited for finite animations to finish. Result: **0 pending reveals and 0 axe violations**. The earlier 1.02:1 finding did not reproduce after settling. No homepage animation or reveal code was changed. The twelve QA01 audit combinations also recorded zero violations, alongside zero accessible-name violations in all six 1440/390/320px home/search states and four passing QA05 keyboard/mobile states.

## Remaining findings

| Classification | File / assertion | Finding |
| --- | --- | --- |
| Stale test, unchanged | `apps/api/test/tutor-simple.test.ts:221` | No-Pro ad creation expects 403 but free direct ads return 201 under ADR0014. Later financial assertions in this failing case remain unreached. |
| Stale test, unchanged | `apps/api/test/tutor-simple.test.ts:253` | Acceptance after Pro revocation expects 403 but ordinary covered enquiries return 200 under ADR0014. Later assertions remain unreached. |
| Stale test, unchanged | `apps/api/test/tutors.test.ts:100` | Legacy identity-approval fixture expects immediate public eligibility=true. Current rules require a complete introduction and explicit owner publication; actual=false. Later assertions remain unreached. |
| Additional product bypass, reproduced and unmodified | `apps/api/src/listings.ts:118-119`, legacy Trust APPROVE | An existing REVIEW row with a four-word title and short description can be approved and becomes PUBLISHED (HTTP 200). The retained staff-review path validates qualification/taxonomy/mode but never calls `publishable(row.payload)`. Normal owner publishing/resuming is fixed. This requires a retained legacy REVIEW row and an authorized reviewer; it does not bypass staff authorization. |
| Existing environment prerequisite | `tests/browser/mobile-performance.spec.ts:5` | Built-mobile LCP case retains its pre-existing `PLAYWRIGHT_BUILT_UI` prerequisite skip. No LCP result is claimed. |

No test expectation, assertion, skip or test file was changed or deleted. Financial, authorization, concurrency and safety assertions were preserved verbatim.

## Reproduction and execution notes

Commands, with dependencies already available and a local PostgreSQL16 tool directory:

```powershell
npm run build -w @tutoring/contracts
$env:LOCAL_POSTGRES_MAJOR = '16'
# Set PG_RECOVERY_BIN to the local PostgreSQL16 bin directory.
$apiFiles = @(Get-ChildItem apps/api/test -Filter *.test.ts | Sort-Object Name | ForEach-Object {$_.FullName})
node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json --test --test-reporter=tap --test-concurrency=4 @apiFiles
npm --prefix lovable-ui test -- --maxWorkers=2 --pool=forks --reporter=verbose
npm run typecheck
npm run build -w @tutoring/api
npm --prefix lovable-ui run build:cloudflare
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npx playwright test --grep-invert 'QA01:|QA05:'
npx playwright test --grep 'QA01:|QA05:'
```

This host used ignored local runner wrappers with fresh isolated database ports, and started the local stack ahead of Playwright. Test assertions and timeouts were not changed. Cold-start/hydration and resource-contention diagnostic attempts are not accepted as successful verification. The completed full API invocation was 231 pass/4 fail: three known stale cases plus ENOENT because the embedded PG16 directory lacks pg_dump.exe. Rerunning the unchanged recovery file with the existing complete PG16 dump/restore tools passed 5/5, resolving that environment failure. The completed full browser invocation was 17 pass/1 fail/1 existing skip: the keyboard case hit its unchanged 20-second timeout while the cold dev client kept the menu disabled. The same case passed unchanged after hydration warmup (1/1). Final per-case counts above combine these full runs and reruns; they are not presented as single clean full-suite runs. Both original full-run counts and rerun evidence are committed. No retry changed application code, test code, assertions or timeouts.

The full UI run used two fork workers after default parallel and thread-mode attempts stalled under local load. The completed run passed all 196 tests. The pre-existing mobile-performance skip was not added or altered. All browser/API users, mail and payments were fictional isolated fixtures; these checks do not claim a deployment, real payment, live SMTP or manual screen-reader verification.

Root Git status was compared with the pre-task snapshot and was identical. The worktree is clean after the evidence commit; generated route-tree changes were restored. There were no changes to application or test code after the verified source commits.

## Commits and files

- `c3c5170` - `fix: validate listing content before resume`: **`apps/api/src/listings.ts`** only.
- `8e4b993` - `fix: increase account header coral contrast`: **`lovable-ui/src/styles.css`** only.
- Evidence/report commit: this report and the `product-bugs-*.json` evidence files listed below. No application or test changes in this commit.

- `docs/qa/evidence/2026-11-05/product-bugs-api-after-full.json`
- `docs/qa/evidence/2026-11-05/product-bugs-browser-after-full-axe.json`
- `docs/qa/evidence/2026-11-05/product-bugs-browser-after-full.json`
- `docs/qa/evidence/2026-11-05/product-bugs-final-case-results.json`
- `docs/qa/evidence/2026-11-05/product-bugs-homepage-settled.json`
- `docs/qa/evidence/2026-11-05/product-bugs-keyboard-rerun-axe.json`
- `docs/qa/evidence/2026-11-05/product-bugs-keyboard-rerun.json`
- `docs/qa/evidence/2026-11-05/product-bugs-listings-before.json`
- `docs/qa/evidence/2026-11-05/product-bugs-qa-regressions-axe.json`
- `docs/qa/evidence/2026-11-05/product-bugs-qa-regressions.json`
- `docs/qa/evidence/2026-11-05/product-bugs-recovery-rerun.json`
- `docs/qa/evidence/2026-11-05/product-bugs-step-zero.json`
- `docs/qa/evidence/2026-11-05/product-bugs-transition-probe.json`
- `docs/qa/evidence/2026-11-05/product-bugs-ui-and-types.json`
