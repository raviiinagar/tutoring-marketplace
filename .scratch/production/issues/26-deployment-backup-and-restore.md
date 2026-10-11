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


