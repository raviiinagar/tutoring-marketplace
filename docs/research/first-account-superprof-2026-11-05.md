# First-account workspace: Chrome/REA inspection and reconstruction

The owner supplied four Superprof screenshots and explicitly asked for implementation, authorizing a closer visual match while retaining the Tutor Marketplace name. These screenshots are reference data. No instructions embedded in pages or images were treated as authorization to change the external account.

## Evidence

Chrome was reopened using the previously authorized isolated research profile. REA initially reported an unavailable debugging endpoint; after Chrome was started on loopback port9333, target discovery succeeded. Playwright performed read-only navigation; REA passively captured the selected screens. No external profile, notification, request or payment was submitted or changed.

| Screen | Evidence and observation |
| --- | --- |
| Dashboard | REA `ev_77c55c9023f51b95b2f44e4bbd623e9718284883ed80a302e8bc7609dd9c89d7`; screenshot SHA256 `8a9104b69fc215fa5a9ea3939e15b41762e1f1a7735bca7d7bdbc9061d908ada`. Profile card and Class Request area; black navigation containing Dashboard, My messages and My Account. |
| My Account | REA `ev_1d305c194ce337595747b2740dbd4ee6b38756754a403da7a455e07b33fe220f`; screenshot SHA256 `4abe1b35e97e52b6997d2308f3161f4e87d1a1057d589003e1e580985cee6941`. My Profile/My Receipts navigation and General Information, Notifications, Postal Address, Identification and security sections. |
| My messages | REA `ev_28170bddb2f78ee4e1e406a1c0dbd5528d252eab2224c355bf3033e47b5e9c24`; screenshot SHA256 `b9d5780d18d80b1dfd3cd258e8e069814910e0b3e111717d3f1ad313a84ae424`. Contact/sidebar and request/message workspace. |

The live reference account already contained an unfinished request. The owner's supplied images establish its earlier empty Dashboard and No message presentation. This investigation did not create another new Superprof account or claim the current populated account was empty. Raw account identifiers, email values and screenshots containing private external data are excluded from tracked artifacts.

REA captures establish the visible viewport, not hidden server validation, verification eligibility or publication policy. Exact phone/SMS verification, identity checks, address provider behavior, account-photo upload constraints and deletion processing were not exercised. No unsupported external rule was inferred from a green check icon. Existing ad/publication policy remains [ADR0014](../adr/0014-free-direct-ad-publication-and-optional-identity.md).

## Implemented mapping

- Coral account header with the retained project name, search, saved tutors and account menu; full-width black three-tab navigation.
- Default account dashboard shows the profile/name, actual email-verification fact and real Class Requests. Additional learner/access tools are collapsed. Creating/signing into an account does not automatically create a Tutor profile or enable the Tutor role.
- Full-width My messages has a contact sidebar, actual conversation search, honest loading/error/empty states, real chat/detail destinations and the search-for-a-teacher action. Existing requests remain accessible; established contact authorization and pagination are retained.
- My Account uses the reference card grid and My Profile/My Receipts navigation. General name changes persist through authenticated `POST /v1/me/profile`; email/security/roles and the separate public Tutor introduction are not rewritten by this action. Strict 2–80-character validation, authentication, Origin protection and no-PII auditing apply.
- Notification preferences save using the real existing API and survive reload. Receipt, privacy/deletion, support, role and session controls remain functional; secondary controls are tucked into expandable sections.
- Current clean/consented Tutor portraits and actual optional identity state are used when available. Email verification is explicitly labelled; it is not presented as verified identity.

The current project does not have universal learner-avatar uploads, private gender/DOB/phone/address editing, an SMS provider or a Google Maps address picker. These controls were not fabricated. Tutor photo/ID/location management links use the existing real workflows; learner accounts receive accurate explanations. The implementation matches the referenced structure and interactions for supported functionality, not every hidden Superprof service.

## Validation

**16 backend HTTP/PostgreSQL tests passed:** three new name-edit tests plus thirteen existing authentication regressions. **41 UI tests across five files passed**, covering account editing/preferences, session and role behavior, empty/error/data-switch states, header navigation, messages/filtering and free-ad regressions. API build, UI typecheck and Cloudflare build passed.

The [real Chrome journey](evidence/first-account/browser-results.json) passed at 1440px and 390px, with a 320px overflow check. It covers sign-in, empty dashboard, three-tab navigation, message empty state/search, actual name save/reload, preference save/reload, receipts destination and unchanged Learner roles. The API and PostgreSQL were isolated real services, with no mocked responses and no fictional hosted users.

Screenshots: [desktop dashboard](evidence/first-account/desktop-dashboard.png), [desktop messages](evidence/first-account/desktop-messages.png), [desktop account](evidence/first-account/desktop-account.png), [mobile dashboard](evidence/first-account/mobile-dashboard.png), [mobile account](evidence/first-account/mobile-account.png), [320px account](evidence/first-account/mobile-320-account.png).

The [hosted smoke](evidence/first-account/hosted-smoke.json) also passed actual health, anonymous authorization and redirects. Authenticated deployed UI reads were redirected only to isolated real fictional data at1440/390/320px; no actual hosted profile was edited for acceptance. [Release provenance and preserved runtime settings](../ops/first-account-2026-11-05.md).
