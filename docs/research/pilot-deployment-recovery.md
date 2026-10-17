# Pilot deployment and recovery research

Research date: 18 October 2026 (Asia/Calcutta). Supports [ADR 0008](../adr/0008-budgeted-mumbai-pilot-and-measured-recovery.md) and Task 26. This is a deployment input, not a quote, deployment, launch approval, or measured recovery result. No services or credentials were created.

## Supported deployment defaults

Use one Mumbai (`ap-south-1`) Linux application VM, one private encrypted standard managed PostgreSQL database, and independent encrypted logical exports in a second region. Current Tutor portraits and Guardian/Tutor evidence bytes live encrypted in separate PostgreSQL tables: a complete database export includes those asset rows. Their public-API/private-evidence authorization boundary does not currently require separate object-storage services; no object-store adapter exists. Mumbai and Singapore are Lightsail regions. A proposed recovery destination is Singapore (`ap-southeast-1`), keeping a region with both Lightsail compute/database and S3; actual data-location acceptance remains a launch dependency. [Lightsail regions](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html).

The current list prices are $24/month for the IPv4 Linux general-purpose 4GB/2-vCPU/80GB VM and $30/month for the standard encrypted 2GB/80GB database. The $15 standard database explicitly lacks data encryption; do not substitute it. HA at the encrypted database size is $60/month. Mumbai VM transfer allowance is half the headline 4TB, hence 2TB; both directions consume allowance and excess outbound traffic is charged. Snapshot storage is $0.05/GB-month. No unused media/evidence bucket is included. [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/).

