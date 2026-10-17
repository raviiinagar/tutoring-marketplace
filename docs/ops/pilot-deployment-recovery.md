# Pilot deployment, exports and recovery

Task 26 implements the local recovery workflow and reviewable deployment bundle. Cloud resources, DNS, real delivery, merchant reconciliation and a regional recovery measurement are **not deployed or approved**. Use the [verified service research](../research/pilot-deployment-recovery.md) for sources and current planning inputs. [ADR 0008](../adr/0008-budgeted-mumbai-pilot-and-measured-recovery.md) remains the deployment decision.

## Layout and isolation

- Build on Linux outside the application VM. Deploy the NestJS API, durable workers and Lovable/Nitro UI as separate processes, behind Caddy HTTPS. API and UI bind to loopback; only 80/443 and one approved SSH `/32` are public. Trust forwarded addresses only from the local proxy.
- Provision separate staging/production databases, credentials, encryption keys, buckets, ledger prefixes, mail accounts and payment configuration. Staging uses the production runtime with HTTPS and payments disabled; existing live/test payment guards remain intact.
- Pin an authenticated, regionally available PostgreSQL 16 blueprint and encrypted 2GB database bundle. Local PG18 development is preserved; an additional pinned PG16 engine supports compatibility tests. Dump/restore tools and servers must share the same major.
- Private Tutor/Guardian evidence and public portraits have separate authorization and encrypted PostgreSQL tables. The database export includes their bytes. No unused object-media buckets or unimplemented media adapter are assumed.
- The recovery bucket is in the separately approved second region. An independent monitor runs outside the application VM/primary region with read-only S3 access and its own verified notification route. Install its timer there, not beside the app. Its compute, reads, mail and logs must fit the reviewed monitoring allowance.

The CloudFormation templates retain application/database/bucket resources on deletion/replacement. Retention prevents accidental stack deletion from destroying data; it also continues billing. No template has been applied. Inspect actual regional inventory and a change set before provisioning.

## Pre-provisioning checklist

1. Review [the cost worksheet](../../deployment/budget.example.json). The app/database list-price baseline is $54/month. The example includes a full $54 staging duplicate and deliberately remains incomplete until actual usage, rehearsal cost, billing FX/tax/fees and recovery-location approval are supplied. Persistent duplication can exceed INR10,000; budget an explicitly time-bounded staging/rehearsal instead if necessary. Stopping Lightsail resources does not end their billing.
2. Run `node scripts/deployment-budget.mjs <reviewed-budget.json>`. Missing inputs and over-budget totals exit nonzero. A passing arithmetic check is not permission to provision.
3. Capture `aws lightsail get-relational-database-blueprints` and `get-relational-database-bundles` in both selected regions. Require PostgreSQL 16, an active encrypted bundle, matching actual price and sufficient capacity. Capture the VM blueprint/bundle inventory too. Do not rely on a stale FAQ or an unverified PG18 target.
4. Review `deployment/pilot.cloudformation.json` for each environment and `deployment/recovery.cloudformation.json` in its approved second region. Use distinct writer/reader IAM roles and distinct environment buckets. Verify account-level S3 public-access controls as well as the template. No secret belongs in Git, user data, an archive or an ordinary CloudFormation parameter file.
5. Obtain domain/DNS, verified SMTP, approved retention/Guardian decisions, actual owner routing and recoverable secrets. Production/test credentials are not interchangeable. Live payments additionally require the existing merchant, tax/invoice, capture and launch approvals.

## Build and installation

The GitHub workflow pins action commits, tests against PG16, builds off-VM and publishes an allowlisted archive plus SHA-256. It has read-only repository permissions and performs no deployment. A workflow definition is not a successful hosted CI run; record the actual run before selecting its artifact.

```text
npm ci
npm ci --prefix lovable-ui
npm run typecheck
npm test
npm run build
node scripts/release-manifest.mjs write <reviewed-release-id>
node scripts/release-manifest.mjs verify .
```

