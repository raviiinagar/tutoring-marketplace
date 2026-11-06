# Direct Tutor publication

Policy `direct-ads-v1` implements [ADR0014](../adr/0014-free-direct-ad-publication-and-optional-identity.md). It supersedes the prior identity-review and Tutor Pro requirements for ads; Learner Access authorization and the separate consented-public-email rule remain unchanged.

## One onboarding journey, and who may open it

There is a single teaching onboarding flow. Legacy version 1 profiles and current version 2 profiles are edited through the same wizard; the separate legacy editor has been removed.

**No role is chosen at sign-up.** Any signed-in account may open the teaching workspace and read its own (absent) draft. `GET /v1/me/tutor/onboarding-draft` therefore returns `{draft: null}` rather than `403` for an account that has never taught. The `TUTOR` role is recorded the first time the owner saves a private draft (`POST`) or an introduction, audited as `TUTOR_ROLE_SELECTED`. The account keeps `LEARNER`, so one account both learns and teaches.

**Workspace access is not publication.** Holding the role, a profile or a draft means only that the owner has started; none of it is visible to learners. Visibility requires an explicit publication action, and the workspace states plainly when nothing is published.

**Legacy profiles keep their data.** Saving through the unified introduction records `onboarding_version = 2` in place and preserves `encrypted_birth_date`, `public_id` and `created_at`; the stored adult declaration is carried across rather than re-asked. An ad that is already online is never unpublished by that upgrade. Covered by `apps/api/test/listings.test.ts`.

**Resuming.** A private draft wins over the saved profile, because it is the newer working copy. Otherwise the saved profile seeds the same fields. The wizard opens at the draft's stored step, or at the first step whose details are still missing; a complete introduction opens on Review, which only saves.

## Profile facts and actions

`GET /v1/tutor-policy` exposes `publication_policy`, `identity_optional: true`, and `free_publication: true`. `GET /v1/me/tutor` preserves identity review `profile.status` and adds:

- `publication_status`: `DRAFT`, `PUBLISHED`, or `PAUSED`.
- `publication_restricted`: a staff hold that the owner cannot clear by editing or replacing identity evidence.
- `adult_declared_at`: the owner's adult declaration, not identity verification.
- `identity_verified` and `identity_label`: derived only from an actual current approved adult-identity claim and clean eligible evidence.
- `eligible`: current public publication, account/safety, adult declaration and subject eligibility; optional identity approval does not control this value.

Saving an introduction remains separate from publication. `POST /v1/me/tutor/publication` accepts `{expected_public_revision, action: "PUBLISH" | "PAUSE"}`. Publication requires a complete adult introduction with active declared Subjects and a non-empty description of the Tutor's experience. There is no word minimum on that text. It never changes identity status to `APPROVED`.

`POST /v1/staff/tutors/:id/publication-restrictions` accepts `{action: "SUSPEND" | "LIFT", reason}`. Existing Trust scope, staff elevation, target authorization, reviewer independence and auditing apply. Suspension pauses visibility. A lift clears the hold but does not publish automatically. Current adverse identity rejection/revocation places a hold; pending optional review alone does not pause an already published free profile.

## Ads

`GET /v1/me/listings` exposes the policy metadata above, current `eligible_subject_ids` even for a complete private introduction, and the truthful existing `tutor_pro_active` fact for the separate contact product.

Creating an ad saves a private draft without Pro or identity approval. `POST /v1/me/listings/:id/actions/:action` accepts an exact `{revision}` and:

- `PUBLISH`: validates at least 12 title words and a non-empty class description, requires a usable profile photo, then publishes the ad and its complete introduction atomically. `SUBMIT` is a compatibility alias for this explicit owner publication action; it no longer creates a new review queue item.
- `PAUSE` and `RESUME`: hide or restore an eligible ad. `RESUME` is a publication transition, so it also requires a usable photo. Previously staff-approved legacy ads can resume without rewriting their old text.
- `ARCHIVE`: soft-removes the ad and advances its revision. The history, requests and established safe Connections remain. Archived ads cannot be edited, resumed or republished by owner endpoints.

## Profile photo and publication

A usable profile photo is required to put an ad online and is never required to keep a private draft. "Usable" means an approved photo, or a self-published pending one, whose scan status is `CLEAN` — the same predicate the public portrait uses. Staff approval is not required, so this adds no review queue and does not weaken ADR0014's free direct publication.

Uploading a photo never publishes anything. It changes no listing status, and an ad stays `DRAFT` until an explicit `PUBLISH`. Both halves of that rule are covered by `apps/api/test/listings.test.ts`.

The requirement applies to transitions that put an ad in front of learners (`PUBLISH`, `SUBMIT`, `RESUME`). It is deliberately **not** applied when editing an ad that is already online, so existing live ads are never blocked or unpublished by this rule.

Online ad edits take effect immediately after validation, retaining the online state. They do not undo a profile pause. Staff safety holds remain authoritative. Historical `CHANGES_REQUESTED` ads require an owner revision before publication. Private drafts stay private until an explicit publication action. Title maximum is 160 characters; the existing class description maximum remains 1,500 characters.

Listing `publication_policy` distinguishes owner-authorized `direct-ads-v1` from historical `review-v1`. Owner publication does not fabricate `approved: true`, `reviewed_by` or a staff decision. Discovery, public details, new enquiries and acceptance share current eligibility checks without a Tutor Pro advertising gate. Learner coverage, deadlines, payment activation/refunds, block checks and Connection authorization are retained. Taking a profile offline or archiving an ad does not delete an established safe Connection.

## Portraits, contact and migration

Portrait policy adds `auto_publication: true`. A new clean portrait with explicit public consent has `self_published: true`; its staff status remains `PENDING` until a real review. It can appear on an eligible public profile/ad after scanning. Rejected/removed photos and unsafe/test-only production assets stay hidden. No identity or teaching-quality badge follows from a clean photo scan.

Public email still requires explicit consent, verified account email, a currently eligible ad and current Tutor Pro. Free ads alone never expose contact details.

Migration038 is additive. It preserves the historical required adult declaration from existing saves, without labelling it verified. Previously eligible approved non-test identities retain public publication. Test-only, draft, pending, revoked and rejected historical cases are not automatically published; adverse cases retain a separate staff hold. Existing identity decisions, payment records and ad history are not rewritten. Privacy export includes the new publication facts, and erasure pauses publication and clears the adult declaration.
