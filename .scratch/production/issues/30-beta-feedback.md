# 30: Beta feedback, bug reports and the suggestion board

Status: ready-for-agent
Type: task
Blocked by: 03 — Scoped staff MFA; 22 — Support cases; 23 — Privacy export and deletion

The owner asked on 10 November 2026 for in-product beta feedback, managed from the staff console. The decisions are recorded in ADR0016. Community chat is a separate later ticket.

## Acceptance criteria

- [x] Signed-in members send Bug, Suggestion, Feature request or UI/UX feedback with a title, description and optional screenshot, and track its status and the team's replies.
- [x] Bugs and UI/UX reports are private. Suggestions and feature requests appear on a members-only board straight away, without the author, and refuse contact details and links.
- [x] Members upvote a board item once and can remove the vote.
- [x] Screenshots are size- and type-checked, scanned, stripped of metadata, stored encrypted, visible only to the author and audited Support staff, and deleted on resolve.
- [x] Support staff with MFA filter, inspect, set status and priority, reply, add staff-only notes and hide or unhide items; every opening and action is audited with a reason and checked against the item's revision.
- [x] Privacy export and account deletion include feedback, history, screenshots and votes.
- [x] `BETA_FEEDBACK_ENABLED` turns the feature off without a code change; it is off by default in production.

## Comments

### 10 November 2026 — implementation evidence (branch `feature/beta-feedback`)

- `apps/api/test/feedback.test.ts`: 4/4 pass against an isolated PostgreSQL. Two negative controls were run and reverted: letting staff-only history reach the member failed the privacy test, and counting a repeated vote failed the vote test.
- Full API suite: 240 tests, 239 pass, 0 fail, 1 skipped (the existing PostgreSQL 16 recovery drill). `privacy.test.ts` now covers feedback export and deletion.
- UI: typecheck clean, lint clean on the new files, 260/260 unit tests pass.
- Browser: `tests/browser/feedback.spec.ts` passes. A member sends a bug, the board refuses a suggestion containing a phone number, an idea is posted and upvoted, Support staff with MFA filter, note and change the status, the member sees the reply but not the note, and the 390 px page has no horizontal scroll. While writing it, a 13-digit timestamp in a title was refused by the phone filter; that is the expected behaviour, and the fixture was changed.
- Screenshot uploads were exercised in the API tests only. The browser test environment's fictional scanner accepts only marked files, which the in-browser re-encode removes.
