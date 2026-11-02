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

## Hosting

Prepared on the isolated `feature/homepage-nav-rea` branch from `93f519a`. Hosting acceptance will be recorded after promotion to the existing approved repository and main/payment-sandbox deployments. No backend, database, credentials, MFA, payment or compute-window change is part of this feature.
