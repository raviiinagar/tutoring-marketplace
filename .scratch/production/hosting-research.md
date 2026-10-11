# Small production pilot hosting research

Research date: 10 October 2026. Decision input only; nothing provisioned. Ceiling: INR10,000/month excluding payment fees and marketing. Prices are official USD monthly list prices, not negotiated quotes. Taxes, exchange/card charges, usage overages and temporary restore/staging resources are additional.

## Candidate A: AWS Lightsail in Mumbai

Proposed layout: one Linux VM runs separate Next.js, NestJS and worker processes behind HTTPS; managed PostgreSQL stores domain data and durable jobs/outbox. Keep the database private. Separate buckets hold public profile images, private evidence and encrypted recovery exports. This is a proposed small-pilot deployment, not capacity-tested architecture. A PostgreSQL-backed job mechanism would be a deliberate implementation choice replacing a separately purchased queue/cache at pilot scale.

| Component | Official price/month | Proposed use |
|---|---:|---|
| IPv4 Linux VM, 4GB RAM / 2 vCPU | $24 | Web, API and worker; build artifacts outside production |
| Standard PostgreSQL, 2GB RAM / 80GB disk | $30 | Encrypted database; single primary |
| Three 5GB object-storage bundles | $3 | Public images, private evidence, separate-region recovery exports |
| Fixed subtotal | **$57** | Before additional costs |
| Replace standard DB with encrypted HA DB | +$30 | **$87 subtotal**, same single app VM |

These sizes and prices come from [AWS Lightsail pricing](https://aws.amazon.com/lightsail/pricing/). The cheaper $15 database is explicitly listed without data encryption and does not meet the blueprint's encryption requirement. Snapshot storage is $0.05/GB-month. Storage growth, retained versions and transfer overages require separate allowance.

Mumbai (`ap-south-1`) is a supported [Lightsail region](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html). [Managed databases support PostgreSQL](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-databases.html); verify the offered supported engine version when creating the database. [Buckets are available in Lightsail regions](https://docs.aws.amazon.com/en_en/lightsail/latest/userguide/buckets-in-amazon-lightsail.html). Mumbai VM transfer allowances are half the headline global allocations; the proposed 4GB VM therefore has 2TB included rather than 4TB. See [transfer rules](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-data-transfer-allowance.html).

Databases default to private mode; keep access restricted to same-region Lightsail instances. Automatic database backup retains seven days and disappears if the database is deleted; retain manual snapshots before destructive operations. HA adds a standby in another availability zone. These capabilities are documented in [Lightsail database FAQs](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-databases.html). [PITR](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-creating-a-database-from-point-in-time-backup.html) restores into a new database, with selectable points in five-minute increments; application connection changes and verification remain our work.

Private evidence must remain in an all-private bucket, with downloads authorised by the API; public image publishing must be separate. [Bucket permissions](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-understanding-bucket-permissions.html) default to private. [Object versioning](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-managing-bucket-object-versioning.html) protects previous versions but is not an independent disaster backup.

Important recovery limit: [Lightsail database snapshots cannot be copied between regions](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-snapshots-in-amazon-lightsail.html). Proposed mitigation: scheduled encrypted logical PostgreSQL exports plus independent copies of required private/public assets in an owner-approved second region; retain deploy artifacts and recovery configuration outside the VM. Prove restoration into a fresh database. Daily exports imply potentially roughly one day's regional data loss, plus export/replication lag; they do not meet RPO five minutes. Backup failures must alert. Recovery also needs payment-provider reconciliation and deletion-tombstone replay.

## Candidate B: Render Singapore

Render offers Singapore but currently lists no India region. Its [region documentation](https://render.com/docs/regions) also says services cannot change region in place. This changes data location and requires owner acceptance.

Illustrative separate-service layout: Next.js 2GB web $25 + NestJS 2GB API $25 + 512MB worker $7 + 1GB PostgreSQL $19 + Pro workspace $25 = **$101/month**, before expandable DB storage, object storage, backups, tax and overages. A smaller worker/database needs memory and connection-limit testing. [Official Render pricing](https://render.com/pricing) lists these tiers, DB storage at $0.30/GB and Pro's 25GB included outbound bandwidth. Hobby removes the $25 workspace charge but has a shorter PITR window and fewer operational controls; it is not used in this production-oriented comparison. Object storage remains a separately priced service; this subtotal is not a complete quote.

Render reduces VM patching and deployment work. Use same-region internal database connections, require internal TLS, and explicitly disable public DB access; by default external DB access permits any IP with valid credentials. Database and backups have at-rest encryption. See [database connections/security](https://render.com/docs/postgresql-creating-connecting). Paid Postgres has continuous PITR: three days on Hobby, seven on Pro; logical exports are retained seven days, with independent retention requiring downloaded/copied exports. See [recovery documentation](https://render.com/docs/postgresql-backups).

The $19 DB has less than one CPU and does not qualify for HA. [HA prerequisites](https://render.com/docs/postgresql-high-availability) require at least one CPU; standby compute/storage is billed again. Replication is asynchronous and recent writes can be lost on failover. A 2GB $40 primary plus $40 standby would bring this same Pro service layout to **$162** before storage/extras. Neither option automatically establishes regional recovery objectives.

## Budget and reliability decision

Recommendation for discussion: the $57 Mumbai fixed baseline leaves more room for backups, monitoring, transactional email, a domain, tax and overruns than separate managed Render services. It also makes the owner responsible for VM patching, secure deployment and app recovery. Single application VM and standard single-primary DB mean outages require restart/restore; HA DB alone leaves the application VM as a failure point.

No live USD/INR conversion was verified. For arithmetic only, at an illustrative planning rate of INR100/USD, fixed baselines would be INR5,700 (AWS standard), INR8,700 (AWS HA DB), and INR10,100 (Render Pro). This is **not an exchange-rate quote**. Confirm actual billing currency, tax and all ancillary services before asserting compliance with INR10,000. A second always-running app VM, load balancer, separate staging and regional standby are not included.

The blueprint's 99.9% API availability, zero acknowledged-write loss on tested AZ failure, regional RPO <=5 minutes and RTO <=60 minutes remain **unverified and unpromised**. Five-minute PITR selection does not establish regional RPO; a new-database restore does not establish RTO. Neither deployment has application/load/failover/restore evidence. Choose a pilot outage/loss allowance, then measure backup age, complete recovery time, billing reconciliation and actual workload before launch. If the original strict objectives are mandatory, expand infrastructure research and budget rather than claim these configurations satisfy them.
