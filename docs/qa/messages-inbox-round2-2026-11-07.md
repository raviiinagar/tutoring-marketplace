# Inbox Round 2 - 7 November 2026

Branch: `feature/messages-inbox-round2`, isolated worktree `.local/messages-inbox-round2`, based on `feature/messages-inbox-on-release` at `94f86b7`. No main-checkout source edits, deployment, push, Superprof access, API/contract/migration/package/config changes.

## Phase 1: reproduced cause and fix

The unchanged base fails all six new geometry cases. The message log is 40px at ordinary laptop/mobile sizes; even 1920x950 provides only 30% of the inbox. The fixed viewport subtraction, repeated headers/title, and large composer consume the available height. A browser-only probe confirmed hiding one header alone is insufficient.

The inbox now fills the actual space below the shared header/tab bar using flex layout. A compact header contains Back, one truncated conversation title, and section links; the full title remains in accessible text, the native title tooltip and Details. Sidebar titles clamp to two lines. The duplicate Private chat header is removed. Connection status, Report or block, and the complete unchanged adult/text/tuition notice remain visible in a compact strip.

The message log takes the remaining space and scrolls independently of the pinned composer. The textarea starts at two lines and grows to five, then scrolls internally. The counter/hint and Send sit beside it where space permits. Existing Enter/Shift+Enter, 2000-character limit, retry identity, SSE/revocation/read state, routes, explicit verified-contact action and server policies are retained. Below a 600px desktop / 650px mobile floor the document scrolls, preserving a 240px minimum log and reachable composer. Conversation sidebar and Details/Classes may scroll independently; there is no nested scrolling ancestor around the message log at the six required sizes.

## Measurements

All values are CSS pixels, actual Playwright bounding boxes at normal browser zoom with six messages, a long ad title and a 350-character unbroken message. Send/composer are fully inside the viewport without document scrolling after the fix. No horizontal overflow or scrolling ancestors of the log; inbox-scoped axe reports zero violations in all six cases.

| Viewport | Before log | Before share | After log | After inbox | After share |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1366x650 | 40 | 8.7% | 363 | 502 | 72.3% |
| 1536x730 | 40 | 7.4% | 443 | 582 | 76.1% |
| 1280x600 | 40 | 9.5% | 313 | 452 | 69.2% |
| 1440x800 | 40 | 6.6% | 513 | 652 | 78.7% |
| 1920x950 | 228 | 30.0% | 663 | 802 | 82.7% |
| 390x700 | 40 | 7.5% | 333.72 | 562 | 59.4% |

[Raw sanitized measurements](evidence/2026-11-07/inbox-round2/measurements.json).

| Screenshot | Before | After |
| --- | --- | --- |
| Laptop 1366x650 | [before](evidence/2026-11-07/inbox-round2/before-1366x650.png) | [after](evidence/2026-11-07/inbox-round2/after-1366x650.png) |
| Desktop 1920x950 | [before](evidence/2026-11-07/inbox-round2/before-1920x950.png) | [after](evidence/2026-11-07/inbox-round2/after-1920x950.png) |
| Mobile 390x700 | [before](evidence/2026-11-07/inbox-round2/before-390x700.png) | [after](evidence/2026-11-07/inbox-round2/after-390x700.png) |

## Phase 1 verification

- Fresh base UI: **233 passed / 0 failed**, 44 files. Final Phase 1 UI: **233 passed / 0 failed**, 44 files.
- New six-case geometry suite on unchanged base: **0 passed / 6 failed**. After: **6 passed / 0 failed**. Assertions were not relaxed.
- Combined inbox browser run: **13 passed / 0 failed** (four existing Learner/Tutor desktop/mobile journeys, six geometry/axe cases, composer-growth case, two short-window cases). Existing disclosure, stream, Back, redirect and unavailable-state assertions retained.
- `npx tsc -p lovable-ui --noEmit`: passed. During implementation the typecheck caught an undefined-title fallback, which was corrected before the final green runs.
- Additional real-API release regression browser journeys: **4 passed / 0 failed**, covering saved avatars after refresh/re-login and Tutor draft resume/photo/publication/removal at 1440/390px.
- API suite, hosted-device/native mobile-keyboard behavior and production build: **NOT RUN**. This frontend-only layout task uses local Chrome with fictional endpoint/SSE fixtures; no claim of hosted verification.

Changed source/test files: `lovable-ui/src/components/chat-room.tsx`, `lovable-ui/src/routes/connections.tsx`, `lovable-ui/src/styles.css`, `tests/browser/inbox.spec.ts`, `tests/browser/inbox-fixtures.ts`, `tests/browser/inbox-layout.spec.ts`. The fixture extraction preserves the four existing browser journeys. This report and seven evidence files are also added. No existing tests were skipped, deleted or weakened.

Policy questions: none. Physical mobile keyboard occlusion is UNKNOWN; CSS viewport/mobile flow is measured above. Superprof layout is not inspected or claimed as observed.

## Phase 2: requests inside the inbox

Started only after Phase 1 was green and committed as `636765a1e1172ffca05c40e4e7c7e80223d65b14`.

