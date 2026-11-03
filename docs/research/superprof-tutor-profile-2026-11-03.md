# Tutor profile inspection and adaptation

Observed 3 November 2026 on [Superprof's public tutor profile](https://www.superprof.co.in/math-coach-for-igcse-gcse-core-cambridge-ncea-australia-curriculum-taught-for-students-across-countries-for.html). This is one sampled profile, not a claim about every tutor, account state or locale.

## Evidence

- REA MCP target discovery: `ev_93b8c378dac8826f199f87a492491ec46297363f578e27e7f4a53bb0ea2c3bf9` identified the selected profile URL and page title.
- REA MCP visible profile screenshot: `ev_4c3ba21ab26e65f0cb220c95117240814fa8a4736dc7970f6f145d9bdced33f4`. [Metadata, digest and limitations](evidence/tutor-profile/rea-desktop.json).
- REA follow-up screenshot: `ev_58549c8ddb6920a86c558c620595adfd42b30aa2ffc67ab8905ce4b7196be067`. The returned viewport was 1295×879 after reconnect; it does not independently establish the 390px mobile layout.
- Supplementary Playwright browser screenshots: [desktop](evidence/tutor-profile/reference-desktop.png), [scrolled desktop](evidence/tutor-profile/reference-scrolled.png), [390px mobile](evidence/tutor-profile/reference-mobile.png). These are browser fallback artifacts, not REA-produced screenshots. Public rendered text was also read with Playwright; no biography, photograph, reviews or assets were reused in the implementation.

The initial full passive capture stalled on an older tab, and the REA scenario provider returned `execution_failure`. Read-only REA doctor found aligned Codex registration. Navigation and viewport changes therefore used the existing Chrome connection through Playwright; focused REA screenshots succeeded on a fresh tab. No CAPTCHA was bypassed, account created, tutor contacted or form submitted. Screenshots establish visible layout, not the complete contact/payment flow or proprietary ranking logic.

## Observations and implementation choices

| Observed in the sample | Tutor Marketplace adaptation |
| --- | --- |
| Subject pills above a large headline | Real subject labels and existing offer title; introduction title uses existing subjects and Tutor name |
| Rounded portrait/name/rate/contact summary beside desktop content | Shared rounded summary with larger portrait, actual rate/unit and a clear action; light yellow accents and existing branding |
| Portrait-led narrow layout | Single-column mobile layout with summary before detailed content; no fixed overlay obstructing controls |
| Separate about/class/location/review/rate sections | Introduction biography, declared location/hours and actual offers; offer pages show class description, existing review component and contact form |
| Heart/share controls | Existing server-backed save and share controls retained on introduction profiles |
| Review score, response time, student count and Ambassador badge | Only actual existing offer review summaries are rendered; no invented response time, student total or status badge |
| Free first-class indicator in the sampled profile | Only the Tutor's recorded FREE/PAID/NONE trial terms, exact duration and price; lesson units stay distinct from hourly rates |

The product's ADR 0011 remains authoritative: identity-reviewed introductions are free, Tutor Pro controls offers/consented public email, and Learner Access controls in-app enquiries. A profile without an offer remains browsable and explains the absence of available offers. Private identity evidence stays private. Evidence details are available in a disclosure instead of dominating the page.

## Acceptance

- TypeScript passed. Sixteen focused tests passed across profile terms/reputation, saved Tutors and enquiry alternatives.
- Cloudflare build passed. Initial final rebuild encountered a file lock from the task-owned local Worker preview; stopping that preview resolved it. No source workaround or application change was needed.
- Browser checks with controlled fictional responses passed at desktop, 390px and 320px: no horizontal overflow, section anchors, existing save/share controls, lesson-unit pricing, contact navigation to the existing guarded form, no-offer state and failed-photo fallback. No real enquiry, email, payment or account write was submitted.
- [Implementation desktop](evidence/tutor-profile/implementation-desktop.png), [mobile](evidence/tutor-profile/implementation-mobile.png), [offer mobile](evidence/tutor-profile/implementation-offer-mobile.png) use fictional browser fixtures.
- Deployed Cloudflare Worker version `9536f947-ef66-4cb5-91c3-534c48121914`. Bundle gzip 464.67 KiB; reported startup 3 ms is not a request CPU measurement.
- Live existing-data profile [072e4319-d991-427f-8cc3-8b9928d11636](https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev/profiles/072e4319-d991-427f-8cc3-8b9928d11636) passed desktop/mobile rendering, approved portrait loading and section navigation with zero page errors. [Live desktop](evidence/tutor-profile/live-desktop.png), [live mobile](evidence/tutor-profile/live-mobile.png).

No new backend fields, schema changes, payment activation or AWS runtime extension are included. Live offer acceptance used controlled browser data because the main environment currently has no published offers; the actual main profile was tested with existing backend data.
