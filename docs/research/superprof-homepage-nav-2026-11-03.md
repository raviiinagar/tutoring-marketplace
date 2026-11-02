# Superprof navbar/homepage: REA evidence and branded implementation

Inspected https://www.superprof.co.in/ on 3 November 2026 IST through the owner-opened Chrome CDP session, using REA MCP. No account login, registration, contact, payment or CAPTCHA bypass occurred.

## Evidence

[Selected JSON evidence](evidence/superprof-homepage-nav-2026-11-03.json) preserves successful action statuses, URLs, navigation text and section headings. The full canonical session export is retained locally in ignored `.local/rea-homepage-nav-2026-11-03.json`.

| Observed behavior | Evidence |
|---|---|
| Desktop header has brand/home, Help, teaching entry and login. Homepage has a large search hero, subject shortcuts, Tutor cards, testimonial section, teacher promotion, city links and footer. | `ev_031629595f61447344e9d822384634faad785c6a65c5c7fff4ef99ad0783f7ef` |
| Scrolling the homepage exposes a compact search in the sticky header. | Scenario `ev_20000365569556839fefa540d562a72e7aa25ddfc82b5eabd626f1c244a13247`; [screenshot](evidence/superprof-home-scrolled.png), `ev_8a31cd9715f67ba7ec2b87da164d988fd3a3a38ea53828926fc64cc8b01f5774` |
| A narrow-layout menu groups login/signup, teacher search, teaching entry and Help in a white panel. | `ev_77ea945592e8116f936f9bd783f9a1c3acd1f23083c17510db51b823072313d9`; [mobile menu screenshot](evidence/superprof-home-mobile-menu.png) |
| Clicking the homepage Physics shortcut navigates to `/lessons/physics/india/`, whose heading and search reflect Physics. | `ev_631b4816fe793b1219dd7a6c1e96d196831aebc996e4dddb61e43b5f977c8f44` |

Additional [desktop homepage screenshot](evidence/superprof-home-desktop.png): `ev_35c30502f0b361266388a0a5f95bc65868ba88ede6d2dc489b802f44a70a8de3`.

### Limitations

Initial mobile capture attempts clipped desktop content and one menu locator matched duplicate header variants. The corrected successful mobile scenario used the static-header control after the existing browser was held at a measured narrow viewport. The raw bundle retains failed attempts; they are not treated as successful mobile observations. A duplicate Physics link locator was narrowed to the hero shortcut before the successful navigation.

Observations establish the public layout and declared interactions only. We did not inspect authenticated account behavior, private source, personalization or ranking. Screenshots contain observation-time competitor content, which is not reused as our marketplace data. REA left the external browser open.

## Implementation choices

- Preserve the Tutor Marketplace wordmark, typography, coral actions and light-yellow gradient.
- Simplify desktop navigation and add a compact subject/location search dialog after scrolling the homepage and on other pages. Group account destinations without removing access; teaching entry follows the actual signed-in role.
- Preserve subject/location autocomplete and exact-offer filters. Add a scrollable subject strip using active catalogue records, with previous/next buttons and reduced-motion support.
- Retain real public Tutor cards and available offers. Add our own three-step explanation, keeping the platform Access Pass separate from Tutor tuition. No competitor testimonial, badge, supply count or rating claim is copied.
- Add city links from actual public Tutor-declared locations plus Online; no invented popular-city supply or distance promise. Keep domain browsing and footer links.
- Keep the existing sign-in pages and authoritative NestJS API rather than copying a competing authentication or commercial model.

Keyboard/focus behavior, error retry, our how-it-works copy, account-menu grouping and city deduplication are project design choices. Their exact competitor equivalents were not established by this bounded inspection. No API, database or pricing change is part of this UI release.

Validation and hosting evidence: [operations record](../ops/homepage-nav-2026-11-03.md).
