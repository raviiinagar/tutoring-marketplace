# Netlify preview deployment

Prepared 26 October 2026. The Netlify SSR build was verified locally; no Netlify site has been created or published. This target does not replace the recorded production pilot in ADR 0008 or satisfy the Task 28 launch gates.

## What this configuration deploys

The root `netlify.toml` builds **only `lovable-ui`**, using its own lockfile and the existing Lovable/TanStack Start/Nitro integration. It selects Node 24 and the `netlify` SSR preset. Local and VM builds continue to use `node-server` unless `NITRO_PRESET` is explicitly set. The installed Nitro beta emits static assets to `lovable-ui/dist` and a server function under `lovable-ui/.netlify/functions-internal/server/`.

This is not a static SPA. Do not add `/* /index.html 200`, upload only `dist` through drag-and-drop, add a second TanStack deployment adapter, or use `npm run dev` as a cloud build command. Netlify must build and deploy the generated SSR function as well as the static assets.

**The current homepage requires the API during server rendering. Without a reachable API it shows an unavailable/error page.** Sign-in/sign-up screens can render, but authentication, catalogue data, Tutor workflows, private chat and payments cannot operate. A successful UI build is not a working marketplace deployment.

## Owner setup

1. Sign up at [Netlify](https://app.netlify.com/signup) using GitHub. Choose the **Free** plan; check the allowance shown in your account. A paid domain is not needed for the initial `*.netlify.app` address.
2. Allow Netlify access to `raviiinagar/tutoring-marketplace`. Prefer granting access to this repository only.
3. Start a project by importing that GitHub repository and select **`deploy/netlify-preview-20261026`** as the deployment branch. This isolated hosting branch contains `netlify.toml` and the updated `lovable-ui/vite.config.ts`; importing the older `main` commit will not include this setup. Other local testing/readiness work is not part of this hosting-only branch.
4. Check the build settings below. If the provider starts an initial build automatically, treat it as a connectivity/build check until the backend is configured.
5. Keep the site labelled as a preview. The checked-in configuration sends `X-Robots-Tag: noindex, nofollow`. This discourages indexing; it is not access control.

| Setting | Value |
| --- | --- |
| Repository | `raviiinagar/tutoring-marketplace` |
| Deployment branch | `deploy/netlify-preview-20261026` |
| Base directory | `lovable-ui` |
| Build command | `npm run build` |
| Publish directory, relative to base | `dist` |
| Build Node version | `24` |
| Build `NITRO_PRESET` | `netlify` |
| Package install flags | `--include=dev` |

The TOML file contains these defaults. Do not choose the older `apps/web` reference application. Do not set `NODE_ENV=production` for dependency installation if that would omit the build's development dependencies.

## Connect a working staging backend

The existing NestJS API, PostgreSQL and continuously running worker need compatible hosting. Netlify's UI deployment does not start these processes. Keep staging data and credentials separate from local testing and production; never expose the captured development inbox or fictional scanner/Guardian adapters publicly.

1. Provision a separately hosted API, database and worker. Confirm mail delivery and the necessary private-data configuration using the existing [deployment runbook](pilot-deployment-recovery.md). Keep `PAYMENT_MODE=disabled` until the relevant provider acceptance work is done.
2. Set `API_INTERNAL_URL` on the Netlify UI **server runtime** to the reachable API origin, for example `https://your-staging-api.example`. Ensure it is available to functions, not only the build. It has no `/v1` suffix. This variable supports SSR and is not a secret credential.
3. Keep browser API requests on the Netlify site's origin. Leave `VITE_API_BASE_URL` unset. Configure a same-origin proxy for `/v1/*` to the API, including streaming responses used by chat. The existing Vite development proxy does not run in a deployed build.
4. Once the actual API URL is known, a Netlify external rewrite can be configured before the SSR catch-all. Example only; **replace the hostname and verify deployed behavior before use**:

   ```toml
   [[redirects]]
     from = "/v1/*"
     to = "https://your-staging-api.example/v1/:splat"
     status = 200
     force = true
   ```

   This routes to an existing API; it does not host the API itself. Validate query strings, original browser `Origin`, cookies/`Set-Cookie`, request bodies, private response caching, uploads, payment webhook signatures and chat streaming/reconnect behavior through the selected proxy. If platform limits prevent the required streaming behavior, choose a compatible proxy/host before declaring chat ready.
5. Configure the API's `WEB_ORIGIN` and `ALLOWED_ORIGINS` with the exact stable HTTPS Netlify site origin. Production cookie/origin rules remain enforced. Arbitrary PR preview domains are not automatically trusted: use a deliberate isolated staging origin rather than a wildcard.
6. Keep `DATABASE_URL`, `AUTH_SECRET`, SMTP credentials, payment secrets and private recovery material on the backend's secret store. Do not put them in `VITE_*`, TOML, GitHub source, chat messages or build artifacts.

No backend URL is currently supplied in this configuration, so the rewrite is deliberately not active. No live checkout or release approval has been enabled.

## Validate before sharing as a working platform

- Homepage and subject pages render actual catalogue/supply data through SSR; page reloads and deep links work.
- `/v1` responses come from the API. Signup, real verification mail, sign-in, persistent HttpOnly cookie and sign-out work on the hosted HTTPS origin.
- Tutor review/publication and approved photos work against staging data; private downloads remain protected.
- Learner enquiry, Tutor acceptance and authorised chat work, including streaming timeout/reconnect recovery and unrelated-user denial.
- Worker jobs run while no browser is open. SMTP, privacy jobs, access deadlines and payment reconciliation cannot rely on a function staying alive indefinitely.
- Disabled checkout remains disabled; real provider testing is a separate gate. No production payment success is inferred from fixture-based tests.
- Netlify logs show successful SSR function invocation and no missing-artifact errors. Check headers, credit usage and project status in the hosted account.

## Cost and hosting boundary

Netlify Free currently provides **300 monthly credits**, with a hard limit; exhausting it pauses projects on that team. Production deploys, requests, traffic and compute consume credits. Free hosting therefore has usage limits, and the complete existing platform is not established as a zero-cost deployment. Vercel Hobby is restricted to non-commercial personal use, so Netlify is the more suitable free option for this business preview. See the [dated official-source comparison](../research/free-preview-hosting-2026-10-26.md).

Official setup references: [Git imports](https://docs.netlify.com/start/overview/), [file-based configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/), [Nitro's Netlify SSR target](https://nitro.build/deploy/providers/netlify), [external proxy rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).
