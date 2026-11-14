# 32: Assisted Tutor onboarding

Status: ready-for-agent
Type: task
Blocked by: 03 — Scoped staff MFA; 23 — Privacy export and deletion

On 14 November 2026 the owner asked for a second way to become a Tutor: send details and documents to the team on WhatsApp (8233598649) or email, and let any admin with Support access set up and publish the profile. The decisions are recorded in ADR0018, amending ADR0014.

## Acceptance criteria

- [x] On the Tutor page, a signed-in account can choose to send its details to the team. The request records the Tutor's WhatsApp number, an optional note and three consents (18 or older; the team may create, edit and publish the profile and ads; the photo may be shown publicly). The page shows a reference and a WhatsApp link to the team that quotes it.
- [x] One active request per account; retries are idempotent; requests are rate-limited. The Tutor can withdraw at any time, which ends staff access immediately.
- [x] Support staff with MFA see the queue with the Tutor's name, email, WhatsApp number and note, and can claim, take over, release, complete and cancel (with a reason) requests.
- [x] While a request is claimed, staff use the Tutor's own introduction and ad wizards for that Tutor, through the same services and rules, and can publish. Staff cannot change public-email consent, cannot work on their own request, and cannot act on a request that is not claimed.
- [x] Every staff view and action is audited with the staff member; the Tutor's introduction and publication records note who assisted. No identity verification or badge follows from assisted publication.
- [x] Privacy export includes requests with consent and contact; account deletion cancels an active request and erases its contact details.

## Comments

### 14 November 2026 — implementation evidence (branch `feature/assisted-tutor-onboarding`)

- `apps/api/test/assisted-onboarding.test.ts`: 2/2 pass against an isolated PostgreSQL. They cover consent and validation, idempotency, the Support-only queue, claim/take-over/release, the full assisted journey through a public ad, the public-email consent boundary, audit attribution, withdrawal ending access, cancellation reasons, stale revisions and self-assistance. Negative control: disabling the claimed-request check failed both tests; restored.
- Full API suite: 249 tests, 248 pass, 0 fail, 1 skipped (the existing PostgreSQL 16 recovery drill). `privacy.test.ts` covers export and deletion of requests.
- UI: typecheck clean, no new lint errors; 274/274 unit tests pass, including `assisted-onboarding.test.tsx`.
- Browser: `assisted-onboarding.spec.ts` passes — a Tutor sends the request, a Support admin claims it, completes the Tutor's own introduction and ad wizards (photo uploaded through the page), publishes, and completes; the Tutor sees the result. `unified-tutor-onboarding.spec.ts` still passes at 1440 and 390 px.
- Defect found and fixed: in the ad wizard, the photo uploader was a form nested in the wizard's form, so "Upload photo" submitted the page natively and reloaded it without uploading. This also affected Tutors' own ad wizard. The uploader no longer uses a nested form.
