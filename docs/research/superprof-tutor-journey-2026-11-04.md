# Tutor journey: observed evidence and implementation

Inspection and implementation date: 4 November 2026. Scope: the owner's existing signed-in Superprof India session, plus [official help/terms research](superprof-onboarding-official-2026-11-04.md). REA performed passive target discovery and screenshots. Playwright performed browser navigation and the explicitly permitted draft steps. REA's action provider was not used. No CAPTCHA was bypassed, contact request accepted, payment made, ID uploaded or account credential changed.

## Observed onboarding

| Screen in this returning account | Fields and interaction actually observed | Boundary |
| --- | --- | --- |
| Subject entry, step 0 | Main-subject search and common subject shortcuts. Selecting Maths opens optional related skills; guidance permits up to four subjects in one ad. | Main subject selected; related skills left unchanged. [Entry screenshot](evidence/tutor-journey/reference-subject-entry.png). |
| Title, step 1 | A title textarea with a 12-word target. Empty input shows 0/12 and disables Next. Marked research text above the threshold advances. | No HTML min/max length attribute established the limit; the UI enforces its word target. Server validation boundaries were not exhaustively tested. |
| About the class, step 2 | A separate class-description textarea with a 40-word minimum, word counter and disabled Next when empty; guidance excludes contact information/URLs. | A marked research description advanced. No plagiarism/quality review outcome was tested. |
| About you, step 3 | Another 40-word textarea for experience/approach, with contact/URL guidance. | Same limited positive-path test; no invented degree or experience was entered. |
| Location, step 4 | Location autocomplete and home, travel and online choices; travel control showed a distance. Guidance says the address is not public. | Only Online was selected. No exact address was supplied, geolocation requested or distance algorithm verified. |
| Languages, step 5 | Optional language selections; English is the default. | Advanced without adding languages; no translation behavior tested. |
| Rate, step 6 | Hourly numeric fee, locality/subject fee guidance; empty Next disabled, sample rate enabled it. | Numeric bounds, currency edge cases and server error rules remain unverified. |
| Phone, step 8 | Mobile-number entry, country selection and a notice about private sharing after acceptance. | Stopped here. No phone number supplied, OTP sent or phone-ownership outcome tested. Step 7 was not presented in the observed sequence. |
| Further uploads/final steps | Not reached. | Photo/diploma/ID upload order, file limits, compulsory uploads, new-account-only fields and final publication controls cannot be reconstructed from this account. Existing profile information may have caused skipped steps. |

REA screenshot IDs and content digests are in [capture metadata](evidence/tutor-journey/rea-captures.json). Supplementary browser observations were recorded locally with account/ad identifiers excluded from this report.

## Publication observation and research cleanup

The title step produced an ad identifier, and the My Ads manager later labelled the marked research ad **Ad is online** before a separate final publication action was reached. That was an unexpected external side effect of advancing this returning-account flow. The agent immediately deleted only the uniquely titled research ad and verified its title disappeared; the pre-existing Physics ad remained. The agent did not independently check anonymous search visibility, index timing or human-review logs before deletion. Therefore this establishes a manager state in this session, not a universal promise of immediate publication or absence of review for new Tutors.

The official materials also conflict about publication/verification. They do not establish the checks, reviewers or timing needed to replace this project's documented identity/adult review. The dashboard's **Verified profile** text referred to Email and Mobile Phone in this sample; it does not prove an official ID or diploma was reviewed.

## Accessible dashboard and ad management

The settled dashboard showed Dashboard, My messages, My Ads, Evaluations and My Account navigation; email/mobile indicators; a Pro promotion; level progression; a class-request card; and a My Ads card with Modify. [REA dashboard evidence](evidence/tutor-journey/rea-dashboard.json). Private request/contact content is omitted. Requests were not acted on.

The My Ads manager exposed editable sections for subjects, title, venue, levels, teaching languages, tutor/class descriptions, hourly/packs/travel/webcam prices, free-class terms, optional YouTube video and recommendation sharing. It also exposed Student's view, an online-state control and Delete advert with confirmation. Only the newly created research ad was deleted. Editing existing ads, toggling their visibility, paid statistics, accepted-message tools, receipts and financial history were not exercised. Optional videos/packs do not yet have an equivalent project data model and were not fabricated as working controls.

## Status evidence and unresolved criteria

The dashboard's Upgrade my status link opened `/dashboard.html/status`. Its next-tier checklist showed two recommendations still needed, with photo, 12-word title, 40-word class description and 40-word experience already marked finished. The tier label was **Recommended**. [Supplementary Playwright status screenshot](evidence/tutor-journey/reference-status.png). The later REA screenshot attempt for this panel reported `target_unavailable`; it is not presented as a successful REA status capture. This is the current account's checklist, not proof that the help page's **Experienced** and every public **Confirmed** label are identical states.

