# Audit product fixes deployed - 5 November 2026

Live site: https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev

Frontend version: **`c9bf7796-7df8-4589-8f32-26353444e94a`**, from tested application tree `8e4b993`. Main and payment-sandbox backend release: **`audit-product-bugs-20261105-c3c51708bcbc`**, from backend fix `c3c5170`. [Sanitized deployment evidence](evidence/audit-product-bugs-deployment-2026-11-05.json), [local regression results and remaining findings](../qa/audit-product-bugs-2026-11-05.md).

## Release scope and preservation

The backend overlays only `apps/api/dist/listings.js` onto the actual deployed Linux base **`first-account-20261105-12817186c2ec`**, preserving its newer account functionality. The base's module matched the trusted prior artifact, and the normalized compiled diff contains only the movement of `publishable(row.payload)` into the shared publication path. The candidate manifest verified all 465 entries. No dependencies or migrations were added.

Archive SHA256: `2789e9f39675670fde68a86fe27af7c389cfb434a7d58567f3bcd7319a72d4cb`. Installed listings module SHA256: `b15f8a2c23de50f31041c24e2266d41ff098e38d237a790e0e9648b355d7283c`.

Sandbox promotion succeeded first after a private database backup. Main promotion followed successful fresh encrypted backups before and after the switch. Both promotions verified unchanged row counts across all 109 public application tables, retained 38 applied migrations and applied zero new migrations. Protected runtime configuration digests matched, excluding the intentional release-ID change. All four API/worker processes are active and their actual process working directories resolve to the new release.

The existing AWS login session was renewed. A reviewed previous-template CloudFormation change set refreshed only the operator SSH IPv4 /32 on the existing `SshOnly` security group, without resource replacement. The API/HTTPS configuration and compute deadline were preserved. The active `tutoring-test-stop.timer` still stops compute on **10 November 2026 at 15:55:48 IST / 10:25:48 UTC**.

The root checkout's source and uncommitted changes were preserved. Deployment used the isolated fix worktree. Temporary archive/operator upload copies were removed from the host after verification; rollback releases and protected backups remain.

## Hosted verification and limits

- Cloudflare homepage, sign-in HTML, API health and catalogue returned 200; anonymous `/v1/me` returned 401. Private/API responses retain `no-store`.
- The actual published `/assets/styles-miV5YshL.css` returned 200 and contains #f4545b for the account wordmark and search icon. The tested wordmark contrast is 3.35:1 against white.
- Direct main `/v1/health` and payment-sandbox `/payment-sandbox/v1/health` both returned 200 after promotion.
- Runtime process directories and the installed module checksum match the reviewed artifact; the main backup service reports success.

Hosted checks did not create or edit real Tutor ads, accounts, identity evidence or payments. Authenticated invalid-RESUME behavior was verified by the existing isolated PostgreSQL/API regression and transition probes, then tied to the exact deployed compiled module by checksum. This is not a claim that a real hosted Tutor's ad was mutated for acceptance. The separately documented legacy staff-APPROVE content bypass and three stale API cases remain unchanged.

The existing Netlify URLs were not redeployed; the frontend release above is on the Cloudflare URL.

## Rollback

Cloudflare's previous version is `26be40b0-35f4-4300-a1ff-279aa740f9ed`; use the existing Worker version rollback mechanism if a frontend rollback is needed.

The previous backend release remains `/opt/tutoring/releases/first-account-20261105-12817186c2ec`. Root-only API/backup environment copies and sandbox unit copies use the suffix `.before-audit-product-bugs-20261105-c3c51708bcbc`. A backend rollback stops the affected API/worker pair, restores the prior release pointer/WorkingDirectory and release IDs, then restarts and verifies health and backup success. This release made no schema change, so it requires no database restore. Preserve subsequent unrelated runtime edits when rolling back later; do not blindly overwrite changed credentials, payment rules or authentication policy with an older whole-file copy.
