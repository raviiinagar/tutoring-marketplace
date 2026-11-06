# Unified Tutor onboarding staging release - 6 November 2026

The verified onboarding update is deployed to the existing public **staging** site:

https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev/

- Source commit: `464c9fe50fa074d3023eea0dcd40f2af3f3c9a85`, isolated branch `feature/unified-tutor-onboarding`.
- Both backend environments: `unified-onboarding-20261106-464c9fe50fa0`.
- Cloudflare version: `74cfc857-fad4-439f-ad64-ad11f298b5b1`.
- Backend archive SHA256: `f77e11ab1fa08bc290502e8b2aa6ebbcde6b0d3faff4c5fc1fe84ba457759835`.

See the [verification report](../qa/unified-tutor-onboarding-verification-2026-11-06.md), [sanitized local check evidence](../qa/evidence/2026-11-06/unified-onboarding-checks.json), and [deployment evidence including changed-file list](evidence/unified-tutor-onboarding-deployment-2026-11-06.json). The [original Claude handoff](unified-tutor-onboarding-handoff-2026-11-06.md) describes its preparation-time state; this release report supersedes its undeployed/test-failure status.

## Verification and release sequence

The reported API failures were reproduced before fixture changes. The 12-word title rule is intentional. Shared positive fixtures now meet that rule and use real photo/publication endpoints; negative content, financial, safety, concurrency and authorization assertions remain. RESUME and legacy staff APPROVE validation bypasses, missing manager photo gates, the manual-role entry path and wizard step contrast were corrected.

Final checks: **240 API tests passed**, **206 UI tests passed**, **23 browser tests passed with zero failures/flaky cases**. One inherited built-performance lab case was skipped because the browser suite used the development harness. All eighteen QA01 scan combinations, including its twelve complete audit combinations, recorded **zero axe violations**. Full typechecks, contracts/API/Node UI and Cloudflare builds passed; six deployment/proxy guard tests passed. The compiled Cloudflare artifact also passed local desktop/mobile hydration checks.

The owner explicitly approved keeping this release scoped with the independently demonstrated existing repository-wide lint failures documented. Changed UI files have zero lint errors. Every remaining lint-error file is unchanged from the base after newline normalization. Detailed counts and the non-blocking warnings are in the verification report; no lint configuration or rule was weakened.

The new release overlays four compiled API modules and their declarations onto the verified existing Linux release. Installed Linux dependencies and locked production dependency bytes are preserved; no Windows node_modules are shipped. The source/build was verified locally, not claimed as a newly completed hosted Linux CI run. The archive, module hashes and release manifests were checked before promotion.

1. Payment sandbox promoted first after a private database backup. All **109 public table row counts** matched while its API/worker were stopped.
2. Hosted sandbox API smoke passed verified Learner login/access checks; private draft resume and atomic Tutor selection; optional draft photos; no automatic publication after a clean upload; explicit free publication without identity review; title validation on RESUME; pause/resume; and archive/delete. Temporary fictional ads were archived.
3. The **compiled Cloudflare frontend** was tested at **1440 and 390px** against the deployed sandbox over HTTPS. An operator-only browser API bridge retained the sandbox's configured origin; deployed origin configuration was not changed. Learner dashboard, saved private Tutor edits, explicit publication, unpublish and delete passed with no page errors or horizontal overflow.
4. Main staging promoted only after those checks. Fresh encrypted backups succeeded before and after promotion. The installed release operator verified all **38 immutable migrations** without mutating the database. All **109 table row counts** matched while services were stopped.
5. Matching Cloudflare frontend published, then its actual public homepage, sign-in, API proxy and anonymous Tutor guards were checked at desktop/mobile widths.

The authenticated staged browser journey above is a compiled-frontend/real-sandbox integration check, not a claim that real main-site users or identity documents were modified. Main-site checks were anonymous plus read-only verification of existing public ads.

## Runtime and data preservation

Both hosted databases are PostgreSQL 16, already at migration 038. Source migration hashes match the immutable hosted files. The onboarding-draft table references users and allows steps 0 through 4. **No migration, backfill or new environment variable is needed.** Main ClamAV is active and responds to scanner PING; main runtime remains production-mode staging with payments disabled. Sandbox retains capture mail, test scanning and Razorpay test mode.

Both main staging ads returned **HTTP 200 before and after** and retain the same stored ID/revision/status fingerprint. Five stored sandbox PUBLISHED rows already returned 404 before this work and retain the same fingerprint/statuses afterward; these were not counted as five live ads or silently repaired. Smoke tests intentionally add fictional sandbox account/history rows through the APIs, then archive their ads and pause the profile; the no-row-change statement applies to code promotion, not to subsequent authorized smoke actions.

All four API/worker processes are active and their actual working directories resolve to the new release. Installed module checksums match the tested artifact. Protected runtime configuration digests are unchanged except the intentional `RELEASE_ID` update. Main backup status is success. A reviewed previous-template CloudFormation change set refreshed only the existing operator SSH IPv4 /32; no resource was replaced.

The compute stop timer remains **10 November 2026, 15:55:48 IST / 10:25:48 UTC**. Temporary backend upload copies were removed after verification; rollback releases and protected backups remain. Local test stacks were stopped cleanly and their PostgreSQL data retained. Root HEAD, Git status and all 15 recorded source/handoff file hashes remain unchanged. Source changes remain on the isolated branch, not merged into the root checkout or pushed as part of this release.

## Remaining limits and production boundary

- The configured backend targets identify as `APP_ENVIRONMENT=staging`. No separately configured and approved production target was established, so **no commercial production rollout was performed**.
- Repository-wide lint debt remains under the owner's explicit scoped-release exception.
- The inherited built-performance lab/LCP measurement was not run; desktop/mobile workflow and Cloudflare hydration/layout checks passed.
- Main scanning was checked for configuration and connectivity; fictional portrait uploads were confined to the sandbox. No real main account, identity document, payment or ad was changed for smoke acceptance.

## Rollback

Previous Cloudflare version: `c9bf7796-7df8-4589-8f32-26353444e94a`.

Previous compatible backend: `/opt/tutoring/releases/audit-product-bugs-20261105-c3c51708bcbc`. Protected environment and sandbox unit rollback copies carry `.before-unified-onboarding-20261106-464c9fe50fa0`. Stop the affected API/worker pair, verify the previous artifact and immutable migrations, restore the appropriate current pointer/WorkingDirectory and release IDs, restart, verify health and backups, then deliberately reopen traffic. Coordinate frontend/backend rollback because their photo gates now agree. Do not overwrite later credential/configuration edits with an older whole-file copy. No database restore is required for this code-only release; newly recorded Tutor roles and retained history must not be erased.
