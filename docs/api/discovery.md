# Public Tutor discovery and offer detail

Task 08 connects `/tutors` search and `/tutors/:listingId` public detail pages to approved, currently available teaching offers. A result is one precise Listing, not a unique Tutor count: a Tutor can have several independently approved offers. Catalogue coverage does not imply actual supply. Empty searches show no fabricated Tutor cards, ratings, reviews or checkout.

## Filters and pagination

`GET /v1/discovery` accepts strict query-string fields:

| Field | Meaning |
|---|---|
| `domain_id` | Learning Domain |
| `subject_id`, `level_id`, `curriculum_id`, `exam_id` | Exact fields on the same offer |
| `language_id` | One of the offer's declared Teaching Languages |
| `rate_unit` | HOUR or LESSON |
| `min_rate_paise`, `max_rate_paise` | Inclusive integer-paise INR bounds; require an explicit rate unit |
| `cursor` | Last scanned public Listing UUID; only IDs strictly greater are considered |
| `limit` | Integer 1–24, default 12 |

Unknown fields, repeated query values, malformed IDs/numbers, inactive/mistyped terms and incompatible domain/term selections return 400. A valid combination with no available offer returns an empty list. All predicates apply to the same Listing: CBSE Physics plus a separate JEE Mathematics offer never produces a JEE Physics result. Price filters cannot compare hourly and per-lesson amounts implicitly; lesson duration remains displayed.

Responses contain `offers`, `next_cursor`, `limit`, `order: listing_id_ascending` and `price_currency: INR`. UUID ordering provides a deterministic tie-free keyset. Repeating a query against unchanged facts returns the same page; subsequent pages exclude the cursor and earlier IDs. Across requests, changing availability can remove results and newly inserted IDs before a cursor require a fresh first-page search. There is no claimed immutable multi-page snapshot or total Tutor count. In the exceptional case where a shortlisted profile fails decrypted adult-age validation, the page can contain fewer than its limit; the cursor still advances over the scanned rows.

Filters/cursor are reflected in the UI URL, with clear filters, first/next-page controls, loading/error/retry and accessible empty states. Filter changes start a new first page. Request sequencing prevents a slower old response replacing a newer search. Mobile layouts use stacked filters/cards and preserve the existing reduced-motion treatment.

## Eligibility and privacy

Search and `GET /v1/discovery/:listingId` read one repeatable-read, read-only PostgreSQL snapshot. The projection requires published approved unsuspended Listing, current approved Tutor profile/revision, active verified Tutor account/role, clean unexpired identity/adult and matching Subject evidence, non-test evidence in production, and active correctly typed/domain-associated catalogue options. The private encrypted birth date is checked internally for adult age and never returned. Snapshot-based browsing can become stale after a later committed change; it does not authorize a Connection or payment.

The transaction command seam remains `ListingsService.requireAvailable(client,id)` for future requests/payment actions. It locks current owner/profile/Listing facts and rechecks authoritative eligibility at that action's boundary. Client search/detail responses and cached public status must never authorize sensitive work. Paused/suspended/revoked/expired/disabled/stale-profile offers disappear from search and return 404 on public detail. Focus or explicit refresh reloads detail availability; unavailable pages offer a return to search.

Public responses explicitly project Listing ID, safe public Tutor display name, approved offer terms, availability and controlled evidence labels with review/expiry dates. Labels describe identity/adult-status and matching Subject qualification/experience evidence; they do not expose free-text private reviewer notes or claim descriptions. Names accidentally containing obvious contact patterns fall back to `Tutor`. Account IDs/emails/phones, private birth dates, evidence/claim IDs or bytes, staff identities, reasons and tokens are excluded. Public responses are no-store. Qualification authenticity, teaching quality and learning outcomes are not guaranteed by these labels.

Migration 008 adds partial published-offer indexes for domain, Subject/Exam, unit/price and Teaching Languages, plus current approved claim lookup. This provides index support, not measured performance or load certification; those release gates remain task 27.

## Scope and local verification

Homepage/header and catalogue domain dialogs link to real search. Detail shows the exact combination, hourly or duration-specific lesson rate, free/paid/no trial terms, languages and evidence-review expiry. Contact requests are not available yet; no placeholder checkout creates paid access. Availability notifications are task 09 and Contact Requests follow task 10. Rendered SEO/release metadata work remains task 24; these initial React discovery pages fetch on the client.

Run tests with isolated fictional evidence/reviewer fixtures. Existing locally approved/published offers appear without generating fake production supply. Live evidence scanning, privacy approval, SMTP and other external launch dependencies remain unchanged.
