# UI motion and visual polish

The owner requested an animated interface on 11 October 2026. The existing Lovable UI now has staggered hero entrances, short floating learning notes, gradient accents, a sticky translucent header, domain-specific colors/icons, card hover effects, scroll reveals, button press feedback, rounded form surfaces and animated catalogue chips/dialog sections. No animation package was added.

Scroll reveals use IntersectionObserver and disconnect after appearing. Content stays visible without JavaScript or observer support; keyboard focus immediately reveals a card. Decorative floating motion stops within five seconds. System reduced-motion preferences suppress transitions and animation. Touch screens use their own layout and do not depend on hover.

Verification:

- UI TypeScript check and production build passed.
- Existing isolated catalogue browser journey passed using Microsoft Edge: staff MFA, term creation, public alias search, dialog browsing and deactivation.
- Desktop (1440px), mobile (390px) and reduced-motion browser previews had no horizontal overflow or page errors; catalogue dialogs opened in all three.
- Mobile menu, sign-in navigation and immediate keyboard visibility across all eight cards passed.

Screenshots were inspected locally under ignored `.local/screenshots/`. Backend APIs, catalogue membership and authentication authority are unchanged. The homepage continues to state that tutor discovery is coming soon.