Keep database public mode disabled. Private access is limited to Lightsail resources in the same region; recovery must create a new same-region application/database pair. [Database public mode](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-configuring-database-public-mode.html). Explicitly use hostname-verifying TLS (`sslmode=verify-full` or the driver's equivalent), with AWS's current trusted CA bundle; a private endpoint alone does not establish verified TLS. [PostgreSQL SSL connection](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-connecting-to-postgres-database-using-ssl.html), [certificate bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-download-ssl-certificate-for-managed-database.html).

### PostgreSQL version is an unresolved compatibility gate

The specific engine-selection guide lists PostgreSQL 12–16, but also says creation of PostgreSQL 12 databases ended on 28 February 2025. Its usable listed majors are therefore 13–16; PostgreSQL 18 is not established by that source. [Engine selection](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-choosing-a-database.html). The general FAQ still lists PostgreSQL 9–12 and conflicts with that newer guide; do not use its version list as current inventory. [Database FAQ](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-databases.html).

Provisional default: PostgreSQL 16, pending a read-only authenticated regional blueprint lookup and actual creation availability in both selected regions. Capture `aws lightsail get-relational-database-blueprints --region ap-south-1` and the recovery-region equivalent. Record returned blueprint IDs and exact engine versions, then pin the selected major and approved current minor in deployment evidence. `isEngineDefault` means default, not proof of application compatibility; the documented output has no `isNewDatabaseCreationAvailable` field. No authenticated lookup was available for this research. [Blueprint API/CLI](https://docs.aws.amazon.com/cli/latest/reference/lightsail/get-relational-database-blueprints.html).

The repository's embedded PostgreSQL 18 tests are not acceptance evidence for a PostgreSQL 16 deployment. Before release, run schema migration, application integration and backup/restore checks against the selected deployed major. Use matching-major `pg_dump`/`pg_restore` tooling and a same-major recovery target. PostgreSQL says an older `pg_dump` cannot dump a newer server, and output from a newer `pg_dump` is not guaranteed to load into an older major, even when its source server had that older major. A PG18 dump restored to PG16 must not be the recovery design. [PostgreSQL 18 pg_dump compatibility](https://www.postgresql.org/docs/18/app-pgdump.html).

## Independent S3 recovery bucket

Use an ordinary S3 general-purpose bucket, explicitly configured in the proposed second region. Bucket region cannot be changed later; S3 keeps objects in that region unless explicitly transferred. Region selection and storage/export paths must be present in reviewable definitions. [S3 bucket creation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html).

Conservative configuration defaults, separate from any retention/legal approval:

| Control | Proposed setting and reason |
|---|---|
| Access | All four bucket Block Public Access settings enabled; account controls checked too. [Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html) |
| Ownership | `BucketOwnerEnforced`, ACLs disabled; explicit IAM/bucket policies identify backup writer and separate recovery reader. [Bucket policies and ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html) |
| Transport | Explicit deny when `aws:SecureTransport=false` for bucket and objects; upload/download with HTTPS and normal certificate validation. [S3 encryption in transit](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryptionInTransit.html) |
| At rest | Explicit SSE-S3 `AES256` default and uploads. S3 encrypts new uploads by default without additional encryption fees; this is server-side encryption, not independently held client-side keys. [SSE-S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html) |
| Versioning | Enabled; use unique timestamp/run keys, never an overwritten sole `latest` archive. All versions consume storage. Versioning protects accidental overwrite/deletion but is not an immutable/off-account backup. [S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html) |
| Export retention | Proposed `exports/` current-version expiration after 14 days; noncurrent expiration after 14 days since becoming noncurrent; separate expired-delete-marker cleanup. For unique keys, old data can remain about 28 days because current expiration first creates a delete marker. [Expiration semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html) |
| Incomplete uploads | Abort after one day; object expiration does not clean multipart parts. [Lifecycle elements](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html) |

Today the dump contains required asset rows; include their decryption secret in the independently recoverable secret inventory without putting secrets in the archive manifest. A future object-store adapter must copy referenced asset versions too: the short export lifecycle must not expire still-referenced assets just because their creation predates the latest database export. That future change needs reachability/retention checks and a separate cost estimate. Restrict the writer to upload/list needs; keep delete/version-delete/bucket-policy administration outside its routine credentials. These are proposed application/IAM design controls, not an assertion of account compromise protection. Object Lock requires a deliberate retention choice; it is not silently enabled here. [Object Lock capabilities](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).

## Recovery claims and measurement

Lightsail's database backups support point-in-time restoration within seven days; automatic backups disappear when the database is deleted, so manual snapshots are needed for longer retention. These backups remain useful for local recovery. [Database FAQ](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-databases.html). Database snapshots cannot be copied across regions. Instance/disk snapshots can be copied, which does not give the managed database cross-region recovery. [Snapshot limitations](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-snapshots-in-amazon-lightsail.html). PITR creates a new database and offers time selection in five-minute increments; that is not a five-minute regional RPO or a recovery-duration guarantee. [PITR procedure](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-creating-a-database-from-point-in-time-backup.html).

Proposed export interval: 12 hours, with non-overlapping runs, immediate failure alerts, and independent freshness monitoring warning at 18 hours since the latest recoverable export's snapshot start. A once-per-24-hour schedule leaves no margin for export/upload time or failure: the worst completed snapshot age is approximately interval plus export/upload duration, increasing further during retries. Require measured schedule + duration + retry allowance <=24 hours; the <=24-hour independent-export RPO remains a pilot target until demonstrated. `pg_dump` produces a consistent database snapshot while normal activity continues, but a single-database dump does not include cluster-wide roles/tablespaces. [SQL dumps](https://www.postgresql.org/docs/18/backup-dump.html).

Store a manifest with snapshot start, export/upload completion, source/server/tool version, archive SHA-256, object versions/checksums, release ID and migration version. Mark a run recoverable only after independent download/checksum verification of the archive and required assets. Match grants/roles through reviewed provisioning. Keep configuration, artifacts, recovery access and any client-side decryption key outside the application VM.

Measure a fresh isolated restore in the second region, starting the clock before infrastructure creation and ending after application, assets, durable jobs, deletion replay and payment reconciliation checks. Disable outbound customer/merchant effects during rehearsal. Record achieved data age and complete recovery duration, including operator/DNS/credential steps; four hours is the ADR's target, not evidence. External monitoring must check public HTTPS plus backup freshness from outside the application VM/primary region; test its notification route and escalation recipient.

## Configurable monthly cost worksheet

USD items below are list prices where labelled; variable allowances are deliberately explicit planning inputs, not verified S3/monitoring quotes. Replace them with regional estimates and measured volume. S3 charges separately for retained storage, requests, applicable retrieval and transfer; destination region and copies matter. [S3 pricing](https://aws.amazon.com/s3/pricing/).

| Item | USD/month planning input |
|---|---:|
| Production IPv4 app VM, list price | 24 |
| Production encrypted standard DB, list price | 30 |
| Retained snapshots: illustrative 80GB-month x $0.05 | 4 |
| Independent S3 database exports (including asset rows), including versions | 3 allowance |
| S3 requests / verification reads | 1 allowance |
| Backup transfer / restore download / application overages | 5 allowance |
| External HTTPS + backup freshness monitoring and notifications | 5 allowance |
| Logs, transactional email and domain amortisation | 5 allowance |
| **Production planning subtotal** | **77** |
| Persistent isolated staging: duplicate VM + encrypted DB | **54 additional** |
| Temporary regional rehearsal resources / retained artifacts | **D, separately estimated** |
| Additional storage/traffic/monitoring capacity above allowances | **U, separately estimated** |

A full staging duplicate makes the worksheet **$131 + D + U**, before tax/FX/billing charges. If staging is ephemeral, replace its $54 VM/database portion with actual billed hours and retain its storage/snapshot charges; stopping these resources does not stop charges. Instances/databases are hourly billed up to the monthly cap and incur charges until deleted. [Lightsail billing](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html). Do not interpret deletion as permission to destroy production data.

Evaluate the INR10,000 ceiling using actual invoicing, not an invented conversion: `INR total = USD subtotal * effective INR/USD * (1 + applicable tax fraction) + INR fees`. With persistent staging and D=U=0, the pre-tax/no-fee break-even is INR76.34/USD; with production alone it is INR129.87/USD. These are arithmetic thresholds, not exchange rates. No current billing FX, account tax treatment, free-tier eligibility or owner cost acceptance was verified; the configuration cannot yet be described as within budget. HA adds $30 to the production subtotal and still leaves one application VM.

## Evidence still required before launch

Record live engine/bundle availability; PG-major compatibility; the complete selected-region price estimate including staging and rehearsals; effective billing FX/tax; second-region data-location acceptance; actual IAM/backup controls; restore/load/failure evidence; monitoring recipients; domain/DNS access; production credentials and merchant/payment approvals. Routine sizing, retention and schedule values above are documented defaults for review, while these external dependencies remain missing. No AWS account access, DNS change, merchant setup, deployment or RPO/RTO attestation was performed.
