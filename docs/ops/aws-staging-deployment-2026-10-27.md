# Working isolated staging deployment - 27 October 2026 IST

The temporary backend is deployed and connected to the Netlify UI. **Homepage, actual catalogue, real mailbox verification, sign-in, secure session cookies, authenticated browser reload and sign-out are verified online.** This is an isolated staging deployment with no approved Tutor supply, disabled payments and disabled Guardian verification; it is not Task 28 production launch acceptance.

| Item | Verified state |
| --- | --- |
| UI | https://tutoring-marketplace-ravii-preview.netlify.app |
| Sign-in | https://tutoring-marketplace-ravii-preview.netlify.app/auth/signin |
| API | https://ravii-tutoring-test.duckdns.org |
| UI hosting branch | `deploy/netlify-preview-20261026` |
| Published UI commit | `d4cc9bfd959c9b006755fdd13f20056972823878` (Unified admin dashboard) |
| Backend release | `admin-20261028-c1e3a5132224`; verified Linux base retained |
| Compute | Mumbai, Ubuntu 24.04 x86_64, 8 GiB `m7i-flex.large` |
| Database | Private-interface PostgreSQL 16.15, verified hostname TLS, 29 applied immutable migrations |
| Process runtime | Node 24.22.1; separate systemd API and durable worker services |
| HTTPS/scanning | Caddy HTTPS; real updated ClamAV, clean-file and EICAR stream checks passed |
| Recovery | Private versioned/encrypted Singapore S3 bucket, independent signed deletion ledger, verified encrypted export, twelve-hour export timer |
| Owner | Actual email proof consumed through the application; audited SUPPORT/TRUST/FINANCE grant; staff MFA enrollment remains required |

## Authorization and billing boundary