The [official level article](https://www.superprof.co.in/help/teachers/become-a-superprof/superprof-charter/50/) describes New, Experienced, Super Teacher and Ambassador. It gives two recommendations for Experienced; Super Teacher adds four recommendations, three positive reviews, a diploma and prompt responses; Ambassador adds six reviews, ID and an interview. The [terms](https://www.superprof.co.in/gtu.html) instead give one review for Super Teacher and a stricter response target. The positive-review definition, response aggregation/window, interview questions/assessment, mapping of labels and promotion/demotion procedure remain unverified. No interview questionnaire was invented.

## Project mapping and policy differences

| Project feature | Real implementation and deliberate boundary |
| --- | --- |
| Introduction wizard | Subject-first steps, guidance panel, progress, About, rate, private identity details and review. Save/Next persist encrypted incomplete drafts with expected revisions. Reload resumes the saved step. Only final explicit save creates the introduction. No browser storage holds drafts. |
| Existing profile editing | Existing records and identity decisions remain. Existing name/country/document changes still restart identity review; ordinary introduction edits retain identity approval. Current field limits remain project rules rather than purported Superprof limits. |
| Identity/publication | Current identity/adult review gates the free profile; separate scan/review states and feedback remain visible. Portrait review remains separate. These are existing project requirements, not inferred Superprof baseline checks. |
| Teaching offers | Existing staged subject/format, title/class description, rate/trial, review and draft save; separate staff submission and approval; pause/resume and exact revisions. No automatic publication from Next. |
| Commercial rules | Tutor Pro remains INR600/30 days for eligible offers and consented public email. Learner Access remains separate. Superprof's free-ad, mandatory-trial, immediate-edit and recurring-payment rules were not silently imposed on existing users or purchases. |
| Dashboard | Profile/access, actual offer states and recent enquiries, plus Evaluations and real level criteria. Branding and light-yellow guidance remain. Unsupported earnings/views/statistics are not invented. |
| Recommendations | Real authenticated nonself submissions, explicit publication consent, private pending storage, audited staff moderation, public approved text and author withdrawal. Network endorsements are not star reviews or proof of completed classes. |
| Progression | Current public eligibility and backend facts are authoritative. The next earned level conservatively requires two published recommendations plus the observed photo/text-quality prerequisites, using saved current-profile offer text. Pausing or Pro expiry alone does not revoke that text evidence. Pending/rejected/withdrawn content does not qualify. Loss of qualifying evidence removes eligibility. Super Teacher and Ambassador remain locked because their verified rules are incomplete/conflicting. A paid pass cannot award a level. |
| Diploma | Optional private clean-scanned evidence may be linked to progression. Upload is recorded, not represented as qualification verification or a badge award. |

The two new migrations are additive. No existing profiles, documents, purchases, Connections or reviews are rewritten. Drafts and reputation records participate in privacy export/erasure. [Backend release and data-preservation evidence](../ops/tutor-journey-backend-2026-11-04.md).

## Acceptance

- **6 backend HTTP/PostgreSQL tests passed** across the draft and reputation suites. Reputation was rerun after the final quality correction, including ordinary Pro expiry, pausing, text changes, moderation concurrency and public privacy projections. Repeated runs are not added to the case count.
- **37 UI tests passed** across seven targeted files; the 11 workspace/reputation tests were rerun after the compact overview change. UI/API typechecks, Cloudflare build and whitespace checks passed.
- The [full real-backend desktop/mobile results](evidence/tutor-journey/full-journey-results.json) cover browser sign-in, draft saving/reload, explicit final profile creation, private identity submission, staff document inspection/approval, public profile visibility, a real 100% test Pro coupon, offer draft save, separate review submission/approval, pause/resume, portrait upload/approval, pending endorsements, audited staff moderation, qualifying Experienced progression, public recommendation text and withdrawal demotion. The API/database/scanning boundary was isolated real Nest/PostgreSQL with an explicit fictional test scanner. No mocked API responses were used in these journeys. Core identity/offer staff decisions were exercised through real HTTP APIs; recommendation moderation was also exercised in the browser UI.
- Desktop 1440px and mobile 390px passed with no browser page errors or horizontal overflow. [Resumed mobile draft](evidence/tutor-journey/mobile-resumed-draft.png), [mobile review](evidence/tutor-journey/mobile-profile-review.png), [earned-level checklist](evidence/tutor-journey/mobile-earned-level.png), [public profile](evidence/tutor-journey/desktop-published-profile.png). All screenshots show fictional local data, not real hosted endorsements or awards.
- [Hosted smoke](evidence/tutor-journey/hosted-smoke.json) passed real anonymous redirects and real proxied health. Hosted assets were also checked at 1440, 390 and 320px, with authenticated reads redirected exclusively to the isolated real API. That checks the deployed UI; it is not an authenticated hosted write test. [Hosted desktop overview](evidence/tutor-journey/hosted-dashboard-1440.png), [hosted mobile overview](evidence/tutor-journey/hosted-dashboard-390.png).
- Live frontend version **`48aa0fac-0c1a-4f72-8c5b-f2be3ac7d7dd`**. Main and sandbox backend release **`tutor-journey-20261104-14639768102f`**; migrations remain 37 after the forward correction. Existing data and protected configuration are preserved; hosted new draft/recommendation tables remain empty. No real users, endorsements or badges were seeded into either hosted database.

Reference gaps remain as stated above. This is an evidence-grounded adaptation, not a claim that every Superprof new-account/phone/upload/review/paid flow or Ambassador assessment was inspectable or reproduced. Existing safety/commercial rules are deliberately explicit rather than silently replaced by contradictory reference claims.
