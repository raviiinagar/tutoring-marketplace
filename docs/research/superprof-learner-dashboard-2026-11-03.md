# Accessible learner dashboard and account navigation

Inspection date: 3 November 2026. Scope: the existing signed-in Superprof learner session, read-only dashboard navigation. No credentials, messages, uploads, account changes or purchases were submitted by the agent.

## Evidence

- REA target discovery: `ev_32381309690753bc9477e4184c449b89fdf7bad52e979c11e3bd028f6d94182c`.
- Dashboard REA screenshot: `ev_13463408aeaa499d00a2d51a20e0ea54b5fbdf7a9bdb29bf2535d039a0b6e22e`, [metadata/digest](evidence/learner-dashboard/rea-dashboard.json). [Reference dashboard](https://www.superprof.co.in/dashboard.html) shows a profile/verification summary alongside a class-request card and Dashboard / My messages / My Account navigation. The sampled request is awaiting payment; it is not evidence of an accepted or paid class.
- Account settings REA screenshot: `ev_beaf5fab87b51010a419a7b89659ae5191b660efe3577dcc2d1735b14a0b2438`, [metadata/digest](evidence/learner-dashboard/rea-account.json). The accessible [My Account page](https://www.superprof.co.in/dashboard.html/my-profile/) has general information, notification/contact-related sections, password/account controls and a My Receipts link. Seeing controls does not verify saving or completing those actions.
- Account menu REA screenshot: `ev_f9aa513af5a58115d1ac8c40a4356686786404ff5416f32a623dbe45788d5648`, [metadata/digest](evidence/learner-dashboard/rea-menu.json). Browser inspection of the mobile menu confirmed My Profile, My Dashboard, My Class Requests, Favourites, Help and Write your Ad.
- Supplementary browser navigation visited [messages](https://www.superprof.co.in/dashboard.html/pesan) and [Favourites](https://www.superprof.co.in/dashboard.html/favourites). Messages reported an unfinished request; Favourites showed an empty state and a teacher-search action.

Navigation, waits, mobile viewport changes and opening the account menu used Playwright in the existing Chrome session. REA performed scoped target discovery and passive visible screenshots. The REA scenario provider had previously failed in this session; no claim is made that REA executed those clicks. REA screenshots returned the native desktop viewport; separate 390px captures establish the observed mobile layout. Raw private reference screenshots remain in ignored `.local/rea-learner-dashboard/`, outside committed source; the report omits personal account/contact/message values.

Local-only browser reference captures: [dashboard](D:/WORK/P1/.local/rea-learner-dashboard/reference-dashboard.png), [mobile menu](D:/WORK/P1/.local/rea-learner-dashboard/reference-menu-mobile.png), [empty favourites](D:/WORK/P1/.local/rea-learner-dashboard/reference-favourites.png). These captures are available to the workspace owner and are not part of a public source release.

## What could not be verified

| Area | Boundary |
| --- | --- |
| Active paid conversations, accepted classes and post-payment dashboard | This session's request is unfinished/awaiting payment; these states cannot be established from it. No payment was initiated to unlock them. |
| Receipts and invoice contents | My Receipts navigation was visible, but receipt details/downloads were not opened. No paid receipt state was observed. |
| Saving profile/contact/notification settings, password changes, deleting an account | Controls were visible but deliberately not submitted; their result and backend rules remain unverified. |
| Populated Favourites | This session has an empty list; populated ordering and management were not established by this inspection. |
| Other users, Guardian-specific variants, Tutor/staff workspaces, every responsive/accessibility state | Outside this learner session's observed scope. Keyboard/screen-reader conformance of Superprof itself was not audited. |
| Superprof backend, private APIs and internal payment/access logic | Visible pages do not establish those implementations. Existing Tutor Marketplace rules remain authoritative. |

## Adaptation

The project now separates an API-backed learning overview at `/account` from existing account/security tools at `/account/settings`. Shared navigation connects Dashboard, My enquiries, Messages, Saved Tutors and My account across private tools. The header uses the same destinations on desktop and mobile, with current-page semantics in the workspace navigation.

The overview uses existing cookie-authenticated endpoints for actual current Access Pass state/pending count, recent enquiries, recent Connections, Saved Tutors and usable Learner profiles. Paginated lists are presented as recent items, never invented totals. A failed section renders an error/retry rather than a zero. Email verification is identified specifically; no phone or identity approval is invented. Tutor/Guardian, privacy, notifications, receipts, support, reviews, security sessions, role selection and authorized staff access remain discoverable. No new profile-editing API or scheduling/payment model is added.

Private overview data is scoped to the authoritative account ID, kept in memory with zero retention after unmount, and cleared across account changes. Child API 401 responses invalidate the session view. Settings refresh their account authority on focus and reject stale in-flight results. Existing sign-out/session-revocation and role controls retain their server endpoints.

## Acceptance

- TypeScript and Cloudflare build passed. Twenty-nine targeted tests passed across dashboard/account isolation, 401 handling, errors/retry, shared navigation, saved Tutors and deadline behavior. The pre-existing account/header/saved subset also passed (30 tests); these counts overlap and are not additive.
- Controlled local and hosted browser checks passed at 1440px, 390px and 320px: active-page navigation, keyboard opening/activation of account menu links, standalone settings deep-link/reload, no automatic account mutations during navigation, explicit role selection, last-role guard, session revocation, account switching, enquiry error/retry and confirmed sign-out. No page errors or horizontal overflow were observed. All signed-in account/security API responses and actions in these checks used fictional browser fixtures, not real account changes.
- [Hosted dashboard desktop](evidence/learner-dashboard/implementation-dashboard-desktop.png), [mobile](evidence/learner-dashboard/implementation-dashboard-mobile.png) contain fictional data only.
- Cloudflare version `309f1f58-5096-429b-b830-7e1e39947a56` is deployed. Bundle gzip 470.92 KiB; reported startup 2 ms is not a request CPU measurement.
- Real-backend anonymous browser checks passed for both `/account` and `/account/settings`, redirecting to `/auth/signin`; actual `/v1/health` returned 200. An initial health-request timeout was transient and the bounded repeat passed. A signed-in real-backend dashboard/session mutation was not exercised using the owner's credentials; authenticated functional coverage is the controlled browser/test coverage above.
- The new settings route is standalone in the generated route tree, preserving `/account` as the overview instead of nesting the settings page inside it. Security, staff permissions, payment/access policies, backend data and AWS stop schedules were not changed.
