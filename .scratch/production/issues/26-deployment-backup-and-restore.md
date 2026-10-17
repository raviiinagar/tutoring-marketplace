# 26: Deploy a pilot and demonstrate complete recovery

Status: ready-for-agent
Type: task
Blocked by: 23 — Export or delete personal data with tracked retention; 25 — Detect critical failures and replay durable work safely

**What to build:** The owner can deploy an isolated staging environment, restore database/assets and perform a compatible application rollback with measured results.

## Acceptance criteria

- [ ] Environment isolation, private encrypted database, TLS, secrets, production configuration gates and budgeted infrastructure definitions are reviewable.
- [ ] Independent encrypted exports/assets are retained outside the application failure domain with approved recovery location and backup-age alerts.
- [ ] A fresh-environment restore replays deletion tombstones and reconciles external money before checkout resumes.
- [ ] Demonstrate regional-export data-loss window no greater than 24 hours and complete recovery within four hours; record actual measurements.
- [ ] Rollback preserves compatible financial records; itemised usage/tax/exchange/backup costs fit the ₹10,000 ceiling before any paid provisioning.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments



Task 23 handoff (17 October 2026): privacy recovery operator commands and signed ledger/index validation are implemented in `apps/api/src/privacy-operator.ts`; follow `docs/api/privacy.md`. Provision independent durable ledger storage/key recovery, validate it at startup, drain pending erasure before planned checkpoints, and reapply deletion before enabling traffic. Local reapplication tests do not establish production RPO/RTO or regional durability.

The current migration verifier hashes raw SQL bytes. Inspection found mixed LF/CRLF working files (015, 016, 021 and 023 use CRLF). The fresh-environment restore drill must verify cross-host/Git line-ending compatibility against stored checksums without rewriting applied migrations. Preserve exact applied bytes or implement an explicitly backward-compatible checksum strategy with evidence; do not silently replace recorded checksums.