Tests need PostgreSQL 16 client tools (`PG_RECOVERY_BIN`). On Windows use the official [PostgreSQL/EDB binary distribution](https://www.postgresql.org/download/windows/) and set its `bin` directory; local tools under `.local/` are not committed. CI installs the PostgreSQL 16 client package. Set `LOCAL_POSTGRES_MAJOR=16` to exercise the rest of the isolated database tests on that major; existing local development defaults to PG18. Never point an engine of another major at an existing data directory.

On the approved Linux hosts, install a supported Node 24 runtime, PostgreSQL 16 client tools, Caddy and a running updated ClamAV scanner. Create root-owned `/opt/tutoring/releases/<id>` releases, an atomic `current` symlink, separate `tutoring`/`tutoring-ui` OS users, and protected `/etc/tutoring` configuration. Restore roles/grants through reviewed provisioning; a single-database dump does not contain cluster roles.

Use separate migration/restore, application and backup database roles. The application gets required DML/function permissions, not schema ownership, superuser, trigger-disabling or truncate rights. Backups need read access plus the narrowly required health-evidence insert. Verify grants after `--no-acl --no-owner` restore before restarting services.

Verify the archive digest against the selected trusted CI artifact, extract into a **new** release directory, install locked production API dependencies with `npm ci --omit=dev`, and verify the release manifest there. Nitro's built server/dependencies travel in `.output`; do not rebuild the UI on the VM. The manifest verifies bytes/contained symlinks; its unsigned JSON alone does not establish publisher authenticity.

Use `deployment/runtime.env.example` and `ui.env.example`. Supply no backend secrets to the UI process. Environment files should be root-owned and readable only by the required service group; the backup key is a separately protected 0600 file. Give API startup an environment-scoped ledger reader; the worker needs the ledger writer through its separate credentials file. The root backup unit uses a separately protected backup environment/credentials file and can read the private ledger without widening its permissions.

Keep recoverable copies of `AUTH_SECRET` (asset encryption and ledger signatures), the independent 32-byte backup key, relevant older key versions, database access, payment/webhook secrets, approved policy, release artifact and recovery credentials **outside the application VM/primary region**. Record archive IDs/key-version mapping in the protected recovery inventory. Do not rotate away keys needed by retained exports.

The systemd definitions verify the artifact before starting API/UI/ordinary workers. Create writable private ledger, backup and watchdog-state directories for their respective users. Install and validate the Caddy configuration with real host/email environment values before starting its service. A root-owned maintenance flag must be readable by Caddy.

Install `deployment/systemd/caddy-environment.conf` as the Caddy service environment drop-in, using `deployment/caddy.env.example`. Keep `/var/lib/tutoring` root-owned and traversable by Caddy, its maintenance flag root-owned/readable, and private ledger/backups in separately owned 0700 subdirectories.

## First isolated environment

Keep `/var/lib/tutoring/MAINTENANCE` present while bootstrapping. Migrate using the reviewed release. Initialize an empty signed ledger with the existing privacy operator, then publish it independently:

```text
node --env-file=/etc/tutoring/api.env apps/api/dist/privacy-operator.js init-ledger production --traffic-stopped
node --env-file=/etc/tutoring/api.env apps/api/dist/recovery-operator.js publish-ledger staging --traffic-stopped
```

The privacy operator's `production` argument is `NODE_ENV`; recovery operators use `APP_ENVIRONMENT` (`staging` in this example). The independently initialized empty ledger is required before production entrypoints start. Never initialize an empty index over existing tombstones.

Recovery operators require the production runtime for either deployed identity (`staging` or `production`). A shell environment override cannot silently turn a deployed recovery into a development/test operation.

Bootstrap the first owner through `AuthService.register` in an offline root/operator session against the empty environment, using the existing registration schema and a protected input file; never insert a verified password/account directly or bypass email verification. Read the resulting user UUID through that privileged session and configure `OPERATIONS_OWNER_USER_ID` before startup. Start API/workers privately, complete the actual email verification, then use the compiled staff operator to grant the owner's approved scopes and enroll MFA. No owner account, email or scopes have been created by Task 26.

```text
node --env-file=/etc/tutoring/api.env apps/api/dist/staff-operator.js grant --email <verified-owner-email> --environment production --scopes SUPPORT,TRUST,FINANCE --reason "Initial approved owner access"
```

Use a private SSH tunnel to Caddy with the original HTTPS hostname/port and certificate, with a local hostname override if needed. Caddy's maintenance bypass matches the actual loopback connection, not a supplied forwarding header; public clients remain blocked. Preserve the exact configured HTTPS origin. Do not relax CORS, cookies or MFA to make a tunnel work.

Verify the owner email/SMS route as actually configured, every worker heartbeat, ClamAV scanning, public/private authorization and HTTPS. The public health endpoint requires the database, every critical worker and a recent monitor scan. The owner-routing report must say configured before opening traffic; configuration UUID alone is not verified delivery. The initial real Guardian workflow remains disabled pending its accepted external verification method.

## Independent exports and deletion durability

`createRecoveryExport` holds a repeatable-read exported PostgreSQL snapshot while obtaining table fingerprints and running `pg_dump --snapshot`. It encrypts the custom dump directly with AES-256-GCM; no plaintext SQL dump is written. The authenticated manifest records snapshot start, environment, release, server major, migration checksums and table fingerprints. Existing migrations keep their recorded checksums; only deterministic LF/CRLF equivalents are accepted.

`publish` uploads a unique encrypted object, downloads its exact version to verify SHA-256, writes a verified receipt/latest pointer conditionally, and records backup evidence for the verified Support owner. The twelve-hour timer removes only the local archive/receipt it just created **after verification**. Export failures leave earlier independent copies intact and do not refresh healthy evidence.

```text
node --env-file=/etc/tutoring/backup.env apps/api/dist/recovery-operator.js publish staging auto --remove-local-after-verified
```

Local export without a claim of independence:

```text
node --env-file=/etc/tutoring/api.env apps/api/dist/recovery-operator.js export staging /protected/new-export.enc
```

Signed deletion/withdrawal tombstones are uploaded and downloaded for verification before the worker can finish erasure. Index publication uses conditional writes; an older local index cannot replace a newer independent one. An unavailable independent store leaves the durable erasure job retryable rather than acknowledging completion. On startup, production validates local and independent signed ledgers. Retain tombstones as long as any recoverable copy could resurrect the corresponding data; their lifecycle needs approval independently of short export expiration.

The implemented single-object upload limit is below 5 GiB; larger archives fail visibly and require a reviewed multipart implementation/capacity plan. Fingerprints scan all public application tables; this is pilot-scale tooling, not a tested large-database throughput promise. Asset moves to another store require updating export reachability, verification and retention first.

Install `tutoring-backup.timer` on the app host and `tutoring-watchdog.timer` on the independently budgeted monitor. The watchdog checks public HTTPS/API/UI, the exact version/checksum of the latest S3 object and **snapshot age**, warning at 18 hours. Its environment has read-only storage credentials, its own verified SMTP route, and no database/auth/backup-decryption/merchant secrets. A local persistent alert-attempt record limits mail attempts to one per 15 minutes, including unknown SMTP outcomes. Test real notification delivery and independent monitor failure/escalation before launch.

## Fresh-environment recovery

1. Start the recovery clock **before infrastructure creation**. Stop/fence the old API and workers, keep public maintenance active, and prevent concurrent old-region writes. Retain failed targets for inspection; do not drop or overwrite an occupied database.
2. Provision the approved same-major private encrypted target and verify hostname/TLS/CA. Recover the matching trusted artifact, roles, configuration, decryption keys and credentials independently. Keep live fund-moving and customer-notification effects stopped.
3. Fetch the latest independent ledger into a new empty private directory. Never use only the older ledger that happened to exist at database snapshot time.

```text
node --env-file=/etc/tutoring/recovery.env apps/api/dist/recovery-operator.js fetch-ledger production --traffic-stopped
node --env-file=/etc/tutoring/recovery.env apps/api/dist/recovery-operator.js download production /protected/download.enc <archive-id> <exact-object-version>
node --env-file=/etc/tutoring/recovery.env apps/api/dist/recovery-operator.js restore production /protected/download.enc --traffic-stopped --latest-ledger-verified
```

4. Restore authenticates the entire archive before target mutation, requires an empty database and matching environment/major, restores in one transaction, compares every table fingerprint, verifies migrations, pauses checkout, revokes restored account/staff sessions and reapplies the latest tombstones. A separate durable guard prevents startup after an incomplete restore/privacy replay. A failed attempt requires a fresh target and corrected prerequisites; never clear its guard to force startup.
5. After successful privacy replay, start API in its restricted recovery console. Start only the reconciliation worker with `RECOVERY_RECONCILIATION_ONLY=true`. It runs payment-event verification, financial-event reconciliation and settlements, without ordinary notification/refund/availability/deadline loops. Keep maintenance active and use the private HTTPS tunnel.
6. Finance signs in with fresh MFA, completes full-month provider reconciliation covering snapshot time through the reviewed cutoff, drains imported payment/refund facts and resolves financial exceptions. Explicitly inspect **unsettled payments, refunds/chargebacks and bank evidence**, including provider transactions whose local purchase rows were lost after the snapshot. Imported unknown transactions remain exceptions; do not fabricate payer identity, consent, capture time or access from a provider receipt. Existing financial review commands apply.

   An expected settlement delay can receive a documented reviewed exception outcome without posting bank credit. Exception resolution records a reason; it does not manufacture a bank receipt or rewrite the money journal.

   Confirm the merchant's report calendar during credentialed setup and include every overlapping provider-calendar period. The server's UTC month-coverage check is a minimum; it does not replace the documented merchant-specific completeness review.
7. In `/staff/operations`, enter completed reconciliation IDs, the actual verified cutoff, a private evidence reference and the explicit review attestation. The server checks scope/MFA, privacy replay, provider/key/mode, fresh post-restore runs, month coverage, pending inbox facts and unresolved exceptions. It records the release idempotently and leaves checkout paused. A disabled-payment staging environment can release only with **no purchase or financial history**; production cannot use that exception.
8. Restart API and ordinary workers without the reconciliation-only override. Independently verify original portraits/private evidence, erased-account restrictions, durable messages/jobs, financial records and health. Deliberately resume checkout using its revisioned Finance command; remove public maintenance only after the complete operational review. Record the final time, achieved snapshot age, operator/DNS/credential time and external evidence. A checked UI box is an audited human attestation, not automated proof of bank settlement.

## Compatible application rollback

Application rollback never restores an older financial database. Keep traffic paused, stop ordinary workers and verify the previous trusted artifact and its manifest. Use the currently installed operator to verify that the candidate contains every applied migration with an accepted immutable checksum and requires no unapplied migration:

```text
node --env-file=/etc/tutoring/api.env apps/api/dist/release-operator.js check production /opt/tutoring/releases/<candidate>/apps/api/migrations --traffic-stopped
```

The check runs in a read-only transaction. A pre-028 artifact is rejected after migration 028; do not remove migration history or edit old SQL to force it. Schema compatibility alone does not prove old application behaviour. Select a previously tested compatible artifact, atomically switch the root-owned `current` symlink, restart services, verify health/financial and authorization checks, then deliberately reopen traffic. Record a real deployed rollback before accepting Task 26.

## Evidence and remaining acceptance

The reproducible PG16 integration drill creates a separate fresh cluster, restores an encrypted export transferred through an isolated S3 HTTP protocol fixture, fetches a later deletion ledger, checks original portrait decryption and immutable 59900-paise balanced postings, and verifies deleted/old-session denial and the checkout hold. The provider fixture also exercises failed independent writes and corrupted copies. Its local timing/report is `.local/task26-local-drill.json`; capture the final run in the ticket.

These checks establish software behaviour with fictional data. They do not establish AWS durability, real provider reconciliation, deployed rollback, regional data-loss <=24 hours or complete recovery <=4 hours. Task 26 remains open for actual staging/second-region provisioning, current budget/location acceptance, key-recovery exercise, verified alert delivery and the measured full regional drill. The sample budget intentionally blocks provisioning while factual inputs are missing.
