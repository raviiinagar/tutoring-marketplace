# Unified My messages inbox - 7 November 2026

Historical pre-port report from `a284a9b`. For release-line results, see [the port report](messages-inbox-on-release-2026-11-07.md).

Implemented locally on `feature/messages-inbox`, based on clean snapshot `64de3e8`. **Not committed, pushed or deployed. No Superprof account or website was accessed.**

## Design and behavior

`/connections?conversation=<id>` is the single inbox. Desktop keeps the contact list and selected chat side by side; below 768px, selecting a conversation replaces the list with the conversation pane, and Back to conversations restores list focus. The workspace header/tab bar remains mounted. Tutors retain their teaching navigation, whose My messages link now opens this inbox. Existing pending-request pages remain linked separately.

Messages, Details and Classes & Google Meet are URL-addressable sections of the selected pane (`view=details` / `view=classes`). Refresh and browser history restore the selection/section. Selecting uses TanStack client-side links, not a full-document navigation. Legacy `/chat/<id>` redirects to messages; `/connections/<id>` redirects to Details, preserving `#classes`. The legacy redirects stay client-only because a server never receives a URL fragment.

The existing ChatRoom supplies history, SSE/recovery, receipts, text-only adult notice, Connected status, 2,000-character composer, Shift+Enter, safe unknown-outcome retry and report/block actions. Only the active messages section mounts it; changing conversation/section or returning to the list closes its stream. Unavailable Connections display the existing explanatory reason and authorized detail/error state inside the pane.

Server-confirmed read responses update the list immediately. Stale list/history/SSE responses cannot restore an obsolete count after a confirmed read; the visible list also refreshes every 15 seconds/on focus. History fetches alone do not mark a conversation read. Unsent drafts/retry state remain in the mounted ChatRoom only; switching conversations/sections or refreshing discards them, preserving the previous navigation behavior rather than adding persistent draft storage.

Contact disclosure still requires **Show verified contact**, returning only the server-authorized verified adult account email. No contact details are fetched by default. Switching sections/accounts, refreshing access or losing focus clears a revealed contact. Classes reuse ClassInvitations and its existing authorization/Join actions. No API source, payment/pass/tuition/deadline rules, permissions or migrations changed.

## Research evidence and limits

Only the saved [Superprof account-journey research](../superprof-user-flows.md) was used:

- **Observed**, section 1.1: Dashboard / My messages / My Account, additional Tutor navigation, and a messages URL that varied with account state.
- **Help**, section 3.5: accept/refuse from My Messages within the documented response window; refusal can include a personalized message.
- **Help**, section 2.5: an accepted request enables dashboard messaging; Superprof describes contact disclosure through a profile picture. Our explicit verified-email action is retained instead.
- **UNKNOWN:** Superprof's actual inbox visual layout was not captured. The split-pane/mobile design is our own assumption, not an observed Superprof layout. No Superprof wording, images or new styling was copied.

## Link audit

| Source | Result |
| --- | --- |
| `apps/api/src/notifications.ts` | Existing `/chat/<id>` notification/email targets retained; tested legacy redirect handles them without a backend change. |
| `routes/requests.tsx`, `routes/tutor_.requests.tsx`, `components/contact-request-form.tsx` | View/Open Connection now targets the selected inbox Details section directly. |
| `components/class-invitations.tsx` | Superseded UpcomingClass navigation/banner removed; complete ClassInvitations is available in the in-pane Classes section. Old `#classes` URLs remain tested. |
| `components/chat-room.tsx` | Standalone header, main/back launcher, Details-page link and UpcomingClass chrome removed; pane navigation owns these destinations. |
| Reviews / safety / earlier `apps/web` reference | Search found no additional active old inbox links requiring changes; review/safety destinations and all server paths remain unchanged. |
| Legacy route files | Kept as redirect shims, removing their standalone page implementations. No route/file deleted. |

## Verification

