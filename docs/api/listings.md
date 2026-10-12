# Teaching offers and availability

Task 07 adds `/tutor/listings` for Tutor-owned offers and `/staff/listings` for Trust/MFA review. A Listing represents exactly one Subject, Learner Level, optional Curriculum and optional Exam Track within one Learning Domain; it does not form a cross product of profile tags. Tutor evidence approval is separate from Listing publication approval. Task 08's [public discovery guide](discovery.md) describes search and detail pages.

## Offer fields and validation

The owner endpoint also returns `eligible_subject_ids`, calculated with the same current identity/Subject qualification gate used by creation. The new-offer UI shows those approved Subjects and initializes from a matching Subject/domain rather than assuming Physics. Missing or stale approvals disable new-offer submission and link to evidence review; an older API response without this metadata shows a refresh message instead of crashing. Existing draft editing remains available for corrections, and all commands still recheck server authority and publication requirements.

An offer has a title (10–100 characters), description (40–1500), domain/Subject/level IDs, optional Curriculum/Exam IDs, one to three distinct Teaching Languages, `ONLINE` mode and `INR` currency. Catalogue terms must be active, correctly typed and associated with the chosen domain. School offers require a Curriculum; entrance offers require an Exam Track. Seeded JEE tracks allow Mathematics/Physics/Chemistry; NEET allows Physics/Chemistry/Biology. ICSE/ISC class boundaries are validated. New/custom taxonomies still need staff review of the exact proposed combination; the system does not claim a comprehensive national syllabus compatibility database.

Tuition rates are integer paise, ₹1–₹100,000 per hour or per lesson. Per-lesson offers must specify 30–180 minutes; hourly offers omit a lesson duration. Trials are NONE, FREE or PAID; free/paid trials require 15–90 minutes and only paid trials include a separate price in integer paise. These are application limits, not recommended market prices. Tuition/trial fees are paid directly to the Tutor; no lesson payment or booking is created. Obvious email/phone/link patterns are rejected in public offer text, with manual review responsible for other sensitive/encoded content.

## States and versions

Creation requires an active verified Tutor with current identity and matching Subject evidence approvals. Up to twenty offers per Tutor are allowed. New offers are DRAFT. Owner SUBMIT moves a draft/corrected offer to REVIEW. Trust staff can APPROVE to publish or request CHANGES_REQUESTED with a reason. Every content save starts a new draft and clears publication approval, including commercial/text changes. Edits never remain public while waiting for approval.

An approved published offer can PAUSE and RESUME. Resume rechecks identity/Subject evidence, current profile revision and taxonomy; a stored approval alone does not authorize availability. Every command increments an optimistic `revision`; edit/action/review/safety requests supply the expected revision and stale commands return 409. Approval versus edit serializes under owner/profile/Listing locks, so a stale review cannot publish edited content.

Changing a Tutor profile invalidates the Listing's profile revision binding. Previously submitted/published/paused offers read as CHANGES_REQUESTED and unavailable until the owner completes the new evidence review, saves the offer again and resubmits. Evidence expiry/revocation, removed Tutor role, inactive account or inactive taxonomy also block availability at read/use time. Temporary catalogue/account restoration may restore availability where the underlying publication/profile approval remains valid; it does not override a safety suspension.

SAFETY_SUSPENDED is an independent staff restriction, preserved even if the owner edits the content. Submit/resume cannot bypass it. Only Trust staff with active MFA and a reason can lift it; self-review/lifting one's own restriction is denied. Suspending a published offer first pauses it. Lifting never automatically republishes: the owner explicitly resumes an otherwise eligible approved paused offer, or submits an edited draft for review. Decisions append actor, outcome, reviewed revision, reason and time to history; inspection and transitions are audited.

## API

All private writes require same-origin strict JSON and HttpOnly account cookies; staff also require their bound MFA cookie.

| Method/path | Body / behavior |
|---|---|
| GET `/v1/me/listings` | Own offers, effective states/availability and current `eligible_subject_ids` for creation |
| POST `/v1/me/listings` | Strict offer fields; create draft |
| POST `/v1/me/listings/:id` | `{revision,offer}`; save revised draft |
| POST `/v1/me/listings/:id/actions/:action` | `{revision}`; SUBMIT, PAUSE or RESUME |
| GET `/v1/staff/listings` | Trust/MFA queue, maximum 100 most recently updated cases |
| POST `/v1/staff/listings/:id/inspections` | `{reason}`; audited staff case inspection |
| POST `/v1/staff/listings/:id/reviews` | `{revision,outcome,reason}`; APPROVE or CHANGES_REQUESTED |
| POST `/v1/staff/listings/:id/safety` | `{revision,action,reason}`; SUSPEND or LIFT |
| GET `/v1/listings/:id` | Only currently available offers; unavailable/unknown returns 404 |

Public responses whitelist offer terms and an accurate evidence-review disclaimer. They exclude account IDs, emails, private birth dates, documents, reviewer identity and private safety reasons. HTTP responses are no-store. `ListingsService.requireAvailable(client,id)` is the locked availability seam for discovery and later Contact Request/payment commands; those modules must recheck availability at their own authorization boundary and never trust a browser result or stored status.

## Local testing

Use separate fictional Tutor and Trust reviewer accounts. Complete Tutor evidence approval first, then create a draft at `/tutor/listings`, submit, inspect and approve at `/staff/listings`. Refresh the Tutor's saved offers. Pause/resume, edit/resubmit, and staff safety suspension/lift can all be tested without a payment provider. Fictional evidence remains nonproduction-only; real scanning/privacy/launch dependencies from task 06 still apply.
