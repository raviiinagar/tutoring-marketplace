# Full project feature and workflow audit

**Result: the demonstrated core workflows work, but the project does not have a clean full regression baseline and is not ready for an unconditional production sign-off.** Several current accessibility/usability/copy issues were confirmed. Many older tests no longer match the owner's free-ad/optional-ID policy and therefore do not reach their important later assertions.

Audited 5 November 2026, IST. Live site: https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev/ . Source baseline: `ad8b3257d36123847db2525d5d75ab794596dc5a`; the last recorded frontend release is `26be40b0-35f4-4300-a1ff-279aa740f9ed`. This was an audit, not a new application release.

## Results at a glance

| Layer | Result | What it establishes |
| --- | --- | --- |
| Feature inventory | 55 frontend route declarations mapped | [Complete route/feature/test map](ui-audit-2026-11-05.md) |
| Actual live HTTP | 43 static routes returned 200; 13 API checks matched expected public/authentication statuses | Reachability and sampled anonymous authorization, not authenticated business completion |
| Actual live Chrome | 42 page checks over 1440/390/320px; no page errors, broken images or horizontal overflow in those checks | Anonymous desktop/mobile layout and navigation |
| Full UI suite | **193 passed, 0 failed, 0 skipped**, 40 test files | Component regression checks, largely mocked APIs/jsdom |
| Full backend suite | **104 passed, 131 failed, 0 skipped**, 235 cases in 37 files | Real isolated HTTP/PostgreSQL baseline; not green |
| Existing full browser suite | **3 passed, 15 failed, 1 skipped**, 19 cases | Legacy baseline is not green; later assertions often not reached |
| Supplemental current workflows | Passed, with explicit boundaries below | Real Chrome/API/PostgreSQL, fictional accounts and captured mail |
| Recovery supplement | 1 selected encrypted PG16 export/restore case passed | Actual isolated recovery after supplying the installed tool path |
| Build/typechecks | Contracts, API, Cloudflare build and full project typecheck passed | Source compiles; does not override failing regression tests |
| Live accessibility | 12 automated scans; serious label/name mismatches found in 7 page/viewport combinations | Current WCAG 2.5.3 defects; not an accessibility certification |

Counts from different layers overlap and must not be added as unique feature coverage. The skipped browser case is the optional built-mobile performance profile, so this audit does not claim its LCP budget passed.

## Confirmed issues, in priority order

| ID | Priority | Finding and impact | Evidence/action |
| --- | --- | --- | --- |
| QA01 | P1 | Header search and some public Tutor-card links have accessible names that omit visible text. Speech-input users cannot reliably address the visible control label. Axe reports serious `label-content-name-mismatch`. | [Live scans](evidence/2026-11-05/live-accessibility.json); [issue](../../.scratch/full-project-audit/issues/01-accessible-visible-names.md). Fix labels, then test desktop/mobile and card variants. |
| QA02 | P1 | The main regression suites are red, leaving important financial, concurrency, safety and edge-case assertions unverified.129 backend failures arise from obsolete publication fixtures/expectations; one has a stale migration count; one has an isolated tool path.14 of15 browser failures use old selectors/navigation/network expectations; the other exposes QA01. | [Backend case outcomes](evidence/2026-11-05/backend-results.json), [browser outcomes](evidence/2026-11-05/browser-suite-results.json), [issue](../../.scratch/full-project-audit/issues/02-rebase-regression-fixtures.md). Rebase fixtures carefully and rerun; do not merely change expected statuses. |
| QA03 | P2 | Reset-password guidance says 12-128 characters although the implemented minimum is 8 and a real 8-character reset succeeded. This contradicts signup and confuses users. | `lovable-ui/src/routes/auth.reset-password.tsx:17`, `src/lib/validation.ts`; [issue](../../.scratch/full-project-audit/issues/03-reset-password-guidance.md). Guidance was also read on live and isolated pages. |
| QA04 | P2 | Signup says child profiles/Guardian tools are a later update, while they already exist. Actual availability should be described through the verification/policy configuration. | `lovable-ui/src/routes/auth.signup.tsx:52`; [issue](../../.scratch/full-project-audit/issues/04-signup-guardian-copy.md). Six Learner/Guardian API cases passed. |
| QA05 | P2 | A Learner choosing Give private classes lands on general settings with the required Tutor role choice still collapsed. The path works, but its next step is not discoverable. | [Runtime evidence](evidence/2026-11-05/start-teaching-gap.json); [issue](../../.scratch/full-project-audit/issues/05-start-teaching-entry.md). Provide an explicit start-teaching step or open/focus the correct choice. |

P1 here means address before production sign-off, not that131 live product defects were demonstrated. The full failure classifications and source locations are retained rather than hidden.

## Workflow coverage

