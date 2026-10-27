# Google Meet Class Invitations - 27 October 2026

The owner selected website scheduling and a Join class button opening Google Meet. The supplied-link implementation is deployed on the existing ordinary preview and fictional payment sandbox. Automatic Meet room creation, embedded video, attendance verification and recording are not included.

## User flow

Open an authorized Connection or use the Classes & Google Meet shortcut in its private chat. The Tutor selects Schedule class, enters title, IST date/time, duration and a real existing Meet URL, then saves. The Learner sees the saved class and its updated/cancelled state. Join opens 15 minutes before start through 15 minutes after scheduled end, and rechecks current Connection/class permissions.

For a real room, the Tutor uses their own Google account in their normal browser: Google Meet, New meeting, Create a meeting for later, then copy the generated link into the Tutor form. Provider instructions: https://support.google.com/meet/answer/9302870 . Saving a syntactically valid fixture URL is not proof that a Google room exists or that users were admitted.

The two fictional account windows were opened for hands-on scheduling, with the Tutor form on the right and Learner view on the left. For an immediate manual Join test, choose a start five minutes ahead, placing it inside the joining window. No Google password or OAuth credential is requested by the marketplace.

## Verified acceptance

- New API scenarios: 5 passed, using real isolated PostgreSQL and authenticated HTTP. Covers Tutor/participant boundaries, encrypted payloads, idempotent save, optimistic revision conflicts, time/URL/overposting validation, authoritative Join, cancellation, safety block, personal export and actual privacy-worker erasure.
- Existing chat/privacy regression scenarios: 19 passed.
- Full UI suite: 48 tests passed. API/UI TypeScript and focused UI lint passed.
- Hosted sandbox browser test at 1280px/390px passed Tutor scheduling, Learner saved-card visibility, Join authorization/navigation, reschedule persistence after reload, disabled early Join, cancellation, cancelled Join denial and unrelated-account denial. No horizontal overflow. Fictional screenshots were inspected locally.
- Automated Google navigation was intercepted and aborted after verifying the canonical destination; no actual Google video-call success or room creation is claimed. The Tutor must supply a real host-created link for that separate human check.

Sanitized evidence: [Class Invitation acceptance](evidence/google-meet-classes-2026-10-27.json). API and privacy semantics: [classes.md](../api/classes.md).

## Release provenance and rollout

- Reviewed source: `50b4c92c6243cba187940b85c138329b2bda9d7a`, branch `feature/class-invitations`.
- Ordinary preview UI: `45b3798b36a58a4d7a6b50426f837f6704c304fb`, ready Netlify deploy `6ae026e546feb266c7b88661`.
- Sandbox UI: `8d7ae851390693fb308ce81f1ca56b61b6d2537e`, ready deploy `6ae024ff8a3d782c4102f3e5`. Its dedicated SSR/browser API routing remains isolated.
- Backend release: `classes-20261027-50b4c92c6243` on both API/worker pairs. This is a reviewed portable API overlay on the earlier checksum-verified Linux artifact, not a new full CI/Linux build claim. It contains eleven allowlisted compiled JS/declaration/migration files; the native Linux dependencies were copied from the verified base with an identical package-lock SHA256. No Windows native modules, local database, private environment files or captured mail were shipped.
- Overlay archive SHA256: `1014cf9029cf05d251d28efded4c405aeff094c24d21541f1d63904635301fe8`. Per-file hashes, archive traversal/type checks, source commit/lock checks, candidate manifest verification and an actual Linux module import check passed. The derived runtime manifest has 421 entries; provenance is included under its deployment directory.
- Migration 029 adds only the Class Invitation table/index. It was applied separately to sandbox and ordinary staging after verifying 28 existing migrations. Application DML and backup SELECT grants were added only for the new table. The ordinary application's dedicated migrator used its protected verified-TLS configuration; credentials were not printed.
- The independent encrypted ordinary-staging backup service succeeded immediately before and after promotion, including verified upload/read-back. API/worker services, health checks and anonymous Class Invitation authentication denial passed on both origins. Ordinary checkout remains disabled; sandbox checkout remains test-only.
- Protected runtime configuration changed only RELEASE_ID. Auth secret, database URL, exact web origin and payment mode were compared inside a child process and remained equal. The older locally saved bootstrap login credential returned 401 INVALID_CREDENTIALS during the post-promotion owner smoke, so that owner-login check is not marked passed for this rollout. No password was reset or changed. The supplied-link feature's authenticated functional evidence is from the fictional sandbox accounts.

No new AWS resources or paid video service were created. The existing 30 October 2026 00:23:31 IST VM stop deadline remains unchanged. Old runtime candidates that do not support migration 029 must not be blindly restarted against these databases; use a candidate supporting the current migration set or a reviewed forward fix. Full production launch, fresh-target regional restore and deployed rollback acceptance remain separate gates.
