# Paste this prompt into Lovable

Build a polished, responsive English-language UI for an India tutoring marketplace similar in purpose to Superprof. Use the temporary brand “Tutor Marketplace”. VEER is the owner’s name, NOT the business name.

Scope this generation to account creation, email verification, sign-in and the private account page. The backend already exists: NestJS + PostgreSQL. Use your native React/TypeScript tooling. Do not create Supabase/Lovable Cloud authentication, a new database, payment processing or another backend. Do not mock successful authentication or store sessions/passwords/tokens in localStorage. Do not generate tutor listings, testimonials, verified-tutor badges or fake availability.

Product context for visual direction: free browsing will eventually cover school education, entrance exams (including JEE/NEET), higher education, competitive exams, professional qualifications, career skills, languages/communication, and arts/other learning. The platform sells tutor connections; tuition is paid directly to tutors. Later tasks will add the ₹599/30-day Access Pass, tutor discovery and chat. Do not implement or claim these later features work now.

Design: warm ivory background, deep forest green actions, restrained coral accents, spacious cards, readable typography, clear form labels and subtle motion. Mobile-first; keyboard accessible with visible focus, adequate contrast, inline errors and accessible status announcements. Avoid copied Superprof branding. Give every form a loading state, double-submit protection, field errors, service-unavailable handling and a 429 retry message. Keep supplied passwords unchanged; never trim them.

Create these routes:
1. `/`: concise account-entry page with create-account and sign-in links. No fake search results or working marketplace claims.
2. `/auth/signup`: display_name (trim, 2–80 characters), email (valid, maximum 254 characters), password (12–128 characters). Submit registration, then navigate to check-email for HTTP 202. Explain that this step does not create a child learner profile; those guardian workflows come later.
3. `/auth/check-email`: generic “If this email can be registered, a verification link will arrive shortly.” Explain 15-minute expiry. Include email field and “Send new verification email” action, using the resend endpoint. Include a sign-in link. Do not expose a development email inbox.
4. `/auth/verify`: read the token from URL FRAGMENT `#token=...`, store in temporary React state, then remove the fragment via history.replaceState. Make this safe under React Strict Mode: a second effect run after the fragment has been removed must not erase the captured token. Never log it or send it to analytics. Opening the page must not verify automatically. A “Verify email” button sends the token. Show success with sign-in link; show invalid/expired/used link with check-email/resend link. Missing token gets an explanatory state. Prevent double submit.
5. `/auth/signin`: email/password, helpful unverified-email state linking to check-email, invalid-credentials state, and loading/retry handling. Successful sign-in goes to `/account`.
6. `/account`: load the server account with GET /v1/me before rendering private information. Redirect to sign-in on 401. Display only display_name, email and verified-email status. Provide sign-out. Do not infer learner/tutor/staff roles from email verification. Show an honest note that profiles and tutor discovery will follow. Refresh must retain the real server session.

Implement one typed API adapter, with configurable public API base URL defaulting to empty string (same-origin `/v1`). For a Vite project name this setting `VITE_API_BASE_URL`; it contains only a public URL. All fetch calls use `credentials: "include"`. Writes send `Content-Type: application/json`. Browser sends Origin itself; do not set it manually. Never embed SMTP credentials, AUTH_SECRET, DATABASE_URL or payment secrets. If the API is unreachable in Lovable preview, display “Account service is not connected” and keep the real adapter; do not fall back to fake success.

Exact API contract:
- POST `/v1/auth/registrations`, body `{display_name,email,password}` → 202 `{code:"VERIFICATION_REQUIRED",message}`. Response is generic even if the email exists; do not promise an email has definitely been sent.
- POST `/v1/auth/verification-emails`, body `{email}` → 202 generic `{code:"VERIFICATION_REQUIRED",message}`.
- POST `/v1/auth/verifications`, body `{token}` → 200 `{code:"EMAIL_VERIFIED",message}`. Token is 43 URL-safe base64 characters.
- POST `/v1/auth/sessions`, body `{email,password}` → 200 `{user}`. The backend sets an HttpOnly cookie; the UI never reads a token.
- GET `/v1/me` → 200 `{user}` or 401.
- DELETE `/v1/auth/sessions/current`, JSON body `{}` → 204 with no JSON body. Clear private UI state and navigate to sign-in only on success.
- `user` has `{id:string,display_name:string,email:string,email_verified:true,created_at:string}`.
- Errors have `{code:string,message:string,correlation_id:string,field_errors?:Record<string,string[]>}`. Handle `VALIDATION_ERROR` 400, `INVALID_OR_EXPIRED_TOKEN` 400, `INVALID_CREDENTIALS` 401, `UNAUTHENTICATED` 401, `EMAIL_NOT_VERIFIED` 403, `RATE_LIMITED` 429, and general service failures. Show field errors under the appropriate input. Never parse JSON for 204. Registration must send only its three defined fields; resend only email.

The eventual production deployment serves UI and API on the SAME HTTPS origin, with `/v1/*` reverse-proxied to NestJS. Lovable hosted preview cannot reach a backend running only on my laptop; build the UI with disconnected-service states until I export it for integration. Do not weaken cookie security/CORS or request secrets to bypass this.

Deliver the working routes, reusable account form components, typed API adapter and a short integration README listing routes, public URL configuration, same-origin deployment requirement and test steps. Test required/invalid inputs, link verification, unverified sign-in, expired link, logout, network failure and session restoration after refresh.
