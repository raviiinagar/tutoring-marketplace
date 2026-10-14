# Tutor marketplace

Tasks 01–12 implement verified accounts, roles, account security, a scoped staff console with MFA, adult/Guardian-controlled Learner profiles, the eight-domain catalogue, adult Tutor evidence review, approved teaching offers with availability/safety controls, public Tutor search/detail pages, and optional empty-category availability signup with confirmation/unsubscribe and durable matching intents, plus covered Contact Request submission and private status/deadline history, Tutor acceptance/decline, and authorised Connections with verified email contacts and durable private text chat with unread/read positions, safe retries and reconnect recovery. Production child profiles remain gated until the approved verification/consent policy is integrated. The business name is undecided; VEER is the owner. Tuition payments will remain direct to tutors. The remaining production marketplace is tracked as separate tickets.

## Run locally

Use Node.js 24 LTS and run these commands from the repository root:

```powershell
npm ci
npm run setup:ui
npm run setup:local
npm run dev
```

Open http://localhost:3000 or http://127.0.0.1:3000. The app now serves the Lovable UI from `lovable-ui`. Create an account, open the **captured email inbox** from the check-email page, verify your email and sign in. API runs on port 4000; real PostgreSQL runs on loopback port 5433. No Docker is required. The API, email worker and web run as separate processes. Stop with Ctrl+C.

Setup creates random local credentials in `.env`, initializes PostgreSQL under `.local/postgres` and applies checksum-checked migrations. It preserves existing data and configuration. `.env`, database data and captured email are ignored by Git. Keep them private. Run setup again after new migrations, with the dev stack stopped. Do not run two copies against the same PostgreSQL directory. For an existing database use `npm run db:migrate` while that database is running.

Email capture is local development only; mail is not sent to real inboxes. The browser inbox is disabled in production builds, and the API capture endpoint is absent in production. Native PostgreSQL provisioning uses the pinned embedded-postgres wrapper; it does not create operating-system users. Linux users must run local setup/tests as a non-root user.

## Verify

```powershell
npm test
npm run typecheck
npm run build
npm audit --omit=dev
npm --prefix lovable-ui audit --omit=dev
npx playwright install chromium
npm run test:browser
```

On Windows with Microsoft Edge installed, use `$env:PLAYWRIGHT_CHANNEL='msedge'` before the browser test instead of downloading Chromium. Browser tests provision an isolated fresh stack automatically on ports 3100/4100/5434 with fictional Guardian verification and Tutor evidence scanning; they do not reuse the development stack or database. Integration tests use separate fresh PostgreSQL clusters under `.local/tests` and test the HTTP API, permissions, races, mail worker and restart persistence. Test clusters and browser fixture configuration remain ignored on disk for diagnosis.

## Lovable UI

The header shows **My account / My enquiries** after cookie-session verification and restores anonymous navigation after logout. Tutors upload their public portrait from `/tutor`; a different MFA-enabled Trust reviewer approves it at `/staff/photos`. Only approved photos on eligible offers appear publicly. See the [photo workflow and fictional local sample](docs/api/tutor-photos.md). The [alignment review follow-up](.scratch/production/alignment-review.md) records the corrected staff lock order and acceptance evidence.

The imported UI in `lovable-ui` is integrated into root startup, build, typecheck and tests. It stays a separate npm package with its own lockfile; `npm run setup:ui` installs it. The earlier Next.js screens under `apps/web` are retained as a reference and are not started by `npm run dev`. NestJS/PostgreSQL remain authoritative. [API contract](docs/api/identity.md), [integration evidence](docs/lovable/connected-ui.md), [Lovable export instructions](docs/lovable/integration.md).

Local writes accept both loopback names at explicitly configured ports, only in development. Production origin matching remains exact and requires HTTPS. The Vite development proxy preserves browser Origin and routes `/v1` to the API, with `/dev/mail` available only for local capture. Forms wait for React hydration before allowing input so early typing is not lost.

## Production configuration

The homepage browses the eight Learning Domains and their subjects, levels, curricula, exam tracks and teaching languages from PostgreSQL. Trust staff with MFA can add, edit, activate and deactivate terms at `/staff/catalogue`. See the [catalogue guide](docs/api/catalogue.md). `/tutors` searches currently available approved offers using exact combinations, languages and unit-specific price filters; public detail pages show precise evidence labels and expiry while keeping contacts/documents private. See the [discovery guide](docs/api/discovery.md). Empty searches can collect optional adult availability consent with email confirmation and unsubscribe; the worker records matching intents, with alert delivery scheduled for task 20. See the [availability guide](docs/api/availability.md). Available offer pages include a covered enquiry form and `/requests` shows private history. Payment integration is still pending; successful coverage currently uses explicitly isolated test grants that production rejects. See the [Contact Request guide](docs/api/contact-requests.md). Tutors respond at `/tutor/requests`; `/connections` provides grant/safety-checked adult email contacts. Matching access waits for later activation. Active adult participants can open private text chat from their Connection; see the [chat/reconnect guide](docs/api/chat.md). See the [Connection guide](docs/api/connections.md).

