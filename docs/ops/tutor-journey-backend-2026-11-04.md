# Tutor drafts and reputation backend release - 4 November 2026

The existing AWS test main and payment sandbox now run `tutor-journey-20261104-e28f64fa8a6f`, built from source commit `e28f64fa8a6f9d9729ab38dc22dad635e781a0e7`. Overlay SHA256: `91ccaa64b46d851be8c9d412f8cab42dcd9bc4f95caa36d81dcdc66484296125`.

## Deployment boundary

- Verified Linux base `discovery-20261102-ca16ae99b8db`; its lockfile digest matched the reviewed package. Twelve allowlisted files were overlaid: compiled JS/declarations for the application registration, onboarding drafts, reputation and privacy inventory/erasure, plus additive migrations 036 and 037. No dependencies or Windows native packages were copied. Candidate manifest verified 459 files.
- Sandbox promotion came first after a fresh private database dump. Its API and worker were active, migration total 37, new table privileges correct, public health HTTP 200 and anonymous draft/progression requests HTTP 401 before main promotion.
- Main promotion used successful fresh encrypted backups before and after migration. Existing migration-role configuration applied the two new migrations; the app received only SELECT/INSERT/UPDATE/DELETE on the three new tables, and the existing backup role received SELECT. Both main services, both sandbox services, Caddy and the stop timer were active after promotion.
- Existing row counts for users, Tutor profiles, claims, evidence and teaching offers were unchanged in both databases. Main new draft and recommendation tables remained empty after deployment. No account, evidence, review, badge or payment was seeded into either hosted database.
- Protected runtime configuration digests, excluding the intentional `RELEASE_ID` update, were identical before and after. Existing main/sandbox payment configuration, MFA rules, exact origins, account credentials and privacy policies remain intact. The compute stop remains **10 November 2026 at 15:55:48 IST**.

## Acceptance

The committed backend was rebuilt before packaging; package provenance verifies the committed source bytes for all five modules and both migrations. Backend typecheck and the three real PostgreSQL draft HTTP integration tests passed before release. The separate reputation tests and full local desktop/mobile journey are recorded with the feature acceptance report.

Main direct API and the Cloudflare same-origin proxy returned HTTP 200 for `/v1/health`, and HTTP 401 for anonymous `/v1/me/tutor/onboarding-draft` and `/v1/me/tutor/progression` using the normal Node network stack. Cloudflare rejected Python urllib's default user agent with edge error 1010; that did not reproduce with Node. This smoke is not an authenticated hosted mutation test.

Drafts are private encrypted records and never publish profiles. Recommendation moderation and fail-closed badge eligibility follow the source implementation; existing identity and teaching-offer approval rules were preserved. The old pre-036 runtime must not be blindly restored against these migrated databases: use a compatible forward release or an explicitly planned database restore.

Ignored operator artifacts: `.local/package-tutor-journey.py`, `.local/deploy-tutor-journey.py`, `.local/tutor-release-run.py`, `.local/tutor-journey-artifact.json`, and private before/after configuration-digest/aggregate-count evidence. Protected backups remain on the existing host; temporary upload copies were removed after verification.

## Forward correction after live status inspection

The final main and sandbox release is **`tutor-journey-20261104-14639768102f`**, source `14639768102fe67a6d96822b78ac6a7f8df20d21`, overlay SHA256 `90700a3feeafc80fcb6739427388d3047d01f7941f38020c2feb2dcdaaa19c02`. It derives from the verified first release above; the allowlisted overlay retains the unchanged draft/privacy/application modules and already applied migrations. Both databases verified all 37 migrations with **zero new migrations applied** during this correction.

Live status-checklist evidence added photo and word-quality prerequisites to the next level. Saved current-profile teaching text can qualify while an offer is paused or Pro has expired; commercial state alone does not remove a badge. These progression minima do not rewrite or hide existing identity-approved introductions. Super Teacher and Ambassador remain gated by unresolved verified criteria.

The same sandbox-first, backup-before-and-after process succeeded. Both API/worker pairs remain active, the main backup reports success, and hosted draft/recommendation tables remain empty. The actual `tutoring-test-stop.timer` remains scheduled for **10 November 2026, 15:55:48 IST**. An initial smoke queried a nonexistent shorter timer name; the subsequent exact-unit/list-timers check confirmed the real timer.

The operator's network address changed during this work. A reviewed previous-template CloudFormation change set updated only the existing SSH security group's operator IPv4 `/32`, with no replacement. HTTPS, compute and deadline parameters were preserved. No new resources or billing-plan changes were made. Private remote candidate upload copies are removed after final verification; forward-release helper files remain in ignored `.local/`.
