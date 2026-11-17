# Sign in with Google

ADR0020. Pages: `/auth/signin` and `/auth/signup` show **Continue with Google** when it is configured.

| Method/path | Behaviour |
|---|---|
| GET `/v1/auth/providers` | `{google}`: whether the button should be shown |
| GET `/v1/auth/google/start?return_to=<path>` | Records a one-time attempt, sets the `tm_google_signin` binding cookie (HttpOnly, `/v1/auth/google`, 10 minutes) and redirects to Google with PKCE, `state`, `nonce` and `prompt=select_account`. `return_to` must be a same-site path; anything else becomes `/account`. Limited to 30 per address per 15 minutes |
| GET `/v1/auth/google/callback?state&code` | Checks the state, browser binding, expiry and single use, exchanges the code, checks the ID token's issuer, audience, expiry, nonce and verified email, then signs in, links or creates the account and redirects to the saved path with the normal session cookie. Failures redirect to `/auth/signin?google=failed`, `cancelled`, `account` or `unavailable` without a session |

Accounts: an existing link signs in; otherwise the account with the same email is linked (an unverified registration becomes verified); otherwise a new verified account is created. Disabled accounts, accounts linked to another Google account and unverified Google emails cannot sign in. Configuration, auditing and privacy: see ADR0020. Migration `042-google-sign-in.sql` adds `user_identities` and `oauth_states`.

Tests: `apps/api/test/google-sign-in.test.ts` runs the full flow against a fictional token endpoint (PKCE, state replay, missing binding, nonce, audience, issuer, expiry, unverified email, cancellation, return addresses, linking, pending accounts, disabled accounts and a second Google account); `privacy.test.ts` covers export and deletion of the link. `lovable-ui/src/test/google-sign-in.test.tsx` covers the button and messages.