Tutor-role accounts manage their adult profile and identity/Subject evidence at `/tutor`. Trust staff with MFA review specific claims and access audited, expiring downloads at `/staff/tutors`. See the [Tutor evidence guide](docs/api/tutors.md). Evidence uploads default to disabled; `EVIDENCE_SCANNER=test` enables fictional local samples only and is forbidden in production. Live scanning uses the ClamAV adapter and requires a private configured daemon with maintained signatures. Tutor evidence approvals do not themselves publish Listings.

Reviewed Tutors create structured offers at `/tutor/listings`; Trust staff approve exact combinations at `/staff/listings`. Owner edits require another review, pause/resume rechecks eligibility, and staff safety restrictions survive owner edits. Public offer API responses expose only currently eligible available Listings. See the [Listing guide](docs/api/listings.md). Requests, paid access and availability notifications follow in later tasks.

Adult Learner profiles are available from the account page. [Learner/Guardian guide](docs/api/learners.md) describes private profiles, Trust review and versioned consent. The default Guardian mode is disabled. `GUARDIAN_VERIFICATION_MODE=test` is only for fictional local fixtures and is forbidden in production; no approved live verification adapter/policy is currently configured.

Staff access requires an explicit operator grant to an existing active verified account. Follow [staff setup and API](docs/api/staff.md), then open the staff console from the account page and enroll an authenticator. Recovery codes are displayed once. Staff sessions last thirty minutes, retain their account-session binding and enforce separate Support, Trust and Finance scopes. Public registration cannot create an administrator; no owner account is automatically provisioned.

To receive real verification emails during development, follow [email provider setup](docs/email-setup.md). SMTP is already supported; account creation, sender verification and credentials must be completed by the owner.

Build with `npm run build`. The Lovable production build uses Nitro's Node server preset; `npm run start:ui` starts its built server. Set `NITRO_HOST`/`NITRO_PORT` for the UI separately from the API's `PORT`. Supply real environment variables through the deployment secret store; the convenience `start:api`/`start:worker` scripts read a local `.env`, or invoke `node apps/api/dist/main.js` and `node apps/api/dist/worker.js` directly with injected environment. Run the migration once per deployment from the repository root. API and worker share the database and encryption secret. The managed PostgreSQL connection must enforce provider TLS verification; local PostgreSQL is a development tool.

Production requires `NODE_ENV=production`, a strong random `AUTH_SECRET`, `DATABASE_URL`, HTTPS `WEB_ORIGIN`/`ALLOWED_ORIGINS`, `MAIL_TRANSPORT=smtp`, and `SMTP_HOST`, `SMTP_PORT` (465 or 587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Missing configuration fails closed. SMTP requires TLS; a real sender/domain and delivery smoke test remain deployment dependencies. Changing `AUTH_SECRET` requires a migration/re-encryption plan for encrypted outbox mail, staff MFA secrets, Guardian evidence, Tutor birth dates, Tutor evidence, Tutor photos and chat messages; draining mail alone is insufficient.

Serve the UI and API on the same HTTPS origin through a reverse proxy, routing `/v1/*` to the API. Production cookies are HttpOnly, Secure, SameSite=Lax and scoped to `/` with the `__Host-` prefix. API writes require an exact allowed Origin and JSON content type. Trust-proxy is disabled until the deployment topology is explicitly configured; behind a proxy the current IP limiter treats the proxy as one client, so proxy-aware rate limiting must be configured and tested before launch. The proxy must preserve the browser Origin header. Separate Lovable-hosted UI/API domains require a deliberate cookie/CSRF design; do not weaken these controls to make a preview work.

Verification and password reset links expire after 15 minutes and require explicit POST confirmation. Use **Forgot password?** on sign-in and the captured inbox for local reset testing. Resetting a password revokes all sessions and outstanding reset links. Sessions last seven days; the account screen lists active sessions and supports individual revocation and signing out other sessions. One account can use Learner and Tutor roles; choosing Tutor does not approve or publish a Listing. Staff permissions are assigned separately through the operator command. All remaining production work and external dependencies are tracked in [.scratch/production/README.md](.scratch/production/README.md).