The owner approved the [seven-day staging retention, Singapore recovery location and extra USD1 planning allowance](staging-activation-proposal-2026-10-27.md), conditional on no actual paid billing. The agent rechecked `GetAccountPlanState` and [AWS's Free-plan policy](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html) before continuing. Final state remains **FREE / ACTIVE**; the API still reports USD100, but usage reporting may lag and that balance does not mean the resources cost nothing. No Paid plan upgrade, Organizations/Control Tower enrollment, Savings Plan, reservation, Marketplace purchase or other automatic-upgrade action was performed.

Current resources consume promotional credits while the account remains on the Free plan. AWS states this plan incurs no usage charges, ends at credit exhaustion or six months, and closes automatically at expiry. Other account actions can change this boundary; do not treat this record as permission to upgrade. The recorded plan expiry is 26 April 2027, subject to earlier credit exhaustion. The VM's approved compute/disk/IP estimate is approximately USD7.89 for 72 hours; the independent storage/key-recovery scenario and extra allowance are separate, usage-based planning amounts, not hard billing caps.

## Actual deployment and safeguards

The inspected CloudFormation change sets deployed the temporary EC2 foundation and the Singapore recovery stack. Lint and project Guard rules passed. The instance profile was synchronized into the EC2 template; a later reviewed update opened only public TCP 80/443 after actual runtime readiness and verified owner bootstrap passed. SSH remains restricted to the operator `/32`; database and scanner ingress remain closed. IMDSv2 is required, the 30 GB gp3 root disk is encrypted, and strict SSH host-key verification used authenticated EC2 console keys.

The trusted Linux archive checksum and all 415 manifest entries passed on the actual host before and after locked production API/contracts dependency installation. No local development database, captured mail, test scanner, Guardian fixture, injected access grant or fabricated public Tutor was deployed. Application and backup database roles are separated from the schema owner; the application has no superuser/schema-create/migration-write permission. The backup role has read access plus the specific backup-health observation insert permission.

The [actual approved staging policy](../../deployment/staging-retention.approved.json) is installed. Its seven-day class durations apply at the documented deletion/purpose-end events, with real holds and separate recovery/audit rules; they are not a promise that all accounts/backups disappear seven days after signup. Production merchant/child-data policy approval remains separate.

[The recovery template](../../deployment/staging-recovery.cloudformation.json) created one Singapore bucket, one generated recovery-root secret, a host role/profile and separate reader/writer roles. Actual S3 configuration confirmed all four public-access blocks, private bucket-policy status, AES256 server-side encryption, versioning and Singapore location. Account-level S3 public-access block configuration was absent; bucket-level protections were verified, and no broad account setting was silently changed. API read access succeeds while reader writes are denied; writer deletion is denied. Workload role assumption is restricted to the named EC2 source instance; no root/static AWS credentials were installed on the VM.

Recovery key values were resolved only in an `asm-exec` child process using dynamic references. The model/tool output never contained secret values. Separately derived auth/database/backup material is installed in restricted service files; the recovery root remains in Secrets Manager. Private database TLS and current configuration copies are also retained outside the VM in ACL-restricted ignored local storage. This is key/config recoverability preparation, not a full regional recovery measurement.

Independent encrypted/versioned write/read-back, signed-index publication and reader validation passed. The first actual PostgreSQL export was encrypted, uploaded and downloaded for checksum verification; the backup service finished successfully and recorded fresh backup evidence. At inspection there were five object versions totalling 333893 bytes, including one encrypted export. This is below the approved planning footprint; continue measuring versions and requests rather than treating USD1 as an AWS spending limit. The twelve-hour timer remains active while the VM runs.

## Owner and protected login material

The existing testing Gmail account received a real application verification email. The owner supplied the actual link through a protected local file. The application consumed its token and performed its normal verification transaction; no verified flag was manually forged. The private operator then granted the approved staff scopes with an audit reason and configured the actual verified owner UUID. Staff MFA was not generated or bypassed by the agent; enroll it through the hosted staff console.

Sign in using that testing Gmail address and `OWNER_PASSWORD` in `.local/aws-backend-test-2026-10-27/runtime/owner-setup.env`. This is the generated **application login password**, distinct from the Gmail app password. Do not print either file's contents in chat or logs. The consumed verification URL was removed from the local setup file, and temporary VM credential/proof transfer copies were removed after successful checks. Protected installed runtime configuration and local recovery copies remain available.

## Netlify integration and online verification

The dedicated hosting worktree committed/pushed only the `/v1/*` rewrite to the existing hosting branch. Netlify published the resulting commit successfully. The root working-tree TOML has the same reviewed rewrite; unrelated owner work was not committed or pushed.

`API_INTERNAL_URL` points to the actual API origin. A granular functions/production environment-setting attempt returned 403; the Free-compatible all-context/all-scope configuration succeeded. This variable is only a public API URL. No auth secret, database URL/password, SMTP credential, recovery key or AWS credential was placed in Netlify or a `VITE_*` variable. Browser calls stay on the UI's origin through the HTTPS rewrite, preserving Origin and cookies. The Netlify provider's `production` deploy context is hosting this **staging** application, not a live marketplace launch.

[Sanitized hosted evidence](evidence/aws-staging-2026-10-27.json) records passing checks:

- Homepage/sign-in HTML and preview noindex behavior; the SSR homepage uses robots metadata while sign-in also returns a header. The staging API explicitly reports non-indexable public SEO. A missing root `X-Robots-Tag` header alone is not treated as an indexing failure when the correct SSR robots metadata is present.
- Same-origin API health and actual catalogue; no development mail endpoint; untrusted Origin rejection.
- Actual owner login, `__Host-` Secure/HttpOnly/SameSite=Lax cookie with no Domain, authenticated `/v1/me`, private no-store response and mandatory staff MFA guard.
- Correct JSON-content-type sign-out and revoked-session denial. The API deliberately rejects mutation requests missing JSON content type; the UI and final checks use the required header.
- Real headless browser form login, browser cookie acceptance, authenticated page reload and sign-out. No screenshot, trace, password, email address or session cookie was included in published evidence.

No approved Tutors exist yet; an empty supply result is intentional. Tutor publication, phone/Guardian verification, payment-dependent Contact Requests/Connections/chat, payment sandbox acceptance and live money are not inferred from these auth/catalogue checks. Current production-runtime staging rejects configured payments; no isolation guard was weakened.

## Deadline, cleanup and remaining acceptance

The existing stop timer remains **30 October 2026, 00:23:31 IST** (`2026-10-29T18:53:31Z`). EC2 instance-initiated shutdown behavior is `stop`; the timer preserves data for deliberate cleanup. Compute stops, but EBS storage and independent recovery resources persist and consume credits until their cleanup. The public IP can change on restart. Export required test data before teardown, stop ordinary traffic/workers, explicitly terminate the disposable VM/disk, detach/remove its dedicated profile/group/key resources and update DNS as appropriate. Retained CloudFormation resources are not automatically deleted with their stack.

Recovery exports follow the approved fourteen-day lifecycle/current-version policy; noncurrent versions and deletion markers require verification. Preserve deletion tombstones and key versions while any retained export can restore old data. The recovery ledger/secret have no blanket seven-day auto-delete. Review and remove temporary recovery resources within the separately approved one-month planning window after all retained exports are accounted for. A stopped VM cannot execute later privacy sweeps or backup jobs.

Keep Task 26 fresh-target regional restore, deployed compatible rollback, full RPO/RTO and independently hosted outage-watchdog acceptance open. Keep Task 28 legal operator/merchant/tax, live Guardian policy, real Tutor supply, money/refund/bank verification and final launch approval open. Successful staging activation does not complete those gates. Historical preparation and failure records remain linked from [the EC2 foundation handoff](aws-ec2-test-2026-10-27.md).

Access Pass coupon rollout: [27 October 2026](access-pass-coupons-2026-10-27.md). Ordinary paid checkout stays disabled; bounded BETA100 provides non-cash coverage for verified normal users.

Latest admin workspace and reporting rollout: [28 October 2026](admin-dashboard-2026-10-28.md). Migration 031, shared staff workspace, scoped audience/account reporting and anonymous public traffic observations are deployed. Paid checkout and infrastructure deadline remain unchanged.
