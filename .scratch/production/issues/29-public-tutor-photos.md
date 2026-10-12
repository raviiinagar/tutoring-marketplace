# 29: Upload, review and publish Tutor portraits

Status: ready-for-agent
Resolution: completed (12 October 2026)
Type: task
Blocked by: 03 — Scoped staff MFA; 06 — Adult Tutor evidence review; 08 — Public discovery

The alignment review identified that accepted Tutor images had no implementation owner. The owner instructed fixing all review findings; this additional slice closes that scope gap without renumbering the existing dependency chain.

## Acceptance criteria

- [x] Tutor owners explicitly consent to public portrait display, upload bounded decoded JPEG/PNG images and privately inspect current status.
- [x] Scanning and image processing exclude unsafe/invalid content; originals/location metadata are never published and test assets cannot appear in production.
- [x] Trust staff with MFA inspect with an audited reason and approve/reject/revoke a specific immutable photo; self-review and unrelated permissions are denied.
- [x] Only approved photos on currently eligible offers appear in search/detail; pause, suspension, revoked evidence, replacement and removal invalidate subsequent delivery.
- [x] Photos remain separate from private identity evidence, and replacement/removal clear stored image payloads. Task 23 handles full export/erasure and approved historical retention.
- [x] PostgreSQL/API and mobile browser evidence covers publication, ownership, review, content validation and public invalidation.

## Verification evidence

Migration 012 and the separate photo service/controller implement the owner, staff and public photo flows. Sharp is pinned as a direct API dependency. Inputs are bounded to 1 MiB/four million pixels, decoded and re-encoded to a metadata-free 640×800 JPEG, scanned, encrypted and held pending Trust approval. No original photo is persisted. Current discovery eligibility and approved photo state gate image delivery. Public asset URLs are specific to Listing/photo IDs and do not grant identity-evidence access.

Four new API scenarios passed: private-before-approval/public-current-eligibility, replacement/removal/ownership and byte clearing, input/scanner/reviewer rejection, and production fictional-asset exclusion. The first scenario was extended to assert direct public-photo denial during Listing suspension and evidence expiry, and passed again. Ownership, self-review, unrelated staff scope, approval replay, expired supply, metadata stripping and no-store delivery are covered. Photo edits preserve separate identity/offer approvals.

All eight Edge browser journeys passed in one 7.3-minute run. The expanded Tutor journey uploads a synthetic portrait from the UI, previews and approves it using another Trust account, checks status and verifies a decoded public mobile photo card. A 390px screenshot was inspected and no horizontal overflow was asserted. Nine UI tests and final root build/typecheck passed; both runtime dependency audits reported zero vulnerabilities.

The wider 85-scenario API regression passed 84 scenarios on the initial full run; its sole failure was a stale fixed migration count. After correcting it to compare persisted ledger facts, all 13 auth scenarios passed. All current API scenarios have passing evidence across those runs; no remaining failed product assertion is claimed resolved without a rerun. [Alignment correction evidence](../alignment-review.md).

Migration applied to the existing local database and the development stack restarted. Live scanner maintenance, approved retention/full erasure, production asset/recovery topology and deployment remain their existing release dependencies. Tasks 23/24 include photo coverage and depend on 29. [API/manual testing guide](../../../docs/api/tutor-photos.md).

## Comments

Source requirement: production spec line 119 and design map's Tutor image decision. Dependencies were already complete when the owner authorized this correction. Migration numbering remains chronological; migration 012 is photos, while implementation ticket 12 remains chat.

Photo queue follow-up (12 October 2026): the owner's screenshot showed an empty review screen. A read-only aggregate inspection confirmed zero photo records in the ordinary local database; automated photo fixtures had used a separate database. The review screen now distinguishes loading, an empty successful queue, permission failures and populated results. Empty guidance explains the Tutor portrait upload prerequisite and separate identity-evidence review; the reason field appears only when photos are listed. Refresh clears previous preview/results, and late responses cannot create a preview after unmount.

UI typecheck and production build passed. A local browser check exercised loading, empty, MFA denial, populated results and refresh-to-empty transitions, and asserted no mobile overflow; its mobile screenshot was inspected. These response-controlled UI checks do not claim changing the owner's account or creating photo supply. The existing real Tutor upload/review browser journey also passed in an isolated rerun (one journey, 2.5 minutes including startup). No API/domain command changed in this follow-up.