| Feature/workflow | Current evidence | Limit or remaining gap |
| --- | --- | --- |
| Homepage, subjects and shortcuts | Live responsive inspection, route inventory, full UI tests and catalogue API 5/5 passed | Not every taxonomy combination was republished under the new policy |
| Subject/location search, filters and price sorting | Actual live mobile Physics/Online suggestions, submit, price sort, in-person filter and URL/reload persistence passed | Empty results are valid; no claim that every city has supply or that distance is calculated |
| Tutor cards and canonical profiles | Actual live card opened a real canonical profile; anonymous Save prompted authentication | QA01 affects card accessibility; no hosted private contacts were collected |
| Saved Tutors | Isolated browser save, reload persistence and removal passed | Old concurrency/limit tests are blocked by obsolete publication fixtures |
| Signup and email verification | Real mobile signup rejected 7 characters, accepted 8, denied unverified sign-in, then confirmed the captured worker email through the browser | External SMTP/Gmail inbox placement/spam was not retested |
| Password visibility/sign-in | Actual desktop/mobile eye toggle and sign-in passed | Full legacy account specs have ambiguous non-exact password selectors |
| Recovery and sessions | Real captured reset link,8-character reset, old-session revocation, old-password rejection and new sign-in passed; auth API 13/13 passed | QA03 is incorrect guidance, not a reset failure |
| Account name/settings/preferences | Actual desktop/mobile save/reload persistence and Learner role retention passed; account-name API 3/3 passed | Universal learner avatar, private phone/SMS/address/gender/DOB editing remain unsupported |
| Tutor introduction and private drafts | Private-draft API 3/3 and complete UI suite passed | This audit's marketplace journey arranged the complete introduction through the real API; the full wizard was not freshly driven end to end in this audit |
| Free ad publication, edits and safety holds | Modern direct-publication API 9/9 passed, including drafts, text validation, live edits, archive/revisions, optional identity, portraits, learner coverage and blocks; supplemental real publication passed without ID or Pro | Legacy review-oriented fixtures prevent wider old-case verification |
| Teacher location, accepting status and weekly hours | UI tests and live in-person search passed; source/route inventory complete | Current authenticated location/hour editing was not freshly browser-verified; an old public-filter test stops at obsolete publication expectations |
| Optional identity/evidence/portraits | Current direct-publication and Tutor API checks passed for relevant approval/privacy/scan boundaries; modern drafts remain unverified truthfully | Fictional scanners/evidence were used; real ClamAV/infected-file behavior and live reviewer operations were not retested |
| Adult Learner and Guardian/child profiles | Actual adult creation passed; Learner/Guardian backend 6/6 passed | Old full child/Guardian browser case fails at an outdated greeting before reaching the flow; approved live verification method remains a launch dependency |
| Learner100% coupon and access | Actual mobile quote/redemption passed; coverage stayed MATCHING before acceptance and became ACTIVE after tutor acceptance | No money collected. Partial paid discounts and actual provider capture were not tested with Razorpay here |
| Tutor Pro/public contact | Modern backend verifies separation from free ads and explicit public-email/Pro rule | Actual new Pro purchase/renewal/expiry through a provider was not verified end to end |
| Enquiry review/send/accept | Actual mobile review prevented sending without coverage; explicit send and desktop Tutor acceptance passed | Decline, expiry, cancellation and concurrent edge cases in old suites need revalidation after fixture correction |
| Private chat | Actual two-way learner/tutor messages arrived, persisted after reload; duplicate client ID replayed one sequence; unrelated account was denied | Broad old chat concurrency/reconnect cases fail during setup and are not credited as passed |
| Online class scheduling | Actual browser saved a future class, Learner received an authorized Join action, and cancellation removed joining | External Meet navigation was intercepted/aborted; no real meeting, admission, audio/video or attendance was tested |
| Reviews/recommendations/badges | Current reputation API 3/3 and UI tests passed; higher badges remain tied to supported criteria | Fresh7-day review eligibility/moderation journey was not repeated; old review suite stops in setup. No fake reviews or Ambassador awards seeded |
| Support/appeals | Real mobile support-case creation and actual staff inspection/claim passed; support backend 2 cases passed | Finance-linked support and some later edge cases are blocked by old setup |
| Safety/reporting/blocks | Current publication suite verifies staff holds and both-direction account blocks; outsider chat access denied in real supplemental journey | Fresh report/block/unblock browser completion and every safety edge case were not verified |
| Notifications and availability alerts | Real preference persistence and captured auth email worker passed; notification-delivery API 2/2 and availability 6 cases passed | Legacy availability browser spec waits for obsolete GET discovery and never submits; real external alert delivery/unsubscribe not retested |
| Admin, delegation, MFA and roles | Admin 5/5, staff 10/10 and governance 6/6 backend cases passed; real elevated fixture pages were visited and support claimed | Page visitation alone is not full admin acceptance. Actual hosted Super Admin delegation/MFA/account recovery was not performed |
| Metrics/catalogue/operations | Catalogue5/5 and some operations cases passed; UI inventory covers all consoles | Live private totals were not accessed;2 metrics and5 operations cases are setup-blocked |
| Payments, refunds, receipts/reconciliation | Provider2/2 and selected reconciliation checks passed; UI/components and zero-price access work | Paid/refund/finance suites largely stop in old setup. Real Razorpay webhooks, bank settlement, refunds and merchant/invoice approval are not signed off |
| Privacy export/deletion | Actual password reauthentication, worker export/download without password hashes, explicit deletion, completed receipt after reload and denied deleted-user sign-in passed | Fictional local retention policy; no real hosted account was exported/deleted |
| Recovery/backups | Storage 3/3 and supplemental encrypted PG16 export/restore passed | Baseline tool path and hard-coded migration count need correction; no new live production disaster-recovery drill performed |
| SEO/indexing | Full existing indexing browser case passed; actual live static documents reachable | No search-engine ranking/indexing outcome claimed |

