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