| Command/check | Before | After |
| --- | --- | --- |
| `npx tsc -p lovable-ui --noEmit` | Passed | Passed |
| `npm --prefix lovable-ui test` | 197 passed, 0 failed | 210 passed, 0 failed (42 files) |
| `npm run test:browser` (Chrome, isolated local stack) | 4 passed / 14 failed / 1 skipped | 8 passed / 14 failed / 1 skipped |
| Final inbox-only browser run | New | 4 passed / 0 failed / 0 skipped |
| Inbox-scoped axe | New | Zero violations in chat and classes, Learner/Tutor at 1440/390px |
| `npm --prefix lovable-ui run build` | NOT RUN as a baseline | Passed |
| Exact `npm --prefix lovable-ui run lint` | NOT COMPLETED | NOT COMPLETED |
| Repeatable source/config lint, generated hosting artifacts excluded by command flags | 6618 errors / 41 warnings | 5933 errors / 43 warnings |
| Full API suite / real connected browser journey beyond obsolete setup | NOT RUN for this frontend task | NOT RUN; API sources unchanged |

The exact full lint commands were attempted, produced no completed results during prolonged runs and were stopped. **UNKNOWN:** precise stall cause; generated hosting artifact processing is suspected because excluding `.netlify` and `.wrangler` completes. No lint rule/configuration was changed. Source/config runs use `npm --prefix lovable-ui run lint -- --ignore-pattern .netlify --ignore-pattern .wrangler --format json`; remaining errors are existing formatting/typing debt. New inbox files have zero lint errors. New helper-export/ref-cleanup warnings remain disclosed; the ref warnings concern monotonic request counters, not DOM references.

The four new browser journeys use controlled fictional API/SSE fixtures and actual TanStack routes/DOM. They verify desktop/mobile selection, retained tabs, focus and browser Back, refresh/deep links/old URL redirects (including classes hash), unread clearing, single stream cleanup, explicit contact disclosure, classes, unavailable states and the mobile empty-state search action. They do not replace a real-server authorization audit. Existing stream parsing and class tests remain. UI coverage also exercises delayed unread/list frames, stale conversation messages, access revocation, and retrying the same message identity.

The inherited skipped browser case is the built-performance/LCP lab, whose development-harness condition is unchanged. No test was skipped or deleted for this change. Existing Connection-link expectations now assert the new addressable inbox URLs; all filter, unread, unavailable, empty/error and sign-in assertions remain. The empty-state destination assertion is scoped to its original pane because mobile now has a second reachable search action; it still requires `/tutors`.

### Existing full-browser failures

All original outcomes match the fresh baseline. These are not newly attributed to the inbox. Known failures include obsolete page headings/navigation, ambiguous password labels and the existing global label-content-name-mismatch finding. **UNKNOWN:** the exact cause of baseline catalogue/payment/staff timeouts; no unrelated fixes were attempted. The Tutor journey stops at its old account-heading setup, before real connected-chat assertions, so those downstream assertions remain **NOT VERIFIED** here.

| File | Test | Result |
| --- | --- | --- |
| `accessibility.spec.ts` | keyboard users skip navigation and recover focus after mobile menu and route changes | Failed before and after |
| `accessibility.spec.ts` | discovery and authentication expose labelled forms, contrast and announced errors | Failed before and after |
| `accessibility.spec.ts` | signed-in mobile and desktop checkout, Tutor, support and privacy forms are accessible | Failed before and after |
| `account.spec.ts` | Lovable account journey from http://localhost:3100 | Failed before and after |
| `account.spec.ts` | Lovable account journey from http://127.0.0.1:3100 | Failed before and after |
| `catalogue.spec.ts` | public catalogue aliases and Trust maintenance stay consistent | Failed before and after |
| `discovery.spec.ts` | mobile public search has honest empty results across eight families and unavailable detail | Failed before and after |
| `learners.spec.ts` | private adult profile and fictional Guardian approval, child consent withdrawal and revocation | Failed before and after |
| `operations.spec.ts` | operations console records scoped health, pauses checkout and keeps mobile recovery controls private | Failed before and after |
| `payments.spec.ts` | mobile Access Pass page shows the real server price and keeps unconfigured payments disabled | Failed before and after |
| `privacy.spec.ts` | verified export and deletion complete with a read-only receipt on mobile | Failed before and after |
| `staff.spec.ts` | staff MFA enrollment, scoped console, audit and authenticator recovery | Failed before and after |
| `support.spec.ts` | owner and scoped staff exchange a support case while private notes stay staff-only | Failed before and after |
| `tutors.spec.ts` | fictional Tutor evidence, private reviewer download, approvals and revocation | Failed before and after |

