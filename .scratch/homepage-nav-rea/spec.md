# Branded homepage and navigation refresh

Status: ready-for-agent

Owner request: use REA MCP to inspect Superprof navbar/homepage, show evidence, and build similar UI while preserving Tutor Marketplace branding. Work is isolated from existing root changes.

## Decisions

Use existing wordmark, coral actions, light-yellow hero, actual catalogue and public Tutor data. Simplify desktop navigation; reveal a compact search after homepage scrolling and on other pages. Add accessible shared search dialog, grouped account destinations, role-aware teaching entry and mobile disclosure with explicit auth actions. Preserve all other account/workspace behavior.

Homepage: larger search-led hero, active-subject carousel with actual subject links, existing public cards, honest how-it-works guidance, teaching CTA, real Tutor-declared city links, existing domain catalogue and useful footer navigation. Do not fabricate growth counts, testimonials, reviews, locations or contact rights. Existing API, privacy, auth, Guardian, payment and publication rules remain authoritative.

## Acceptance

Record REA observations separately from adopted design defaults. Validate anonymous/authenticated/loading navigation, catalogue retry, role-aware teaching route, focus restoration, subject/city integrity, carousel/search navigation, scroll behavior, anchor offsets, 320/390px overflow and desktop layout. Run appropriate UI checks/build and browser acceptance; record hosting if promoted.
