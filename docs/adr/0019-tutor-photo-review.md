# Tutor photos need staff approval before they appear

On 14 November 2026 a site review found a stock-image cartoon with a visible watermark and a full-body street photo shown as Tutor portraits. Under ADR0014 a consented portrait appeared publicly as soon as its safety scan passed. The owner decided that photos should be checked by the team before they appear. This amends ADR0014's photo rule only.

**The switch.** `PHOTO_REVIEW_REQUIRED=true|false`. Unset, it is on in production and off elsewhere, so the hosted service reviews photos without extra configuration and local test suites keep the earlier behaviour. Any other value stops the API from starting.

**With review on.** A newly uploaded portrait is stored as pending and is not self-published. It is not shown on the public profile, ads, cards or Connections until a Trust staff member approves it in Portrait reviews (`POST /v1/staff/tutor-photos/:id/reviews`, `APPROVE`). A clean photo awaiting review still satisfies the publication requirement, so a Tutor can publish an ad straight away; it shows their initials until the photo is approved. A rejected photo never appears and no longer satisfies the requirement. Photos already approved or self-published before this change stay as they are.

**Clients.** `GET /v1/me/tutor/photo` and the upload response add `publishable` to the photo, computed with the same rule the server uses to allow publication, and the photo policy reports `auto_publication: false` with a notice explaining the review. Assisted onboarding (ADR0018) uploads follow the same rule.

**Not changed.** Scanning, consent, removal, the Trust review queue, identity verification and the Tutor level's public-photo requirement are unchanged. Approval says only that the photo is suitable; it is not identity verification.
