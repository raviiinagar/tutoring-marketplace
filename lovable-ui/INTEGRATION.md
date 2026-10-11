# Tutor Marketplace UI — integration notes

Integrated locally: run `npm run dev` from `D:/WORK/P1` to start this UI, NestJS, the mail worker and PostgreSQL. For fresh installs run root `npm ci`, `npm run setup:ui`, and `npm run setup:local` first. The root build/typecheck/test commands include this folder.

## Routes
- `/` account entry
- `/auth/signup` registration (202 → `/auth/check-email`)
- `/auth/check-email` resend verification (`?email=` prefill)
- `/auth/verify#token=…` manual "Verify email" button; fragment removed on load
- `/auth/signin` sign in → `/account`
- `/auth/forgot-password` generic recovery request; local testing inbox link
- `/auth/reset-password#token=…` choose a new password; fragment removed on load
- `/account` loads `GET /v1/me`; 401 → `/auth/signin`
- `/staff` assigned staff only: authenticator enrollment/recovery, 30-minute MFA sessions and scoped Support/Trust/Finance navigation. See root `docs/api/staff.md` for the operator grant.
- `/learners` private adult and Guardian-controlled profiles, verification status and consent controls; production child collection stays disabled without an approved policy.
- `/staff/guardians` Trust + MFA only: reasoned evidence inspection and Guardian approval/rejection/revocation. See root `docs/api/learners.md`.
- `/dev/inbox` local captured emails; unavailable in production builds or when capture is disabled.

## Configuration
`VITE_API_BASE_URL` — public API origin only. Default `""` = same-origin `/v1`.
All calls live in `src/lib/api.ts` and use `credentials: "include"`. No tokens are stored client-side.

Root development startup sets the public API base to empty and enables `VITE_DEV_MAIL_CAPTURE=true` only when the backend uses capture. Vite proxies `/v1` and `/dev/mail` to loopback API port 4000 and preserves Origin. Development API configuration accepts localhost and 127.0.0.1 aliases for explicitly allowed local ports; production does not. Inbox links stay on the currently opened local host so the complete session journey can be tested on either address.

## Deployment
Serve UI and API on the SAME HTTPS origin, reverse-proxying `/v1/*` to NestJS, so the HttpOnly session cookie works without loosening CORS/cookie settings. In the Lovable preview the API is unreachable and pages show "Account service is not connected".

The external production build now targets `node-server`. `npm start` in this folder runs `.output/server/index.mjs`; use `NITRO_HOST`/`NITRO_PORT` for the intended host/port. Development proxy settings do not configure production routing. Do not proxy development mail routes in production; the backend does not register its capture endpoint there.

## Test steps
1. Signup with empty/short fields → inline errors; valid → check-email page.
2. Open the emailed link → fragment disappears → press Verify → success.
3. Reuse/expire link → "can't be used" state with resend link.
4. Sign in before verifying → unverified notice with resend link.
5. Wrong password → invalid credentials message.
6. Sign in → `/account`; refresh → still signed in.
7. Sign out → `/auth/signin`; `/account` then redirects to sign-in.
8. Stop API → "Account service is not connected". Hit rate limit → retry message.
9. `bunx vitest run` for unit tests.
10. Account: choose Learner/Tutor roles, refresh and check persistence. Tutor selection does not publish a Listing.
11. Sign in from a second browser session, refresh account inventory, then revoke that session or sign out all other sessions. Its next private operation must fail.
12. Use Forgot password, open the captured reset link and choose a new 12–128 character password. Every old session and reset link becomes unusable; sign in with the new password.
13. Explicitly grant staff to a verified testing account, enroll an authenticator, save the recovery codes, open an assigned area and record an access reason. Unassigned areas must not appear. Sign out staff access, then recover with a saved code: a new authenticator must be enrolled before scoped access resumes.
