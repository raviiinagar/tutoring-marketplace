# Beta community chat

ADR0017. Member page: `/community` (linked from the account Help section, the Learner dashboard and the homepage footer). Staff page: `/staff/community` (staff console, Trust & safety → Community; `TRUST` scope with MFA).

## Switch

`BETA_COMMUNITY_ENABLED=true|false`. If unset, it is on outside production and off in production. When it is off, `/v1/community-policy` reports `enabled:false` and every other route answers 404 `FEATURE_DISABLED`. Any other value stops the API from starting.

## Member API

Every route needs a signed-in, unrestricted account. Routes other than the overview and joining also need membership; without it they return 403 `COMMUNITY_JOIN_REQUIRED`.

| Method/path | Behaviour |
|---|---|
| GET `/v1/community-policy` | Public: `enabled`, rules and their version, reactions, maximum message length |
| GET `/v1/community` | Policy, `member` (`nickname`, `team`, `muted_until`) or `null`, and the active channels with `can_post` |
| POST `/v1/community/membership` | `{nickname,adult_confirmed:true,rules_accepted:true}`. The nickname is 2–30 letters, numbers, spaces or `._-`, and cannot contain contact details or words such as team, staff, admin, moderator or official. Rejoining updates the nickname and acceptance. Limited to 5 a day |
| POST `/v1/community/membership/nickname` | `{nickname}`. Earlier messages show the new nickname the next time a channel loads |
| DELETE `/v1/community/membership` | `{}`. Leave; access, including open streams, ends straight away |
| GET `/v1/community/channels/:id/messages` | The latest 50 messages in posting order, plus `cursor` and `has_older` |
| GET `…/messages?before=<message id>` | The 50 messages before it |
| GET `…/messages?after=<cursor>` | Up to 200 messages changed since the cursor (new, deleted, removed, pinned or reacted), in change order, plus `has_more` |
| GET `/v1/community/channels/:id/pins` | Up to 20 visible pinned messages |
| GET `/v1/community/channels/:id/events?after=<cursor>` | Server-sent events. Each `changes` frame has the same shape as `?after=`. `access-revoked` is sent when the session, membership or channel ends; `reconnect` on other errors. The connection is checked before headers are sent, so a refusal is an ordinary JSON error. Limited to 4 streams per session and 300 per server |
| POST `/v1/community/channels/:id/messages` | `{request_key,body,reply_to?}`. The body is 1–1000 characters with no contact details or links, and `reply_to` must be in the same channel. Team-only channels need a verified staff session (`TRUST` or `SUPPORT` with MFA). Muted members get 403 `MUTED`. Limited to 8 a minute and 300 a day. The same request key returns the original message; a different payload returns 409 |
| DELETE `/v1/community/messages/:id` | `{}`. Author-only delete. Someone else's message returns 404 |
| POST / DELETE `/v1/community/messages/:id/reactions` | `{emoji}`, one of `THUMBS_UP`, `HEART`, `LAUGH`, `CELEBRATE`, `THINKING` or `EYES`. Idempotent. Adding is limited to 120 an hour and refused while muted |
| POST `/v1/community/messages/:id/reports` | `{category,note?}`, where `category` is `SPAM`, `HARASSMENT`, `CONTACT_DETAILS`, `INAPPROPRIATE` or `OTHER` and the note is at most 500 characters. One per member per message. Your own message returns 409. Limited to 20 a day |

A message has `author` (`nickname`, `team`, `own`), `body` (`null` unless visible), `status`, `pinned`, `reply_to` (`id`, `nickname`, `excerpt`, where `excerpt` is `null` once the original is gone), `reactions` (`emoji`, `count`, `mine`), `change_seq` and `created_at`. Account ids and real names are never shown to members.

## Staff API (`TRUST` scope with MFA)

| Method/path | Behaviour |
|---|---|
| GET `/v1/staff/community/reports?reason=` | Audited. Messages with open reports: full text, channel, author nickname and account id, and the reports |
| POST `/v1/staff/community/messages/:id/actions` | `{operation,reason}`. `REMOVE` also marks the open reports as actioned. `RESTORE` only works on a message staff removed. `PIN` and `UNPIN` need a visible message. `DISMISS_REPORTS` needs open reports. A state conflict returns 409 |
| GET / POST `/v1/staff/community/mutes` | List active mutes, or `{user_id,hours,reason}` with hours from 1 to 8760 to mute and 0 to lift. You cannot mute yourself |
| GET `/v1/staff/community/channels` | All channels, including archived ones |
| POST `/v1/staff/community/channels` | `{name,description,staff_only_posting,position,reason}`. The slug is derived from the name; a duplicate returns 409 |
| POST `/v1/staff/community/channels/:id` | Any of `name`, `description`, `staff_only_posting`, `position` and `archived`, plus `reason`. Archived channels return 404 to members |

Reasons are 10–240 characters. Every action writes an audit event (`COMMUNITY_*`) with the reason.

## Storage and privacy

Migration `040-community-chat.sql` adds `community_members`, `community_channels` (with the five seeded channels), `community_messages` (with a posting `sequence` and a `change_seq` taken from `community_change_seq`), `community_reactions`, `community_reports` and `community_mutes`. Message text and report notes are encrypted. Production hides fixture (`test_only`) messages. Privacy export and account deletion are covered as described in ADR0017.

## Tests

`apps/api/test/community.test.ts` covers the join rules, nickname privacy, the contact filter, replies, reactions, idempotency, author deletion, cursor sync, paging, the rate limit, team-only posting and the badge, reports, removing and restoring, pins, mutes and their expiry, channel management, audit events, live delivery over a real stream and revocation when a member leaves, and the switch. `privacy.test.ts` covers export and deletion. `src/test/community-merge.test.ts` covers merging live changes on the client. `tests/browser/community.spec.ts` runs two members chatting live in separate browsers, with a reply, a reaction, a report and a moderator removal, at desktop and 390 px widths.