## Phase 2 assessment only

Pending **Contact Requests** could be projected into this inbox using the existing owner `GET /v1/me/contact-requests` and Tutor `GET /v1/me/tutor-requests` pages, followed by `POST /v1/me/tutor-requests/:id/decisions` for eligible ACCEPT/DECLINE actions. No migration or API change appears necessary for basic pending cards and the existing decisions. After acceptance, the returned Connection ID could select its conversation.

It would require separate request/Connection discriminators, independent pagination, safe empty/closed states, an accessible mixed-list filter, and deadline displays anchored to server_time/expires_at and current can_accept/can_decline. Never calculate an unconditional fresh 72 hours: the existing immutable matching deadline can shorten the response window, and equality is expired. Keep all coverage/beneficiary/Guardian/safety checks and transactions on the server; a pending request must not start chat or reveal contact details.

Risks: stale decisions/deadline drift, conflating a pending enquiry with an authorized Connection, confusing Contact Requests with scheduled Class Invitations, leaking closed/child request text, and mixing independent cursors/unread counts. Superprof's personalized refusal message is **not** supported by the existing strict decision payload; adding that would require a separate additive API/privacy-policy decision. It is not implemented. No current contact-policy question blocks Phase 1; phone disclosure or profile-picture disclosure would require a separate policy change and was not added.

## Files and preservation

Snapshot HEAD and the index are unchanged. No existing file was deleted; 994 originally recorded files remain byte-identical outside the 13 intentional existing-file edits. No hand edit to `routeTree.gen.ts` was made; TanStack generated routing normally. Local runtime logs/traces, synthetic account data and test databases stay ignored; no secret values are included in this report or its evidence.

Changed/created files:

- `docs/api/chat.md`
- `docs/qa/evidence/2026-11-07/inbox-1440.png`
- `docs/qa/evidence/2026-11-07/inbox-390.png`
- `docs/qa/evidence/2026-11-07/messages-inbox-checks.json`
- `docs/qa/messages-inbox-2026-11-07.md`
- `lovable-ui/src/components/account/ui.tsx`
- `lovable-ui/src/components/chat-room.tsx`
- `lovable-ui/src/components/class-invitations.tsx`
- `lovable-ui/src/components/connection-details.tsx`
- `lovable-ui/src/components/contact-request-form.tsx`
- `lovable-ui/src/components/tutor-workspace-navigation.tsx`
- `lovable-ui/src/routes/chat.$connectionId.tsx`
- `lovable-ui/src/routes/connections.tsx`
- `lovable-ui/src/routes/connections_.$connectionId.tsx`
- `lovable-ui/src/routes/requests.tsx`
- `lovable-ui/src/routes/tutor_.requests.tsx`
- `lovable-ui/src/styles.css`
- `lovable-ui/src/test/connections-reference.test.tsx`
- `lovable-ui/src/test/inbox-routing.test.ts`
- `lovable-ui/src/test/inbox.test.tsx`
- `tests/browser/inbox.spec.ts`

Evidence: [checks JSON](evidence/2026-11-07/messages-inbox-checks.json), [desktop](evidence/2026-11-07/inbox-1440.png), [mobile](evidence/2026-11-07/inbox-390.png).
