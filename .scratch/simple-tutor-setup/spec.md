# One-form first Tutor ad

Owner request, 17 November 2026: replace repeated profile/ad questions with the simplest setup: one short form, a preview, then an explicit free publication action.

The form collects one Subject, relevant Learner Level and school board/exam, Teaching Language, mode (city/country only in person), public name, hourly rate and a single introduction reused for the first ad. Suggest an editable title meeting the existing 12-word rule. Do not promise a free trial by default; the preview clearly states no trial, and the existing ad manager retains trial editing.

Use the current catalogue and server services. Partial choices are stored in the existing encrypted onboarding draft, with an optional `quick_setup` field; no migration or new endpoint is needed. Draft/photo/preview actions never publish. An explicit Publish action remains subject to all current server checks.

Preserve existing profile fields, public-email consent, private identity data, other ads, financial records and availability settings. Reuse a saved suitable photo. A new photo needs existing explicit portrait consent and scanning; ADR0019 keeps it private until Trust approval, while a clean eligible pending photo can satisfy ad publication. Optional identity verification and Tutor Pro stay separate. The staff-assisted flow remains available as a secondary, collapsed choice.

Applicable decisions: ADR0014 (free explicit publication), ADR0013 (coarse location), ADR0015 (adult accounts), ADR0018 (assisted setup), ADR0019 (photo review). No change to publication validation, safety/ownership, permissions or commercial rules. After local verification, the owner authorized committing this isolated feature, pushing its branch, opening a PR and running CI. No deployment is requested.
