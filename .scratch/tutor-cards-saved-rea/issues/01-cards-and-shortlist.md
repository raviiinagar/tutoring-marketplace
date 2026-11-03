# Improve Tutor cards and Saved Tutors

Status: ready-for-agent
Resolution: completed locally
Type: task

## Acceptance

- Use existing Tutor records/photos/rates and saved API; no invented ratings/trials/supply.
- Heart remains outside profile links; signed-out modal has correct Tutor identity and usable close/focus behavior.
- Confirmed save/remove is visible; errors retain saved state; duplicate controls share pending state; account changes do not leak the previous shortlist.
- Saved list supports search/subject filtering, truthful counts, unavailable placeholders/removal and empty/retry states.
- Desktop/390px/320px layouts, browser save lifecycle fixtures, tests/typecheck/build and REA evidence recorded.

## Comments

3 November 2026: implementation from 07b0c59 in isolated worktree. Existing saved backend and card schema reviewed. Competitor auth-gate and card layout observed; logged-in competitor shortlist remains unknown.

Final local acceptance: 119 UI tests, TypeScript and production build pass. Real-browser desktop/390px/320px checks with actual public Tutor records and isolated account/save fixtures pass with zero page errors. Reference/acceptance evidence: docs/ops/tutor-cards-saved-2026-11-03.md.
