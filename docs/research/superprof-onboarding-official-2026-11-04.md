# Superprof India: official Tutor onboarding and status rules

Research date: 4 November 2026. This report covers public official help/terms and clearly labelled official editorial material. It does not establish signed-in runtime behaviour. See the [subsequent runtime investigation](superprof-tutor-journey-2026-11-04.md) for the observed 12/40-word checks, dashboard, status checklist and the research-ad side effect/cleanup. This public-document research itself submitted no external action.

## Onboarding fields, uploads and validation

| Source and scope | Documented information | What it does not establish |
| --- | --- | --- |
| [Help: Create an ad](https://www.superprof.co.in/help/teachers/become-a-superprof/create-an-ad/49/) | Sign into an existing account and choose Create an ad; otherwise create an account first. | Complete wizard order, every required field, server-side validation, save semantics or publication timing. |
| [Help: Visibility of my ad](https://www.superprof.co.in/help/teachers/manage-my-ad/visibility-of-my-ad/52/) | Descriptions of the class and teacher should each contain at least 40 words. A professional photo, detailed skills/experience, prompt responses and feedback help visibility. | Whether each recommendation is enforced by the current form; upload format, file-size and image rules. |
| [Official Tutor landing page](https://www.superprof.co.in/tutor/) | Describes creating a free teaching ad, choosing fees/methodology/schedule and teaching online or in person. Its guidance mentions a photo, qualifications, teaching approach and availability. | Exact required fields or proof that every applicant passes the same review. |
| [Official editorial guide](https://www.superprof.co.in/blog/how-to-tutor-online/) | An older article describes a title of at least 12 words. | Current runtime title validation: an old blog instruction is not sufficient to enforce this requirement in a reconstruction. |

A complete step-by-step onboarding specification cannot be recovered from these help articles alone. Photo/ID/diploma file types, size limits, crop rules, address-validation providers, exact ages, phone verification order and all error states remain unverified unless separately captured in the current flow. Project-specific limits must be labelled as project rules.

## Publication and verification: unresolved scope

The [official terms](https://www.superprof.co.in/gtu.html) describe free publication, distinct ad titles, prohibited contact details in ads, content ownership and enforcement. They say the platform attempts to control accuracy, qualifications, contacts and availability without guaranteeing them. They do not specify a universal initial review sequence or publication SLA. They also list broad registration data; this is not a reliable screen-by-screen mandatory-field inventory.

The [official editorial guide](https://www.superprof.co.in/blog/how-superprof-works/) states that verifiable credentials precede public visibility, but its FAQ also says no particular degree is required and describes a completed profile going live. An [older official Ahmedabad guide](https://www.superprof.co.in/blog/how-to-find-online-tutor-jobs-in-ahmedabad/) describes immediate publication. These claims do not settle the current operational gate, what a human reviewer checks, or whether optional identity verification differs from baseline profile validation.

**Conclusion:** neither “every new Tutor must submit an ID/diploma before publication” nor “all completed profiles publish immediately without review” is verified by this public-document sample. Do not add or remove an existing project safety gate on that assumption.

## Dashboard sections and actions documented by help

| Area | Documented actions | Evidence type |
| --- | --- | --- |
| My ads | Select an ad and section, edit and validate; view the student-facing preview. The article says saved modifications appear immediately. | [Edit my ad](https://www.superprof.co.in/help/teachers/manage-my-ad/edit-my-ad/51/), documented rather than executed. |
| My ads visibility | Deactivate through the online/offline slider and confirm; reactivate through the offline slider. | [Deactivate/reactivate](https://www.superprof.co.in/help/teachers/manage-my-ad/deactivate-or-reactivate-my-ad/53/), documented rather than executed. |
| My Messages | Accept or refuse requests; an accepted request enables arranging a class. The article gives a 72-hour response window and a custom refusal-message path. | [Accept or refuse](https://www.superprof.co.in/help/teachers/manage-my-requests/accept-or-refuse-a-request/54/). |
| Evaluations | My recommendations exposes a shareable link for former students, family or colleagues. Recommendations are checked before public display. | [Receive a recommendation](https://www.superprof.co.in/help/teachers/manage-my-requests/receive-a-recommendation/58/). |
| Pro Pass | Dedicated subscription information including expiry/remaining time. Benefits include ad-view statistics, visibility and support. | [Manage subscription](https://www.superprof.co.in/help/teachers/pro-pass-subscription/manage-my-subscription/74/) and [Pro Pass Club](https://www.superprof.co.in/help/teachers/pro-pass-subscription/pro-pass-club/66/). |

The help navigation also groups request reviews and reporting. These article names establish documented destinations, not the exact authenticated sidebar order, appearance or account-specific availability. No populated Tutor dashboard or paid statistics was inspected by this public-document research.

## Badge progression and inconsistencies

[Help: Tutor levels](https://www.superprof.co.in/help/teachers/become-a-superprof/superprof-charter/50/) describes:

| Level | Help-page criteria |
| --- | --- |
| New | Entry level; a professional photo and carefully written teaching approach are general improvement guidance. |
| Experienced | At least two network recommendations. |
| Super Teacher | Four recommendations, three positive student reviews, a diploma and prompt responses, ideally within 24 hours. |
| Ambassador | Previous criteria plus six student reviews, official-ID verification and an interview questionnaire. |

The [terms](https://www.superprof.co.in/gtu.html) instead mention four recommendations, **one review**, an uploaded diploma and response time **under** 24 hours for Super Teacher. They also describe a compulsory free first class for new teachers, with an opt-out at Super Teacher. The help page and terms therefore conflict on the review threshold and the force of the response target. A source conflict must not silently become a badge-awarding rule.

Unverified details include the meaning of a positive review, how response times are aggregated and sampled, counting rules for recommendations versus reviews, diploma/ID validation mechanics, interview questions and acceptance, automatic versus manual promotion, demotion/revocation, and the exact relationship between “Experienced” in help and “Confirmed” visible on some public cards. Buying Pro Pass is documented as promotion/visibility; it is not documented as a substitute for badge criteria.

## Implementation boundary

- Keep real project identity/adult review, portrait scanning/review, offer approval and Tutor Pro rules unless an explicit product decision supersedes them. These are existing project rules, not proven Superprof onboarding requirements.
- Distinguish third-party recommendations from connected-student reviews. Moderation status must affect counts; pending/rejected content does not earn a badge.
- Show actual backend evidence and outstanding requirements. Do not fabricate recommendations, response metrics, diploma verification or interview completion.
- An evidence-grounded Experienced level can depend on two approved recommendations. Higher levels must remain unavailable where eligibility has unresolved source conflicts or absent verification procedures; show the specific gap rather than display an earned badge.
- Preserve saved profiles, existing evidence, offer revisions, identity decisions, purchases and Connections. A better staged editor must not erase old records or automatically publish a draft.

## Research limits

The review-help URL `/help/teachers/manage-my-requests/leave-or-receive-a-review/57/` returned HTTP 405 through the web reader. Search results are not a substitute for an inspected authenticated review workflow. Search queries scoped to official India help for publication validation, identity, upload formats and Ambassador did not expose a complete operational handbook. This is a bounded negative result, not proof that additional rules or screens do not exist.
