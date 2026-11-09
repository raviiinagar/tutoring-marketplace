# 31: Beta community chat with moderation

Status: ready-for-agent
Type: task
Blocked by: 03 — Scoped staff MFA; 13 — Safety reports and blocking; 23 — Privacy export and deletion; 30 — Beta feedback

The owner asked on 10 November 2026 for a live community for beta members and the team. The decisions are recorded in ADR0017, building on ADR0015 and ADR0016.

## Acceptance criteria

- [x] Only signed-in, unrestricted accounts that confirm they are 18 or older and accept the rules can read or post. Members appear under a nickname; signed-out visitors, private messages and member-created channels are not available.
- [x] The Announcements, General, Bug reports, Feature ideas and Help & support channels exist. Announcements are posted only by verified team members, whose posts carry a Team badge.
- [x] Members post, reply, react, delete their own messages and load older history. New messages, deletions, reactions, pins and removals reach other members' screens live.
- [x] Contact details and links are refused; posting, reacting and reporting are rate-limited; retries are idempotent.
- [x] Trust staff with MFA review reports, remove and restore messages, pin and unpin, dismiss reports, mute and unmute members, and create, restrict and archive channels. Every view and action is audited with a reason.
- [x] Privacy export and account deletion cover membership, messages, reactions, reports and mutes.
- [x] `BETA_COMMUNITY_ENABLED` turns the feature off without a code change; it is off by default in production.

## Comments

### 10 November 2026 — implementation evidence (branch `feature/community-chat`)

- `apps/api/test/community.test.ts`: 7/7 pass against an isolated PostgreSQL, including live delivery over a real event stream. Negative controls were run and reverted: removing the `NOTIFY` wakeup failed the live-stream test, and removing the contact filter failed the messaging test.
- Full API suite: 247 tests, 246 pass, 0 fail, 1 skipped (the existing PostgreSQL 16 recovery drill). `privacy.test.ts` covers community export and deletion.
- UI: typecheck and lint clean on the new files; 262/262 unit tests pass, including `community-merge.test.ts`.
- Browser: `community.spec.ts` and `feedback.spec.ts` pass. Two members in separate browsers receive messages, replies and reactions live; a member sees the phone-number refusal; a report goes to a Trust moderator, who removes the message; the removal and the cleared reply quote reach the other member live; there is no horizontal scroll at 390 px.
- Issues found and fixed during testing:
  - History paging used timestamps, which can tie; it now uses a posting sequence.
  - Concurrent writes could commit change numbers out of order and be skipped by a reader's cursor; writers now lock the channel.
  - Replies on screen kept quoting a removed message; the live merge now clears the quote.
  - The nickname hint was part of the field's accessible name; it is now linked as a description instead.
