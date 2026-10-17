# 26: Deploy a pilot and demonstrate complete recovery

Status: ready-for-agent
Type: task
Resolution: software implemented; actual deployment and regional acceptance pending
Blocked by: 23 — Export or delete personal data with tracked retention; 25 — Detect critical failures and replay durable work safely

**What to build:** The owner can deploy an isolated staging environment, restore database/assets and perform a compatible application rollback with measured results.

## Acceptance criteria

- [x] Environment isolation, private encrypted database, TLS, secrets, production configuration gates and budgeted infrastructure definitions are reviewable.
- [ ] Independent encrypted exports/assets are retained outside the application failure domain with approved recovery location and backup-age alerts.
- [ ] A fresh-environment restore replays deletion tombstones and reconciles external money before checkout resumes.
- [ ] Demonstrate regional-export data-loss window no greater than 24 hours and complete recovery within four hours; record actual measurements.
- [ ] Rollback preserves compatible financial records; itemised usage/tax/exchange/backup costs fit the ₹10,000 ceiling before any paid provisioning.

## Verification evidence

18 October 2026: software and reviewable deployment bundle implemented; full ticket acceptance is not claimed.

- Added authenticated AES-256-GCM streaming PostgreSQL exports with one shared snapshot, versioned S3 read-back verification, twelve-hour schedule and snapshot-based eighteen-hour freshness monitoring. Private assets remain encrypted database rows and travel in the export.
- Production startup requires private hostname-verifying database TLS, isolated environment/release identity, approved policy/scanning configuration and current independent signed privacy ledger. Every applied migration is verified read-only; staging remains unindexed and live payments are forbidden there.
- Erasure cannot complete until its signed tombstone/index are independently verified. Conditional index publication rejects older writers. Fresh-target restore authenticates before mutation, requires matching engine/environment and empty storage, verifies table fingerprints, revokes restored sessions, reapplies later tombstones and keeps checkout under a separate durable hold. Incomplete or unreconciled recovery cannot publish a falsely fresh backup.
- Finance/MFA release requires fresh provider/month coverage, explicit refund/bank review, processed imported facts and resolved exceptions. Staging may bypass an absent provider only with no financial/provider history; production cannot. Release stays separate from checkout resume. Owned recovery decisions appear in personal-data export without another actor's references or internal fingerprints.
- Read-only rollback checks reject unsupported/unapplied migrations and preserve 59900-paise immutable balanced postings. The CI definition builds off-VM and produces an allowlisted, checksum-verified artifact; no automatic deployment is configured.
- Verification: 48 relevant API regression scenarios, all 37 UI tests and the desktop/mobile operations browser journey passed. Expanded Finance/privacy, isolated-staging/orphan-provider and critical-worker health cases passed separately; all eight PG16 recovery/storage/watchdog/operator cases passed. Full build/typecheck passed; final API rebuild/artifact verification recorded after the last changes. CloudFormation passed cfn-lint; Caddy 2.11.7 configuration validation passed. These are local checks, not a successful hosted CI/deployment claim.
- The recorded fresh-cluster fictional drill completed its measured recovery portion in 27190 ms, with 4473 ms inside the restore command; 98 table fingerprints (including a fictional asset fixture), original portrait decryption, post-snapshot deletion replay, old-session denial and immutable financial values were checked. Read [the committed local evidence](../../../docs/ops/evidence/task26-local-recovery.json). No real AWS storage, bank/provider reconciliation, DNS, infrastructure creation or regional RPO/RTO was measured.
- Owner migration 028 preserves all 28 users, zero purchases/captures and every existing checksum. All 27 legacy recorded checksums match LF/CRLF equivalents; migrations 001-027 were not modified. No live domain, email, owner account or paid resource was provisioned.

Follow [the runbook](../../../docs/ops/pilot-deployment-recovery.md) and [primary-source research](../../../docs/research/pilot-deployment-recovery.md). Remaining acceptance: actual account/credentials/domain and owner routing; approved independent region/key recovery; current itemised usage, rehearsal, billing FX/tax/fees below INR10,000; staging and independent monitor/storage provisioning; actual provider/bank review, compatible deployed rollback and full regional <=24-hour loss/<=4-hour recovery measurement. The sample budget deliberately exits INCOMPLETE while factual inputs are missing. Keep the four execution/measurement criteria unchecked until that evidence exists.

## Comments



Task 23 handoff (17 October 2026): privacy recovery operator commands and signed ledger/index validation are implemented in `apps/api/src/privacy-operator.ts`; follow `docs/api/privacy.md`. Provision independent durable ledger storage/key recovery, validate it at startup, drain pending erasure before planned checkpoints, and reapply deletion before enabling traffic. Local reapplication tests do not establish production RPO/RTO or regional durability.

The current migration verifier hashes raw SQL bytes. Inspection found mixed LF/CRLF working files (015, 016, 021 and 023 use CRLF). The fresh-environment restore drill must verify cross-host/Git line-ending compatibility against stored checksums without rewriting applied migrations. Preserve exact applied bytes or implement an explicitly backward-compatible checksum strategy with evidence; do not silently replace recorded checksums.

Task 25 handoff (17 October 2026): scoped operations, durable redacted alert episodes, worker heartbeats/checkpoint, expiring health observations and a revisioned checkout pause are implemented; see `docs/api/operations.md`. Configure an actual verified owner and independently budgeted alert delivery. Connect verified backup/provider evidence automation and an external watchdog outside the application/database failure domain; operator observations alone do not prove successful backups or detect total infrastructure failure. Restore must preserve immutable command/money history and keep checkout paused until tombstones and external reconciliation are applied. Migrations through 027 are applied locally and must retain their bytes; demonstrate cross-host checksum compatibility as already required by the privacy handoff.


Hosted CI follow-up: the first fresh Linux run correctly exposed that root typecheck consumed the contracts package before its declarations existed. Root `npm run typecheck` now builds contracts first. Verification moved the existing generated contracts output to a checked workspace-local backup and reran typecheck successfully from that cold state; no source or owner data was removed. The updated hosted run must finish before selecting a Linux deployment artifact.
