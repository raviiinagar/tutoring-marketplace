# P1: Accessible names omit visible text on search and Tutor cards

Status: needs-triage
Type: task

Live desktop header search has visible text "What would you like to learn?" but aria-label "Search for a teacher". Tutor-card links include visible name/location while their overriding label includes only "View Tutor" and name. Axe reports serious WCAG 2.5.3 label-content-name-mismatch. This is a current product defect, not an old test expectation.

Evidence: [live desktop/mobile scans](../../../docs/qa/evidence/2026-11-05/live-accessibility.json). Sources: `lovable-ui/src/components/account/ui.tsx`, `public-tutor-profiles.tsx:40`, `public-offer.tsx:16`.

Suggested acceptance: retain meaningful labels while including visible text, verify voice/keyboard operability, and rerun desktop/mobile axe and relevant header/card regressions. Do not merely remove the accessibility assertion.
