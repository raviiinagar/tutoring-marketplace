# Lovable UI integration evidence

The imported `lovable-ui` package now supplies the running product screens. Root startup launches its Vite/TanStack UI alongside NestJS, the durable mail worker and local PostgreSQL. Root build produces the API/contracts and a Nitro Node-server UI build; root typecheck and tests also include the imported package. Its npm lockfile is separate, and fresh setup runs `npm run setup:ui` after root `npm ci`.

## Account behavior

- All account writes and private reads use the existing typed adapter and `/v1` API. Vite preserves Origin and proxies the API to loopback port 4000. Cookie sessions remain HttpOnly and owned by NestJS.
- Local development accepts localhost/127.0.0.1 spellings at the configured allowed ports. Unrelated hosts/ports remain rejected. Production continues exact HTTPS-origin matching, including no automatic loopback aliases.
- The development check-email page clearly says no real email is sent and links to `/dev/inbox`. The inbox reads the development-only API capture endpoint and retains the current browser host when opening verification links. Production builds disable capture and its controls; backend production does not register `/dev/mail`.
- Account fields and submit controls are disabled until React hydration completes, preventing early input from being reset by SSR hydration. This fixed the first browser reproduction, where no registration request was sent and typed fields reset.
- Existing Next.js screens remain under `apps/web` as reference code, but are no longer the startup UI.

## Checks

- Nine PostgreSQL API integration tests passed, including loopback origin acceptance, unrelated-origin rejection, production origin restrictions, token expiry/replay/concurrency, sessions, outbox and restart persistence.
- Nine generated UI unit tests passed.
- Two real Edge browser journeys passed: signup → captured email → explicit verification → login → private account → refresh → logout → rejected private access, once on `localhost:3000` and once on `127.0.0.1:3000`.
- Root TypeScript check and production build passed. The build used `node-server`, not the previous default Cloudflare target.
- Root and UI production dependency audits reported zero vulnerabilities.

These checks validate the integrated account slice locally. No deployment, live email provider or later marketplace feature is claimed. Real SMTP remains deferred until a domain is purchased; roles/recovery/session management remain ticket 02.
