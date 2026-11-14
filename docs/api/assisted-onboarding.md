# Assisted Tutor onboarding

ADR0018. A Tutor asks the team to set up and publish their profile; Support staff do it for them.

Tutor page: `/tutor` → **Send my details to the team**. Staff page: `/staff/tutor-onboarding` (staff console → Service → Tutor onboarding; `SUPPORT` scope with MFA).

## Tutor routes

Every route needs a signed-in, unrestricted account.

| Method/path | Behaviour |
|---|---|
| GET `/v1/me/tutor/onboarding-help` | `policy` (`consent_version`, the consent sentences) and the account's latest `request` or `null` |
| POST `/v1/me/tutor/onboarding-help` | `{request_key, whatsapp_number, note?, adult_confirmed:true, team_publication_consent:true, photo_public_consent:true}`. The number is 10–15 digits with an optional `+`; spaces, brackets and dashes are removed. The note is at most 500 characters. One active request per account (409 `ACTIVE_REQUEST`). The same key returns the original; a different payload returns 409. Limited to 5 a day |
| DELETE `/v1/me/tutor/onboarding-help` | `{}`. Withdraws the active request (404 if none). Staff access ends immediately |

A request has `id`, `reference` (`TM-` and six characters, for the Tutor to quote on WhatsApp), `status` (`OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), `whatsapp_number`, `note`, `revision`, timestamps and `cancelled_by` (`TUTOR`, `STAFF`, `ERASURE`).

## Staff routes (`SUPPORT` scope with MFA)

| Method/path | Behaviour |
|---|---|
| GET `/v1/staff/tutor-onboarding?status=ACTIVE\|COMPLETED\|CANCELLED` | Audited. Up to 100 requests (active ones oldest first) with the Tutor's `display_name`, `email`, contact, consent and the assignee |
| POST `/v1/staff/tutor-onboarding/:id/actions` | `{operation, revision, reason?}`. `CLAIM` (open, or take over a claimed request), `RELEASE` (back to open), `COMPLETE` (claimed only; `reason` is kept as the staff note) and `CANCEL` (open or claimed; `reason` of 10–240 characters required). A stale revision or invalid state returns 409. Staff cannot act on their own request (403 `SELF_ASSIST`) |

### Acting for the Tutor

While a request is `IN_PROGRESS`, these routes mirror the Tutor's own `/v1/me/...` routes and call the same services with the same bodies and responses. Otherwise they return 409 `REQUEST_NOT_IN_PROGRESS`.

| Staff route under `/v1/staff/tutor-onboarding/:id/as-tutor` | Tutor's own route |
|---|---|
| GET `/tutor` | GET `/v1/me/tutor` |
| POST `/tutor/introduction` | POST `/v1/me/tutor/introduction` |
| POST `/tutor/publication` | POST `/v1/me/tutor/publication` |
| GET / POST `/tutor/presence` | GET / POST `/v1/me/tutor/presence` |
| GET / POST `/tutor/photo`, GET / DELETE `/tutor/photo/:photoId` | the same under `/v1/me/tutor/photo` |
| GET / POST `/listings`, POST `/listings/:listingId`, POST `/listings/:listingId/actions/:action` | the same under `/v1/me/listings` (`SUBMIT` is not offered) |

Staff cannot change `public_email_consent` (403 `TUTOR_CONSENT_REQUIRED`). Each staff HTTP request writes one `TUTOR_ONBOARDING_ASSISTED_ACTION` audit event with the request, Tutor and action; the Tutor's `TUTOR_INTRODUCTION_SAVED` and `TUTOR_PUBLICATION_*` events carry `assisted_by`. Queue views and request actions are audited as `TUTOR_ONBOARDING_QUEUE_VIEWED` and `TUTOR_ONBOARDING_<OPERATION>`.

## Storage and privacy

Migration `041-assisted-tutor-onboarding.sql` adds `tutor_onboarding_requests`, with one active request per account. The contact details are encrypted. Production hides fixture (`test_only`) requests. Privacy export lists the requests with their consent and contact; account deletion cancels an active request and erases the contact and staff note.

## Tests

`apps/api/test/assisted-onboarding.test.ts` covers consent and validation, idempotency, the Support-only queue, claiming, taking over and releasing, the full assisted journey through a public ad, the public-email consent boundary, audit attribution, withdrawal ending access, cancellation reasons, stale revisions and self-assistance. `privacy.test.ts` covers export and deletion.
