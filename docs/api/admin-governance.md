# Super Admin and delegated review administration

`STAFF_SUPER_ADMIN_USER_ID` in protected server configuration selects the single existing active, verified, enabled staff owner. Where configured, it must match `OPERATIONS_OWNER_USER_ID`; startup rejects an ineligible owner. There is no public promotion or owner-transfer endpoint. The infrastructure operator remains the emergency recovery path. An unconfigured existing deployment retains its legacy scoped operator behavior until explicitly activated; new governed deployments must set the owner.

The owner receives all staff scopes. Other assigned Admins can use TRUST and SUPPORT within existing case-purpose and self-review rules; FINANCE is filtered even from a legacy stored assignment. Super-only enforcement also covers reports/account directory, catalogue, operations and notification administration.

All endpoints require normal account authentication plus a valid staff session. Staff session expiry is at most 30 minutes and remains bound to the current account session.

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/staff/access` | Role, effective scopes, authentication state, MFA requirement and test cutoff |
| `GET /v1/staff/admins?cursor=<uuid>` | Super Admin only; up to 50 assignments and next cursor |
| `POST /v1/staff/admins/grants` | Super Admin only; `{email,reason}` grants TRUST/SUPPORT to an existing active verified account |
| `POST /v1/staff/admins/:id/revocations` | Super Admin only; `{reason}` disables access and revokes staff sessions |

Reasons require 10–240 characters. Unknown body fields, including requested roles/scopes, are rejected. The protected owner cannot be changed or revoked through delegation. Grants/revocations audit the actor, target, reason and role; re-granting cannot reuse a revoked staff session. Normal website accounts remain active after staff revocation.

Testing exception: `STAFF_TEST_MFA_BYPASS_UNTIL` must be an absolute UTC timestamp no more than 72 hours ahead when configuration loads, with a configured owner, `APP_ENVIRONMENT` equal to `staging`, `payment-sandbox` or `staging-payment-sandbox`, and no live payment mode. Expired values do not prevent normal startup; they simply require MFA. The current owner-approved cutoff is 3 November 2026 10:25:48 UTC.

During the exception `POST /v1/staff/sessions` accepts `{password}` after normal verified sign-in. Password reauthentication and rate limits remain required. Sessions are tagged `TEST_PASSWORD` and expire no later than the cutoff. Every privileged request checks that the exception is still enabled and current; these sessions do not satisfy mandatory MFA after disabling/expiry. Authenticator secrets and recovery codes are preserved. Password reset, staff revocation, staff sign-out and ordinary session invalidation continue to deny elevated access. MFA-enrollment and recovery endpoints retain their normal checks.

UI: `/staff` opens a review workspace for regular Admins and the full dashboard for the Super Admin. `/staff/admins` provides audited grant/revoke controls. Testing sessions are explicitly labeled and show the cutoff. Real production keeps mandatory MFA.
