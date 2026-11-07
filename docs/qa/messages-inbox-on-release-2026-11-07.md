# My messages inbox port onto the release line - 7 November 2026

Branch: `feature/messages-inbox-on-release`. Isolated worktree: `D:\WORK\P1\.local\messages-inbox-on-release`. Base: `fix/account-avatar-consistency` at `9dfc5c1`; inbox source: `a284a9b` from the older `64de3e8` snapshot. The inbox patch was applied without committing, reviewed, then committed only after Phase A checks passed. No main-checkout source edits, push, deployment or Superprof access.

## Phase A: conflict and overlap resolution

Git reported **one textual conflict**, in `account/ui.tsx`. The other nine named overlapping files applied automatically; each was inspected. The eight overlapping files other than CSS/account shell had no release-vs-old-snapshot functional differences after whitespace normalization. No release behavior was discarded to settle a conflict.

| Overlapping file under lovable-ui/src | Resolution / logic retained | Why |
| --- | --- | --- |
| `components/account/ui.tsx` | **Both**: release AccountAvatar/accountInitial, search accessible names, unified teaching entry and header behaviors; inbox teachingWorkspace override wrapping the existing ready/path check. | The inbox needs Tutor navigation without replacing the shared saved-photo/header implementation. This was the sole textual conflict. |
| `components/chat-room.tsx` | **Inbox embedding**, with the existing release history/send/retry/revocation logic retained; unread callbacks added. Standalone page header/back/details chrome removed. | AuthShell now owns the header/avatar/tab bar; keeping the old chrome would produce parallel messaging UIs. Release differences here were formatting. |
| `components/class-invitations.tsx` | **Release ClassInvitations retained**; incoming removal of unused UpcomingClass export/link accepted. | Full schedule/Join controls now live inside the inbox Classes section; no class authorization or mutation logic changed. |
| `components/contact-request-form.tsx` | **Both**: release request/payment behavior retained; incoming View Connection target selects inbox Details. | Entry/navigation changes only. |
| `components/tutor-workspace-navigation.tsx` | **Both**: release navigation retained; My messages now points to /connections. | Tutor inbox and learner inbox share the same route; pending enquiries remain separately linked. |
| `routes/connections.tsx` | **Inbox list/pane implementation**, retaining server-authorized Connection reads and sign-in/error handling. | Addressable selection, mobile Back/focus, read counts and cleanup replace the launcher. Release differences were formatting. |
| `routes/connections_.$connectionId.tsx` | **Inbox redirect shim**; original detail/contact behavior moved into ConnectionDetails. | Old URLs and #classes work without keeping a separate detail page. Details still require an explicit verified-contact action. |
| `routes/requests.tsx` | **Both**: release request/deadline behavior retained; incoming link targets selected inbox Details. | No request/payment/deadline changes. |
| `styles.css` | **Both**: release #f4545b wordmark/search contrast fixes retained; inbox layout/selection/mobile rules appended. | The inbox must not reintroduce the earlier header contrast defect. |
| `test/connections-reference.test.tsx` | **Inbox URL-aware mocks/expectations**, all original empty/error/filter/unavailable/sign-in assertions retained. | Destinations now use search parameters. The empty-state target remains /tutors, scoped to its original pane because mobile also needs a reachable action. |

## Verification and scope

| Check | Release baseline | Phase A |
| --- | --- | --- |
| `npm --prefix lovable-ui test` | **219 passed / 0 failed**, 42 files (fresh run) | **232 passed / 0 failed**, 44 files |
| `npx tsc -p lovable-ui --noEmit` | NOT RUN as a fresh pre-port baseline | Passed |
| Inbox browser spec | NOT RUN before port; absent on release base | **4 passed / 0 failed** |
| Additional browser regressions | NOT RUN before port in this worktree | **9 passed / 0 failed**: 2 avatar, 2 unified onboarding, 5 accessibility |

The combined 13-case browser run used Chrome against a fresh local fictional PostgreSQL 16/API/UI stack. Ignored runtime helpers selected a separate local database port; no tracked configuration changed. Inbox cases use controlled fictional API/SSE responses and actual routes/DOM; the avatar and onboarding cases additionally use the real isolated API, including uploads, refresh/re-login, private drafts, explicit publication, pause and deletion. No tests were skipped or assertions removed for this port.

Verified: one /connections inbox with URL-addressable conversation/section selection, same-document switching, refresh/browser Back, desktop list/pane and mobile list-to-pane/Back, unread clearing and stale-read protection, stream cleanup, retained tab bar, old URL/#classes redirects, unavailable Connection state, adult/text-only notice, Details, report/block and Classes controls. Contact fields are not fetched or shown by default; Show verified contact remains explicit and verified-email-only.

The shared account-photo cache/component, photo editor, learner/Tutor dashboards, Tutor introduction wizard, ad manager, frontend publication-photo predicate and server publication guards are unchanged from the release base. Only the shared shell gained the inbox workspace override; header accessibility/avatars remain intact. No API, contract or migration file changed. Full API suite: **NOT RUN**, because this is a frontend-only port. Production Cloudflare build and repository-wide lint: **NOT RUN** for this task; required type/UI/browser checks passed.

Phase A screenshots from the release-line worktree: [desktop 1440](evidence/2026-11-07/inbox-on-release-1440.png), [mobile 390](evidence/2026-11-07/inbox-on-release-390.png). Sanitized counts: [checks JSON](evidence/2026-11-07/messages-inbox-on-release-checks.json).

## Phase B preflight

Both requested issues exist on the release base: the homepage still claims mandatory identity/Pro publication, and /tutor/listings still directs non-Tutors to account role settings. Phase B has not started; its changes will be a separate commit after Phase A is green.

## Assumptions / unknowns

Superprof's inbox visual layout remains **UNKNOWN**; this is the original inbox design assumption, not newly observed reference behavior. Existing draft/retry state remains scoped to the mounted chat, as documented in the original inbox report. No new contact, payment, authorization or publication policy decision was made. No policy question blocks the port. No hosted behavior was verified or changed for this local task.
