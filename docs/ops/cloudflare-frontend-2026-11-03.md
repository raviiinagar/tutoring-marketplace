# Cloudflare frontend test deployment - 3 November 2026

Test URL: https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev

Worker: `tutor-marketplace-ravii-preview`. Version: `2a91c27f-8e9c-43fb-a927-25e8688ebfaf`.
Source baseline: `7480b0e`, isolated branch `feature/cloudflare-frontend`.

## Architecture and commands

The existing Lovable/TanStack Start frontend builds with the installed Nitro `cloudflare_module` adapter. Static files use the ASSETS binding; SSR runs in Workers with Node compatibility. The wrapper streams `/v1` requests to the fixed existing AWS HTTPS API and preserves the browser Origin, cookies, binary bodies and SSE. Private/API responses use `no-store`. No credentials are embedded in the build.

From `lovable-ui`:

```powershell
npm ci
npm run build:cloudflare
npm run preview:cloudflare
npm run deploy:cloudflare
```

Deployment uses pinned Wrangler 4.156.2 and its OS-keychain OAuth login. Deploy the generated `.output/server/wrangler.json`, whose entry is `frontend.mjs`; deploying Nitro's unwrapped `index.mjs` directly omits the API proxy. The package name is branded so initial workers.dev onboarding does not attempt the generic TanStack package subdomain.

The source `wrangler.jsonc` contains only public configuration. A clean build regenerates the output. Do not commit `.output`, OAuth storage, private environment files or local smoke logs.

## Backend compatibility

The existing main staging API's `ALLOWED_ORIGINS` includes the exact Worker origin alongside the existing Netlify origin. After the owner confirmed login and requested new email links, `WEB_ORIGIN` was promoted to the Cloudflare URL on 3 November. Newly generated verification/reset emails now target Cloudflare. Already generated email payloads retain their original URL; request a fresh email rather than editing token links manually. API and worker were restarted successfully; database and application release were unchanged.

Protected rollback copies: `/etc/tutoring/api.env.before-cloudflare-20261103` before adding the allowed origin, and `/etc/tutoring/api.env.before-cloudflare-email-20261103` before promoting the email origin. Both are root-only. Restore only the intended keys when later configuration changes exist.

The EC2 administrative SSH /32 was refreshed through a reviewed CloudFormation change set, modifying only the security group without resource replacement. SSH used the original pinned host key across the known IP change. No broad SSH access was introduced. Existing automatic compute stop remains 10 November 2026, 10:25:48 UTC / 3:55:48 PM IST.

Existing Netlify main and payment-sandbox remain available. This Worker forwards to the main staging API, where paid checkout remains disabled. It is not a replacement for the separate Razorpay test sandbox. No paid plan, DNS cutover or data migration occurred.

## Acceptance evidence

- Existing UI suite: 30 files, 125 tests passed. Existing React act warnings remain non-fatal.
- TypeScript check passed; Cloudflare build and Wrangler dry-run passed.
- Six proxy tests passed: fixed upstream, exact unsafe Origin checks, JSON/cookie forwarding, multiple Set-Cookie preservation, binary transfer, SSE streaming, redirects and invalid configuration/path rejection.
- Uploaded bundle: 2276.56 KiB uncompressed / 463.29 KiB gzip; Worker startup reported 6 ms. Startup time is not request CPU usage.
- Local workerd and actual deployed `/`, `/auth/signin`, `/v1/health` and `/v1/catalogue` returned 200 with expected HTML/JSON and noindex headers. Live `/v1/public/home` returned the existing catalogue.
- Live unsafe request from an untrusted origin returned 403. Development mail endpoint returned 404.
- Saved local owner credentials returned 401 `INVALID_CREDENTIALS`; they were not changed or reset. The owner subsequently confirmed successful login with their current password on the deployed Worker. Automated sign-out/revocation and authenticated live chat/upload acceptance have not yet been exercised on this URL; cookie, binary and SSE forwarding have unit coverage.
- Same-origin non-JSON authentication returned 415. Existing Netlify API health remained 200. Public profiles and location suggestions returned 200; sorting without a rate unit correctly returned 400.

Cloudflare Free quotas still apply. Bundle-size acceptance and successful anonymous requests do not establish sustained SSR CPU capacity, load capacity or unlimited hosting. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [Nitro Cloudflare deployment](https://nitro.build/deploy/providers/cloudflare). AWS charges and the existing test-server stop schedule remain separate from frontend hosting.

## Rollback

Use the existing Netlify URL while investigating. For an origin-only rollback, restore the protected backend env copy and restart `tutoring-api`; verify health and the existing Netlify client. Do not restore that whole file after unrelated later configuration changes without first comparing only the intended keys. Worker deletion and public DNS changes are not needed for rollback.
