# Free preview hosting: Netlify and Vercel

Checked 26 October 2026 against official provider documentation and the installed project dependencies. This is deployment research, not a deployment record. No account, paid resource, site, secret, database or DNS record was created.

## Recommendation

Use **Netlify Free for a small shared preview**, subject to its credit allowance. Keep the existing marketplace API, PostgreSQL and durable workers as a separate deployment problem. A hosted UI alone does not make registration, tutor review, payments, Connections or chat work online.

Vercel Hobby is not the default choice for this commercial marketplace: its terms restrict that plan to personal or non-commercial use, and its fair-use definition includes deployments intended for financial gain. A paid Vercel plan is the appropriate route for commercial deployment there. [Vercel terms, section 4](https://vercel.com/legal/terms), [Vercel commercial-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines).

Netlify staff explicitly permit commercial projects on the free plan, most recently reconfirmed in the linked thread in May 2025. This is not permission to resell Netlify hosting. Check the account's accepted terms when creating the deployment. [Netlify staff clarification](https://answers.netlify.com/t/can-we-use-netlify-free-plan-for-commercial-purposes/41545).

## What “free” currently covers

New Netlify accounts use credit-based plans; accounts created before 4 September 2025 may retain a different legacy plan. The current Free plan supplies **300 credits/month**, with a hard limit and no credit recharge. [Netlify credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).

Current metering:

| Resource | Credit usage |
| --- | --- |
| Production deployment | 15 credits each |
| Outbound bandwidth | 20 credits/GB |
| Function/database compute | 10 credits/GB-hour |
| Web requests | 2 credits/10,000 requests |

Deploy Previews and branch deploys do not have the production deployment charge, but their traffic and compute still consume credits. A default `*.netlify.app` URL is available, so a purchased custom domain is unnecessary for a preview. The pricing page lists database and file primitives, but that does not automatically integrate or provision the existing application's backend. [Netlify pricing and metering](https://www.netlify.com/pricing/), [Netlify default URLs and credit usage](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/).

When credits are exhausted, **all projects on that team pause**, including traffic and preview deployments. A Free account must wait for the next allowance or upgrade; it cannot buy additional credits while remaining Free. Therefore this allowance is useful for evaluation, but is not an availability guarantee for a paying-user marketplace. [Paused-project behavior](https://docs.netlify.com/manage/accounts-and-billing/billing/resume-paused-projects/).

## Match the deployment to this repository

Local evidence:

- `lovable-ui/package.json` pins TanStack Start `1.168.60`, Vite `8.1.5` and Nitro `3.0.260603-beta`.
- `lovable-ui/vite.config.ts` uses the Lovable wrapper, which already injects TanStack Start and Nitro, and explicitly selects `node-server`.
- The existing UI has server rendering. Deploying only an ordinary Vite static directory, or adding a blanket SPA rewrite, does not reproduce its current SSR output.
- `apps/api/src/main.ts` starts a separate NestJS HTTP listener; `apps/api/src/worker.ts` contains the durable worker loop.
- ADR 0009 requires authoritative NestJS/PostgreSQL state, HttpOnly sessions and a shared public HTTPS origin. A hosted browser cannot access the developer's loopback API.
- `docs/ops/pilot-deployment-recovery.md` records that evidence and portrait bytes currently reside in encrypted PostgreSQL tables. This repository does not currently implement a generic Netlify Blobs media adapter.

The generic current TanStack integration uses `@netlify/vite-plugin-tanstack-start` after `tanstackStart()`, with `vite build` and `dist/client`. That is an alternative integration, **not an additional plugin to add blindly to the existing Lovable/Nitro wrapper**. [Netlify TanStack Start guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/).

The smaller compatible path to investigate here is Nitro's **`netlify` preset**, keeping the wrapper and existing server entry. Nitro documents `dist` as its Netlify publish directory and supports provider presets. Keep `node-server` for the existing VM/local deployment path. [Nitro Netlify provider](https://nitro.build/deploy/providers/netlify), [Nitro deployment presets](https://nitro.build/deploy).

**Pinned dependency caveat:** the installed Nitro beta's own bundled guide and `dist/_presets.mjs` write the function to `.netlify/functions-internal` and assets to `dist`. Newer online Nitro documentation describes `.netlify/v1/functions` instead. Generated deployment output must be inspected and tested against the installed version; do not copy newer output paths or add a second adapter without testing. The installed config loader also prioritizes an explicit programmatic `preset` over `NITRO_PRESET`, so an environment variable alone may not override today's hard-coded `node-server` setting.

Netlify now defaults new sites to Node 24. Set `NODE_VERSION=24` explicitly for a repeatable build; if a function runtime override is needed, set `AWS_LAMBDA_JS_RUNTIME=nodejs24.x` through the provider UI/CLI/API, not `netlify.toml`. [Node 24 default announcement](https://www.netlify.com/changelog/2026-07-07-nodejs-24-default-new-sites/), [Build dependency versions](https://docs.netlify.com/build/configure-builds/manage-dependencies/), [Function runtime configuration](https://docs.netlify.com/build/functions/configuration/).

## Backend constraints and deployment boundary

Netlify functions have bounded execution: synchronous 60 seconds, scheduled 30 seconds and background 15 minutes. Background functions are supported on current credit-based Free plans, but are invoked tasks rather than indefinite daemon processes. These limits mean the existing API listener and continuous worker cannot simply be uploaded as if Netlify were the planned VM. Adapting workers requires preserving queue retries, leases, heartbeat monitoring and payment/privacy behavior. [Function limits](https://docs.netlify.com/build/functions/configuration/), [Background functions](https://docs.netlify.com/build/functions/background-functions/).

For the first preview, choose and label one of these scopes explicitly:

1. **UI-only preview:** real screens and navigation, with clear unavailable backend states. Do not advertise working login/chat/payment until a compatible API is reachable.
2. **Integrated staging:** Netlify UI plus an independently hosted API, PostgreSQL and worker, with same-origin API routing, production-safe cookies/origin checks, staging-only data and payments disabled. This requires provider setup and actual end-to-end verification.

No research here establishes that the complete current platform can run reliably and indefinitely for zero cost. Database, worker, mail, malware scanning, independent recovery and live merchant requirements remain separate from the frontend hosting allowance.

ADR 0008's budgeted Mumbai pilot with independent recovery remains the recorded production decision. A free preview can coexist with it; replacing that production architecture requires an explicit later decision and new recovery/operations acceptance evidence. This note does not unlock Task 28 or authorize live payments.
