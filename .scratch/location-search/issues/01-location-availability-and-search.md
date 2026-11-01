# Implement saved Tutor location, usual availability and location search

Status: ready-for-agent
Dependencies: reviewed public Tutor profiles, Tutor Pro, exact offers, staff review and existing hosted deployment (implemented)

Acceptance: feature spec, authoritative filtering and acquisition checks, accessible Lovable search/editor/cards, privacy lifecycle updates, meaningful regressions and hosted evidence.

## Comments

1 November 2026: owner selected online plus in-person city/area discovery, accepting-new-students status and weekly day/time slots.

Implemented and deployed to the isolated sandbox and main preview. Acceptance evidence: [deployment record](../../../docs/ops/location-search-2026-11-01.md) and [API contract](../../../docs/api/tutor-location-and-availability.md). Tests cover stale writes/overlap, eligible city/day/time matches, actual in-person request snapshots, preserving an existing enquiry when closing new students, resubmitting changed offer locations and privacy erasure. UI/mobile/keyboard and hosted save/reload checks passed. Routine implementation complete; live merchant launch remains outside this ticket.