## Meaning of the red suites

The owner changed the product to free direct ad publication with optional identity in [ADR0014](../adr/0014-free-direct-ad-publication-and-optional-identity.md). Existing helpers still submit short old ad text through SUBMIT and expect a review queue/automatic publication after identity approval. SUBMIT now means explicit direct publication and enforces current content requirements. Such a fixture failure happens before the test's chat, refund or other named behavior.

This explains the failed setup; it does not prove the later behavior works. Replacing fixtures and selectors may expose additional real defects. The audit kept those tests unchanged and ran separate current-policy journeys rather than pretending the baseline was green. A recovery case also expected 28 migrations when 38 exist. Supplying the already-installed PG16 tool path made the actual encrypted export/restore supplement pass without changing source.

Details: [backend audit](backend-audit-2026-11-05.md), [browser audit](browser-audit-2026-11-05.md), [UI inventory](ui-audit-2026-11-05.md).

## Evidence and method

- Actual live anonymous routes/APIs and Chrome pages: [live audit JSON](evidence/2026-11-05/live-audit.json), [desktop homepage](evidence/2026-11-05/live-homepage-desktop.png), [mobile homepage](evidence/2026-11-05/live-homepage-mobile.png).
- REA passively captured the actual live homepage: evidence `ev_c60e16f002b2510755c7a0fb85196b03c3882986a36e670c31f1d2463c8a6606`, artifact SHA256 `1e6a4a1fde0cf4fa20af6d7be382d5c0f14a43e158184928c9433212fe167826`. Chrome navigation/interactions were separate Playwright operations; REA capture is viewport evidence, not proof of hidden backend state.
- Current marketplace journey: [step-by-step result](evidence/2026-11-05/workflow-results.json), [coupon/enquiry](evidence/2026-11-05/coupon-enquiry-mobile.png), [two-way chat](evidence/2026-11-05/chat-mobile.png).
- Search/profile/shortlist: [results](evidence/2026-11-05/discovery-saved-results.json), [live filters](evidence/2026-11-05/live-search-filters-mobile.png), [saved Tutors](evidence/2026-11-05/saved-tutors-mobile.png).
- Signup/recovery/privacy: [actual journey](evidence/2026-11-05/auth-privacy-results.json), [completed fictional deletion receipt](evidence/2026-11-05/privacy-deletion-mobile.png).
- Account desktop/mobile: [results](evidence/2026-11-05/account/browser-results.json). [Selected actual recovery result](evidence/2026-11-05/recovery-supplemental.json).

Authenticated writes used fictional isolated accounts, real Nest/PostgreSQL, a real local worker and captured mail. Application API responses were not mocked in the supplemental flows. No real customer record, hosted moderation decision, hosted privacy request, actual charge or refund was made. Raw traces, mail tokens, credentials and private fixture configuration remain ignored. No application code or deployed configuration was changed by this audit.

## Recommended next work

1. Correct QA01 accessibility and QA02 test maintenance first. Re-run the full 235-case API and 19-case browser baselines, preserving financial/authorization/concurrency assertions.
2. Correct the reset/signup copy and make the first Learner-to-Tutor transition explicit.
3. Complete provider-backed payment/refund/webhook and external email/scanner checks in an approved sandbox, then confirm the remaining merchant, Guardian and retention dependencies before any production sign-off.
4. Run the skipped built-mobile performance profile and an isolated load test; repeat the intended live owner/admin journey with dedicated test accounts. The temporary backend's last verified stop schedule remains 10 November 2026, 15:55 IST; hosting availability beyond that is a separate operational action.