A separate native, keyboard-accessible Requests disclosure sits above the conversation list. Tutors get incoming enquiries; Learners get sent history. Mixed-role accounts default to incoming enquiries in this group and retain the existing My class requests link to their sent history. Counts explicitly mean records on the current API page, not a fabricated global/pending total. Pagination uses the supplied cursor. The server has no global aggregate in these existing responses.

The component reuses `api.tutorRequests`, `api.contactRequests`, `api.decideRequest`, `RequestDeadline` and `useSingleFlight`. No API client/contract/server change was necessary. Pending entries are request cards, never chat links. Only an accepted request with a returned Connection ID opens/selects a conversation. Acceptance selects the returned ID (never the request ID), refreshes the Connection list, and preserves the server's active/pending-grant access checks. Decline and stale failures refresh authoritative state without claiming a Connection; focus returns to the Requests disclosure. Leaving the component suppresses late decision navigation.

Tutor buttons require Tutor context AND the matching server capability AND an unexpired pending state from the existing server-anchored deadline component. Equality is expired. No fresh 72-hour period is calculated. Sent history uses only the server's usable learner alias and hides private text/alias for unusable learners; incoming responses contain no learner name field, so none is invented. There is no default email/phone fetch or disclosure. Safety/report links and both existing request-history routes remain available. `/tutor/requests` itself is unchanged and is checked in the browser journeys.

### Final checks

| Required check | Fresh base | Phase 1 | Phase 2 / final |
| --- | --- | --- | --- |
| `npx tsc -p lovable-ui --noEmit` | NOT RUN fresh before edits | Passed | Passed |
| `npm --prefix lovable-ui test` | 233 passed / 0 failed | 233 passed / 0 failed | 242 passed / 0 failed, 45 files |
| Inbox browser (original + new layout/requests specs) | New geometry: 0 passed / 6 failed; original four NOT RUN fresh before edits | 13 passed / 0 failed | 17 passed / 0 failed |
| Additional real-API avatar/onboarding browser | NOT RUN fresh before edits | 4 passed / 0 failed | NOT RUN again after request-only integration |

Nine new UI cases cover server capability gating, returned Connection ID, decline, stale decisions, deadline equality, learner alias/privacy, error/empty recovery, cursor/count semantics and late acceptance after unmount. Four new browser cases cover keyboard acceptance at 1366/390px, retained Tutor request route, safe sent history/error/empty states, deadline equality and stale decisions. Existing four inbox cases and all nine new Phase 1 layout/composer/short-screen cases remain intact.

During the red/green cycle the new checks caught a request heading-level gap and learner buttons rendered from unexpected extra capability fields; both were fixed without changing server rules or relaxing assertions. One original UI assertion now targets the actual Loading Connections status text instead of assuming the inbox has only one status element; all its original loading/error/empty checks remain. Existing fixtures now return an empty request page for the added read. No test was skipped or deleted.

Full API suite, repository-wide lint, production/Cloudflare build, hosted smoke tests and physical mobile keyboard testing: **NOT RUN** for this frontend-only task. No deployment is authorized or attempted. No policy question arose. Global request totals and physical-keyboard occlusion remain UNKNOWN; only page-local counts and measured CSS viewports are claimed.

Final browser evidence: [sanitized checks](evidence/2026-11-07/inbox-round2/checks.json), expanded Requests [desktop](evidence/2026-11-07/inbox-round2/requests-1366.png) / [mobile](evidence/2026-11-07/inbox-round2/requests-390.png). The after screenshots above now show the final Requests group; all six geometry measurements are identical to green Phase 1.

## Files per commit

Phase 1, `636765a`:

- `docs/qa/evidence/2026-11-07/inbox-round2/after-1366x650.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/after-1920x950.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/after-390x700.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/before-1366x650.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/before-1920x950.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/before-390x700.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/measurements.json`
- `docs/qa/messages-inbox-round2-2026-11-07.md`
- `lovable-ui/src/components/chat-room.tsx`
- `lovable-ui/src/routes/connections.tsx`
- `lovable-ui/src/styles.css`
- `tests/browser/inbox-fixtures.ts`
- `tests/browser/inbox-layout.spec.ts`
- `tests/browser/inbox.spec.ts`

Phase 2, the separate commit containing this section:

- `docs/qa/evidence/2026-11-07/inbox-round2/after-1366x650.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/after-1920x950.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/after-390x700.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/checks.json`
- `docs/qa/evidence/2026-11-07/inbox-round2/requests-1366.png`
- `docs/qa/evidence/2026-11-07/inbox-round2/requests-390.png`
- `docs/qa/messages-inbox-round2-2026-11-07.md`
- `lovable-ui/src/components/inbox-requests.tsx`
- `lovable-ui/src/routes/connections.tsx`
- `lovable-ui/src/test/connections-reference.test.tsx`
- `lovable-ui/src/test/inbox-requests.test.tsx`
- `lovable-ui/src/test/inbox.test.tsx`
- `tests/browser/inbox-fixtures.ts`
- `tests/browser/inbox-requests.spec.ts`

Preservation check: main remains clean on `feature/messages-inbox` at `a284a9b`; the source port remains at `94f86b7`. API, contracts, migrations and tracked configuration are unchanged. The local PostgreSQL test data is retained.
