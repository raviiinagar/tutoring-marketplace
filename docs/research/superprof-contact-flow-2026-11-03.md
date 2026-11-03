# Contacting a Tutor - evidence and adaptation

Observed 3 November 2026 on [the selected Superprof Tutor profile](https://www.superprof.co.in/math-coach-for-igcse-gcse-core-cambridge-ncea-australia-curriculum-taught-for-students-across-countries-for.html).

## Evidence and limits

1. Clicking the visible Contact container after the page scripts loaded opened a Tutor-specific authentication dialog. It retained the portrait, name and star presentation and offered email registration, Google, Apple and existing-account login. [Browser screenshot](evidence/contact-flow/reference-contact.png). This navigation/click used Playwright connected to the existing Chrome session, not REA's action provider.
2. REA MCP screenshot `ev_12630539ee54880ede0b564fbbbb6f8073c3d93d9944da948e2a314dc6d84c83` captured the composition page at `/connections-your-request-4118027.html`. It showed a Tutor/rate summary, editable prefilled message, address and phone fields, a contact-details disclosure and a Next action. [REA identity, digest and limitations](evidence/contact-flow/rea-contact.json). Personal message/contact values are omitted from this report and source artifacts. Login/registration transitions between the two observed states were not captured; the external browser session changed state during inspection.
3. REA target discovery `ev_ce88e4d747de7630d5805108cd1a957de2fecfcfc379525ee97ce31f5703b772` scoped the public Superprof targets. The REA browser-action provider returned `execution_failure`; existing read-only diagnostic evidence showed aligned registration. Focused screenshot capture succeeded. No registration, credentials, address, phone, enquiry submission or checkout was entered/submitted by the agent on Superprof.

These observations establish the contact entry and composition screens in one sampled flow. They do not establish later payment screens, delivery, response time, acceptance, contact release, cancellation/refund behavior or every account/locale variant. The Next action was not advanced. No CAPTCHA was bypassed and no proprietary assets, message text or social-login implementations were copied.

## Adaptation decisions

| Observed pattern | Tutor Marketplace implementation |
| --- | --- |
| Tutor identity and price stay visible | Enquiry section identifies the selected Tutor, offer, teaching mode and exact tuition unit; hourly/lesson charges remain distinct |
| Authentication retains Tutor context | Existing-account sign-in accepts only a validated internal Tutor slug and resumes that Tutor's contact section; no arbitrary return URL |
| Editable enquiry message | Existing Learner goals are prefilled; explicit learning-goal/time inputs have counters and validation aligned with existing server limits |
| Staged composition and Next | Separate write/review stages; review and edits do not submit an enquiry or create a payment; final Send is explicit |
| Contact-detail collection | No new address/phone collection; existing privacy/contact release and Guardian controls remain authoritative |
| Tutor contact journey | Server-confirmed access and existing checkout/coupon component remain required before final send; no Superprof payment model is inferred or adopted |

The request payload remains the existing offer ID/revision, selected usable Learner, Subject, teaching mode, private goals/times and idempotency key. Drafts are component memory only. There is no personal draft data in URLs or local/session storage. Account changes reset private state; old in-flight results are ignored. Ambiguous failure retries retain the same key and payload, while actual edits get a new key. The backend still decides eligibility, duplicate requests, deadlines and contact release.

Existing Learner Access pricing/activation, Tutor Pro, server policy disclosures, confirmed payments, coupons, pending limit, tuition separation and manual renewals remain unchanged. A submitted enquiry is not a booked class. The confirmation uses server request status/deadline and links to Contact Requests or an already-authorized Connection. New-account email verification remains its existing flow; the sign-in return enhancement applies to verified existing accounts.

## Acceptance

- TypeScript and Cloudflare build passed. Nineteen targeted tests passed across contact flow, enquiry alternatives, real checkout/coupon components and request deadlines; the final enquiry/alternative subset was rerun after the feedback change (eight passed). Existing non-fatal React act warnings remain in payment tests.
- Controlled local and hosted browser acceptance passed at 1440px, 390px and 320px: tutor-specific sign-in return, review/edit without sending, coupon-funded coverage without checkout, missing-access/disabled-checkout handling, server-confirmed access refresh, pending limits, no usable Learner, stable-key retry after an ambiguous failure, visible error feedback and confirmation focus. No browser page errors occurred. All account/enquiry/payment API responses in these browser scenarios were fictional fixtures; no real Tutor received a request and no charge was made.
- [Review desktop](evidence/contact-flow/implementation-review-desktop.png), [review mobile](evidence/contact-flow/implementation-review-mobile.png), [submitted state mobile](evidence/contact-flow/implementation-submitted-mobile.png) show those controlled fixtures on the deployed frontend.
- Cloudflare version `1259dab1-efba-4d5e-ad22-4812b5e000d1` deployed to the existing frontend. Bundle gzip 467.55 KiB; startup reported 2 ms is not request CPU usage.
- The actual API health returned 200; the main discovery response still had zero published teaching offers. Therefore a real-account/backend enquiry submission was not exercised. The UI is ready for eligible published offers; no fictional offers were inserted into the main database.

No backend code, schema, payment policy, access grants, public contact consent or AWS runtime deadlines were changed. Task-owned preview and reference-observer processes were stopped after verification.
