# Branded homepage/navbar refresh - 3 November 2026

## Change and scope

The owner requested REA inspection of Superprof navigation/homepage and a similar UI preserving their branding. The implementation retains Tutor Marketplace, coral actions, the light-yellow hero, existing public Tutor cards, identity/public-contact policy and authoritative APIs.

Added a simplified desktop header, compact search on other pages and after homepage scroll, grouped account destinations, role-aware teaching entry, mobile navigation with clear auth actions, active-subject carousel, three-step marketplace explanation, real Tutor-location browsing and footer links. Existing subject/location search, domain catalogue and exact-offer filters remain available. Empty teaching-offer sections no longer duplicate the public profile directory with a large signup panel.

[REA findings and screenshots](../research/superprof-homepage-nav-2026-11-03.md) distinguish direct observations, capture limitations and adopted project design choices. No fake growth counts, testimonials, cities or rankings were added.

## Local acceptance

- 108 UI tests in 29 files passed, including nine focused header tests and four new homepage-data checks. TypeScript and production Vite/Nitro build passed.
- Browser verification passed at desktop, 390px mobile and 320px narrow widths: own branding/yellow hero, real public cards, subject-carousel arrows, subject navigation, header search submission to existing filters, scroll-triggered search, Help anchor offset, mobile menu/Escape/focus return and no page errors/horizontal overflow.
- The local browser uses real public read projections, with isolated anonymous-session and discovery-response fixtures; no account or marketplace records were changed. Role-based menu destinations are covered by component tests.
- Harness corrections: native select/visible menu labels, waiting for hydration before programmatic scrolling, realistic public-API wait bounds and reduced-motion settled screenshots. Failed preliminary checks are not counted as successful acceptance.
- [Local browser result](evidence/homepage-nav-local-2026-11-03.json), [desktop preview](evidence/homepage-nav-desktop-2026-11-03.png), [mobile preview](evidence/homepage-nav-mobile-2026-11-03.png), [mobile menu](evidence/homepage-nav-mobile-menu-2026-11-03.png).

## Hosting and live acceptance

The owner explicitly approved pushing this release to the existing repository and deploying both environments after the initial automatic publication review. The checked implementation is commit `33b7129`; feature branch `feature/homepage-nav-rea` was pushed through `0ff3058` before promotion.

| Environment | Hosting commit | Ready Netlify deploy |
| --- | --- | --- |
| [Main](https://tutoring-marketplace-ravii-preview.netlify.app/) | `47b022d5bf53efc37b44e5c76395535a563f1ea0` | `6ae8f67120b42226156a9587` |
| [Payment sandbox](https://payment-sandbox--tutoring-marketplace-ravii-preview.netlify.app/) | `fadbff61d989a8e8266ed81432f43fb058c2aafc` | `6ae8f6d62610167ada010ca9` |

Both live environments passed desktop, 390px and 320px browser checks using actual public APIs without mocked responses: branding, yellow hero, Tutor cards, carousel, subject navigation, header search, scroll-triggered search, Help navigation, mobile menu, Escape/focus return and no page errors or horizontal overflow. Authenticated role destinations remain component-tested; this check did not create accounts or perform payments.

- Main: [result](evidence/homepage-nav-main-2026-11-03.json), [desktop](evidence/homepage-nav-main-desktop-2026-11-03.png), [mobile](evidence/homepage-nav-main-mobile-2026-11-03.png), [menu](evidence/homepage-nav-main-mobile-menu-2026-11-03.png).
- Sandbox: [result](evidence/homepage-nav-sandbox-2026-11-03.json), [desktop](evidence/homepage-nav-sandbox-desktop-2026-11-03.png), [mobile](evidence/homepage-nav-sandbox-mobile-2026-11-03.png), [menu](evidence/homepage-nav-sandbox-mobile-menu-2026-11-03.png).

Sandbox promotion preserved its fictional-account/no-real-money notice and existing AdminShell notice, with menu height and anchor offsets adjusted for the additional banner. Sandbox TypeScript validation passed after conflict resolution. Backend, database, credentials, MFA, payment configuration and compute-window settings were unchanged.
