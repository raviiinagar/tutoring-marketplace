# Identity API: tasks 01 and 02

All bodies and responses use JSON. Writes require `Origin` exactly matching `ALLOWED_ORIGINS`, `Content-Type: application/json`, and `credentials: "include"`. Production integration uses one HTTPS UI/API origin. No client-visible bearer token or localStorage identity.

| Method / path | Request | Success |
|---|---|---|
| POST `/v1/auth/registrations` | `{display_name,email,password}` | 202 `{code:"VERIFICATION_REQUIRED",message}` |
| POST `/v1/auth/verification-emails` | `{email}` | 202 generic verification message |
| POST `/v1/auth/verifications` | `{token}` | 200 `{code:"EMAIL_VERIFIED",message}` |
| POST `/v1/auth/sessions` | `{email,password}` | 200 `{user}` and HttpOnly session cookie |
| GET `/v1/me` | No body | 200 `{user}` |
| POST `/v1/me/roles` | `{roles:["LEARNER","TUTOR"]}` | 200 `{user}` |
| POST `/v1/auth/recovery-emails` | `{email}` | 202 generic recovery message |
| POST `/v1/auth/password-resets` | `{token,password}` | 200 `{code:"PASSWORD_RESET",message}` |
| GET `/v1/auth/sessions` | No body | 200 `{sessions:[{id,created_at,expires_at,current}]}` |
| DELETE `/v1/auth/sessions/by-id/:id` | `{}` | 204, own target session revoked |
| DELETE `/v1/auth/sessions/others` | `{}` | 204, other sessions revoked; current retained |
| DELETE `/v1/auth/sessions/current` | `{}` | 204, revoked session and cleared cookie |
| GET `/v1/health` | No body | 200 `{status:"ok"}` after database query |

`user` = `{id,display_name,email,email_verified:true,created_at,roles}`. Registration display name is trimmed, 2–80 characters; email is trimmed/lowercased, valid, at most 254 characters. Passwords are 12–128 characters and are not trimmed. Sign-in accepts existing password strings up to 128 characters. Reject extra fields. Tokens are 43 URL-safe base64 characters. Verification email links use `/auth/verify#token=...`; remove the fragment after reading it into temporary component state, and submit only on an explicit button press.

Errors: `{code,message,correlation_id,field_errors?}`. Field errors map field names to arrays. Codes: `VALIDATION_ERROR` (400), `INVALID_OR_EXPIRED_TOKEN` (400), `INVALID_CREDENTIALS` (401), `UNAUTHENTICATED` (401), `EMAIL_NOT_VERIFIED` (403), `ORIGIN_NOT_ALLOWED` (403), `RATE_LIMITED` (429), `JSON_REQUIRED` (415), `REQUEST_TOO_LARGE` (413), `INTERNAL_ERROR` (500). Missing/unknown accounts get the same public sign-in failure. Registration/resend responses do not confirm whether an account exists.

Verification consumes one token transactionally and activates a pending account; every outstanding token becomes unusable once the account is active. Resend produces another link only for a pending account. Session reads recheck active account status and expiration. New accounts default to Learner; email verification grants no Tutor approval or staff permissions.

Roles contain one or both distinct values `LEARNER` and `TUTOR`. Self-service accepts no staff values or extra fields. Adding Tutor does not approve teaching claims or publish a Listing. Role changes retain the account identity and audit the previous/new roles. Staff assignment is a separate task 03 operator workflow. Account email/ownership changes are not exposed by these endpoints.

Recovery responds identically for unknown, pending, disabled and eligible accounts; only active verified accounts receive mail. Recovery links use `/auth/reset-password#token=...`, expire after 15 minutes (deadline equality is expired), and require explicit password submission. Success consumes all outstanding reset links and revokes every session in the same transaction. It does not sign in automatically. Password hashing occurs outside the transaction; account locks serialize reset, session creation and authenticated mutations. Login rechecks the password hash under that lock to reject a password verified before a concurrent reset.

Session IDs are opaque UUID identifiers, not credentials. Inventory shows only the caller's unexpired, unrevoked sessions; no session token or fingerprint is returned. A foreign or unknown target ID returns 404. Revoking the current session causes subsequent access to return 401; the UI then returns to sign-in. Disabled accounts cannot inspect sessions or change roles. Reset and role/session changes produce audit records containing only event facts, role values and session IDs/counts, never passwords or reset tokens.

Rate limits are shared in PostgreSQL: registration and resend 20/IP/hour, 3/email/hour; verification 20/IP/15 minutes; sign-in 30/IP/15 minutes, 10/email/15 minutes. Invalid token attempts count. Stored passwords use salted scrypt (N=131072,r=8,p=1); tokens are stored as SHA-256 digests; durable mail payloads are encrypted with AES-256-GCM. Outbox delivery retries at most five attempts and expires stale jobs. SMTP delivery is at least once; stable message IDs help duplicate handling, but provider delivery is not exactly once.

Recovery mail is rate limited to 20/IP/hour and 3/email/hour, including ineligible addresses. Reset attempts are limited to 20/IP/15 minutes. Token digests and encrypted outbox payloads use the same protections as email verification.

Development only: GET `/dev/mail` returns `{development_only:true,messages:[{id,to,subject,verification_url?,reset_url?,captured_at,development_only:true}]}`. Each message carries its appropriate link. It requires loopback peer access and capture mode, and is not registered in production. Never include this inbox in the Lovable production UI.
