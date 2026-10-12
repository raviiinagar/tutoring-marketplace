# Tutor photo workflow

Profile photos have their own storage and review lifecycle, separate from private identity evidence. Tutors create their adult profile first, then upload a portrait from `/tutor` with explicit public-display consent. Trust staff use `/staff/photos` with MFA and an inspection/decision reason. Approved images appear on currently eligible discovery cards and offer details.

## API

| Method | Path | Behaviour |
|---|---|---|
| GET | `/v1/me/tutor/photo` | Owner's current photo metadata and upload policy |
| POST | `/v1/me/tutor/photo` | JPEG/PNG base64 plus `public_consent: true`; scanned/processed, then pending review |
| GET | `/v1/me/tutor/photo/:id` | Owner-only processed JPEG preview |
| DELETE | `/v1/me/tutor/photo/:id` | Owner-only removal, idempotent for that ID |
| GET | `/v1/staff/tutor-photos` | Trust/MFA bounded review queue |
| POST | `/v1/staff/tutor-photos/:id/inspections` | Purpose-audited processed JPEG for a different Trust reviewer |
| POST | `/v1/staff/tutor-photos/:id/reviews` | `APPROVE`, `REJECT` or `REVOKE`, with reason |
| GET | `/v1/discovery/:listingId/photos/:photoId` | Public JPEG only while both image and exact offer remain eligible |

The API checks cookie authority, rejects client ownership fields and uses strict schemas. Owner upload/preview requires an active verified Tutor account and existing profile. Public image delivery repeats the same adult/identity/Subject/catalogue/Listing eligibility checks as discovery. Private image bytes and metadata never become identity evidence or grant publication rights by themselves.

Uploads are limited to 1 MiB, JPEG/PNG with matching decoded format, one frame, at least 128 pixels per side and at most four million pixels. Processing re-encodes a 640×800 JPEG, removes EXIF/GPS and appended data, and bounds output to 512 KiB. Scanning checks the submitted bytes before they can be persisted as a reviewable image; disabled/failed scanners never authorise publication. External scanning/processing runs outside database transactions, and actor authority is rechecked before commit. Six uploads per account/hour are allowed.

The image processor uses [Sharp's bounded constructor options](https://sharp.pixelplumbing.com/api-constructor/) and [metadata-free output defaults](https://sharp.pixelplumbing.com/api-output/). Sharp is pinned as an API dependency, rather than relying on the retained Next.js harness's transitive dependency.

Pending photos remain private. Approval is specific to an immutable photo ID. Replacement immediately withdraws the previous asset and clears its encrypted payload; the replacement needs a new review. Removal/rejection/revocation also clear image payloads. Subsequent image reads use `Cache-Control: no-store` and fail after removal or ineligible supply. A previously downloaded image cannot be recalled.

Photo edits do not invalidate identity/Subject evidence or approved offer content. Existing approved offer eligibility still determines whether any photo is public. Historical photo/audit metadata is subject to approved retention and full export/deletion in task 23; that task must cover `tutor_photos`, while task 26 must cover image payloads in recovery exports.

## Local fictional testing

With the existing nonproduction test scanner enabled, generate a safe synthetic image:

```powershell
node scripts/create-photo-fixture.mjs
```

Upload `.local/fictional-tutor-photo.jpg` from the Tutor page, inspect and approve it as a different MFA-enabled Trust account, then check a published offer. The sample is a colour block, not a claimed real Tutor portrait. The image and script use no real identity data. The helper refuses production execution; API/configuration and discovery separately refuse fictional scanners/assets in production.

Live portraits require the configured ClamAV scanner and actual operator review. Staff reasons/decisions and photo lifecycle changes are audited without image bytes. Production deployment, approved retention and real operational scanner maintenance remain their existing release gates.
