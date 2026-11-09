# Beta feedback and suggestion board

ADR0016. Member page: `/feedback` (linked from the account Help section, the Learner dashboard and the homepage footer). Staff page: `/staff/feedback` (staff console, Service → Beta feedback; `SUPPORT` scope with MFA).

## Switch

`BETA_FEEDBACK_ENABLED=true|false`. If unset, it is on outside production and off in production. When it is off, `/v1/feedback-policy` reports `enabled:false` and every other route answers 404 `FEATURE_DISABLED`. Any other value stops the API from starting.

## Member API

| Method/path | Behaviour |
|---|---|
| GET `/v1/feedback-policy` | Public. `enabled`, `screenshots_enabled` (scanner configured), categories, the categories shown on the board, statuses, `max_screenshot_bytes`, privacy notice |
| GET `/v1/me/feedback` | The caller's latest 100 items (summaries) and the policy |
| POST `/v1/me/feedback` | `{request_key,category,title,description,screenshot?:{media_type,data}}`, where `category` is `BUG`, `SUGGESTION`, `FEATURE_REQUEST` or `UI_UX`. Title is 5–120 characters and description 10–2000. Suggestions and feature requests that contain contact details or links are rejected with 400. Retrying with the same `request_key` returns the original item; reusing the key with a different payload returns 409. Limited to 10 per account per day. Restricted accounts get 403 |
| GET `/v1/me/feedback/:id` | Owned item with the history the member can see: status changes, staff replies, hide/unhide. Staff notes, priority, reasons and staff identities are excluded. Someone else's item returns 404 |
| GET `/v1/me/feedback/:id/screenshot` | Owner-only JPEG, `Cache-Control: no-store` |
| GET `/v1/feedback/board?sort=top\|new&category=` | Signed-in members. Up to 100 visible suggestions and feature requests: id, category, title, description, status, vote count, whether you voted, whether it is yours. No author identity |
| POST `/v1/feedback/board/:id/votes` | `{}`. Adds one vote, idempotent. Hidden or private items return 404. Limited to 120 per hour |
| DELETE `/v1/feedback/board/:id/votes` | `{}`. Removes your vote, idempotent |

Screenshots must be a PNG or JPEG of at most 1 MiB and 16 million pixels whose content matches the declared type. They are scanned, then re-encoded to a JPEG of at most 1600 px, which strips EXIF and location data. A scanner rejection returns 400 `SCREENSHOT_REJECTED`; a scanner error returns 503, and no feedback is created in either case. The page shrinks screenshots in the browser before uploading them. A screenshot is deleted when its item is resolved.

## Staff API (`SUPPORT` scope with MFA)

| Method/path | Behaviour |
|---|---|
| GET `/v1/staff/feedback?reason=&status=&category=&priority=` | Audited queue of up to 100 items. Unresolved first, then by priority, then by votes. Titles only, no descriptions |
| POST `/v1/staff/feedback/:id/inspections` | `{reason}`. Full item, all history and owner id; audited |
| POST `/v1/staff/feedback/:id/screenshot-inspections` | `{reason}`. Screenshot JPEG, `no-store`; audited |
| POST `/v1/staff/feedback/:id/actions` | `{revision,operation,reason,status?,priority?,message?}`. Operations are `SET_STATUS`, `SET_PRIORITY`, `REPLY`, `NOTE`, `HIDE` and `UNHIDE`. Priority changes and notes are staff-only; everything else appears in the member's history. A stale revision, hiding a private item or a no-op change returns 409. Resolving deletes the screenshot |

Reasons are 10–240 characters. Every action writes an audit event (`FEEDBACK_*`) with the reason and no message body.

## Storage and privacy

Migration `039-beta-feedback.sql` adds `feedback_items`, `feedback_events` and `feedback_votes`. Titles, descriptions, history payloads and screenshots are encrypted with the application key. Production hides fixture (`test_only`) rows. Privacy export includes the account's feedback, the history it can see, any current screenshot and its votes. Account deletion removes its votes (decrementing counts), hides and redacts its feedback and history, and deletes screenshots.

## Tests

`apps/api/test/feedback.test.ts` covers privacy and ownership, scope and MFA, staff-only content, the revision check, deleting the screenshot on resolve, audit events, the board without authors, the contact filter, one vote per member, hiding, unsafe and malformed screenshots, and the switch. `privacy.test.ts` covers export and deletion.
