# Publish ads without mandatory staff approval

Status: ready-for-agent
Type: task

Implement [the direct-ad spec](../spec.md) and [ADR0014](../../../docs/adr/0014-free-direct-ad-publication-and-optional-identity.md). Preserve existing data, financial history, blocks and staff restrictions. Record evidence and remaining reference limits; do not equate an online ad with verified identity or expertise.

## Comments

5 November 2026: implemented and deployed. The [acceptance report](../../../docs/research/superprof-direct-ads-2026-11-05.md) links REA evidence, final desktop/mobile screenshots and real-backend journey results. Fifteen backend and 49 targeted UI tests passed; API/UI builds and typechecks passed. Both backends run migration038 and preserved all application-table row counts; Cloudflare version `99aaedb6-25f0-4a7f-9f20-9fa1dcbbe79a` passed hosted checks. [Deployment evidence](../../../docs/ops/direct-tutor-ads-2026-11-05.md). Higher badge criteria remain conservative; no fabricated approvals or awards. Legacy tests asserting the replaced mandatory identity/Pro/review policy are not represented as a passing full suite.
