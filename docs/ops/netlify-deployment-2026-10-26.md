# Netlify preview deployment — 26 October 2026

The UI has been deployed. **The complete marketplace is not yet functional online because the API, PostgreSQL, worker and SMTP are not hosted/configured.**

| Item | Verified state |
| --- | --- |
| Netlify project | `tutoring-marketplace-ravii-preview` |
| Team | `raviiinagar`, plan returned by provider: **Free** |
| Preview origin | https://tutoring-marketplace-ravii-preview.netlify.app |
| Sign-in screen | https://tutoring-marketplace-ravii-preview.netlify.app/auth/signin |
| Owner dashboard | https://app.netlify.com/projects/tutoring-marketplace-ravii-preview |
| Git repository | `raviiinagar/tutoring-marketplace` |
| Deployment branch | `deploy/netlify-preview-20261026` |
| Deployed application commit | `dc512357fe541c53c6668a714e759ad884c66c18` |
| Repository integration | Dedicated read-only deploy key and push/pull-request/delete webhook configured |
| Hosted build | Two successful hosted builds of that application commit; no additional rebuild needed for this record |
| UI target | Node 24, Nitro `netlify`, base `lovable-ui`, `npm run build`, publish `dist` relative to base |
| Public access | Enabled for this preview project; HTTPS provider URL used |
| Live payments | Not enabled |
| AWS resources | None created |

Anonymous HTTP checks against the hosted Netlify origin returned:

| Path | Result | Interpretation |
| --- | --- | --- |
| `/auth/signin` | 200, application HTML, `noindex`, `no-store` | Sign-in screen rendered by hosted SSR; login action is not verified without the API. |
| `/auth/signup` | 200, application HTML, `noindex`, `no-store` | Sign-up screen rendered by hosted SSR; registration/email verification are not yet available. |
| `/` | 500, generic unavailable page, `noindex`, `no-store` | Expected outstanding dependency: the homepage loader requires the API. This is not a successful marketplace check. |

The provider initially protected the site with account sign-in, returning 401. Preview project access was then made public and the above anonymous checks were performed. No backend, test fixture inbox, private database, identity evidence or staff bootstrap endpoint was exposed. CLI credentials stay in the provider-managed local credential store; no secrets or webhook endpoints are included in this record.

## Remaining setup

The owner has no backend host and requested free testing. The [current provider comparison](../research/free-backend-testing-2026-10-26.md) recommends first checking eligibility for the new AWS Free plan for a temporary credit-funded test VM. This is not a promise of free ongoing production hosting. A cloud account/session, eligible resources, real testing SMTP and an HTTPS API hostname are still required before backend deployment.

After that setup, deploy the isolated API/database/worker with the required security/privacy configuration, add the same-origin `/v1` routing and server-side `API_INTERNAL_URL`, then rerun hosted signup, mail, Tutor review, enquiry and chat flows. Payment sandbox isolation and provider credentials remain a separate requirement; the existing production runtime rejects test payment mode.

No account upgrade, paid cloud resource, live merchant approval or Task 28 launch acceptance has been performed. See the [Netlify integration guide](netlify-preview.md) for routing and exact-origin requirements.
