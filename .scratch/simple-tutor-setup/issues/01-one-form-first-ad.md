# One-form first-ad setup

Status: ready-for-agent
Type: task

Implement the owner's [one-form setup](../spec.md) from committed project baseline d9787eb in an isolated worktree. Preserve unrelated work.

## Acceptance

- [x] One short form and preview, with no repeated name/rate/introduction entry.
- [x] Current catalogue selections and conditional board/exam/city fields.
- [x] Encrypted partial draft resume; no image bytes stored in the draft.
- [x] Saving and preview remain private; publication is explicit and server-authorized.
- [x] Suitable saved photo reused; new uploads retain consent/scanning/review rules.
- [x] Existing identity/public-email settings and availability preserved.
- [x] Retry after a lost create response reuses the same draft ad.
- [x] Existing staff-assisted flow remains available.
- [x] Desktop/mobile browser and accessibility evidence recorded in the QA report.
- [x] Final UI, type, lint and build results recorded, including unrelated full-lint debt.

## Verification evidence

See `docs/qa/simple-tutor-setup-2026-11-17.md` for the final commands, results and screenshots. Existing assertions are preserved; browser navigation/selectors change to exercise the new first-ad form.
