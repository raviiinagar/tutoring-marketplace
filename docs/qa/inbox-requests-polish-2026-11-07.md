# Inbox Requests polish - 7 November 2026

Branch: `fix/inbox-requests-polish`. Isolated worktree: `.local/inbox-requests-polish`. Base: `feature/messages-inbox-round2` at `d03de1377b600d2f622313fe1ea8a3c5992f9f7a`. Main checkout and source branch are preserved. No deployment, push, API/client-contract, migration, package or tracked configuration changes.

## Behavior

- Requests defaults open for a Tutor when the loaded page contains an unexpired PENDING request with server-authorized `can_accept` or `can_decline`. Fresh empty, closed, expired, denied and Learner request groups default collapsed. Native summary keyboard controls remain available; expansion does not move focus. Manual toggles are respected, and decision feedback remains visible after the last actionable request closes. Pagination resets the default for the newly loaded page.
- Summary reads `Requests (N pending)` for actionable requests and simply `Requests` otherwise. A note inside the section clarifies that pending counts cover only the loaded page. The unchanged remaining-time formula is shared with RequestDeadline; the count follows server_time/expires_at and monotonic elapsed time, with equality expired. No new 72-hour period or global total is invented.
- Empty Tutor conversations say: "No conversations yet. Accepted enquiries appear here." View pending requests opens the Requests section and focuses its summary only after the user activates that link. Learner copy and Search for a teacher actions remain intact; the existing Tutor search action also remains reachable, preserving the original browser assertions.
- Server capability/decision rules, private learner alias behavior, explicit verified-contact disclosure, chat subscriptions, unread state, old links/redirects, payment/access and safety behavior are unchanged.

## Verification

| Check | Before | After |
| --- | --- | --- |
| `npm --prefix lovable-ui test` | Fresh baseline: 242 passed / 0 failed, 45 files | 249 passed / 0 failed, 45 files |
| `npx tsc -p lovable-ui --noEmit` | NOT RUN as a fresh baseline | Passed, exit 0 |
| New polish browser case | 0 passed / 1 failed on unchanged application code (default expansion) | 1 passed / 0 failed |
| All inbox browser specs | Existing 17 NOT RUN as a fresh pre-change baseline | 18 passed / 0 failed / 0 skipped / 0 flaky |

Browser command: `node node_modules/@playwright/test/cli.js test tests/browser/inbox.spec.ts tests/browser/inbox-layout.spec.ts tests/browser/inbox-requests.spec.ts tests/browser/inbox-requests-polish.spec.ts --config .local/browser-ready.config.ts` with local Chrome. The ignored harness uses a frontend-only Vite server and fictional API/SSE route fixtures. No database or backend was needed for these tests.

The seven added UI cases cover accept-only and decline-only capabilities without focus stealing; closed/denied/expired defaults; mixed-status pending counts expiring at the server deadline; and Tutor empty-state navigation. Existing Learner empty-state coverage now additionally asserts its exact unchanged copy. The browser case verifies delayed request arrival retains search focus, automatic expansion/count, Tutor copy, native keyboard collapse, and explicit link expansion/focus. All original layout thresholds, inbox axe assertions, privacy, authorization-denial, retry, stream, redirect and unread assertions remain; no test was deleted or skipped. Summary wording expectations were updated to the requested copy, and the existing request browser helper now asserts automatic opening plus keyboard close/reopen before its original journey.

The six layout cases and inbox accessibility scans remain green, including the expanded-request state. [Sanitized counts](evidence/2026-11-07/inbox-requests-polish/checks.json).

Tutor with one pending request and no conversations, 1366x650: [before](evidence/2026-11-07/inbox-requests-polish/before-1366x650.png) / [after](evidence/2026-11-07/inbox-requests-polish/after-1366x650.png). Both screenshots use the same fictional data and retain focus in the contacts search box.

Full API suite, repository-wide lint, production build, hosted smoke tests and physical-device/mobile-keyboard tests: **NOT RUN**. Hosted behavior and physical-device behavior are UNKNOWN for this local task. No new policy question arose.

## Changed files

- `lovable-ui/src/components/inbox-requests.tsx`
- `lovable-ui/src/components/request-deadline.tsx`
- `lovable-ui/src/routes/connections.tsx`
- `lovable-ui/src/test/inbox-requests.test.tsx`
- `lovable-ui/src/test/connections-reference.test.tsx`
- `tests/browser/inbox-requests.spec.ts`
- `tests/browser/inbox-requests-polish.spec.ts`
- `docs/qa/inbox-requests-polish-2026-11-07.md`
- `docs/qa/evidence/2026-11-07/inbox-requests-polish/checks.json`
- `docs/qa/evidence/2026-11-07/inbox-requests-polish/before-1366x650.png`
- `docs/qa/evidence/2026-11-07/inbox-requests-polish/after-1366x650.png`
