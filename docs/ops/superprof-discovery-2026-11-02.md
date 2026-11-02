# Saved Tutors and discovery tools deployment - 2 November 2026

The owner requested REA-based Superprof comparison and implementation of useful missing features. See [comparison evidence and limitations](../research/superprof-feature-comparison-2026-11-02.md), [feature spec](../../.scratch/superprof-discovery/spec.md) and [API contract](../api/saved-tutors-and-discovery-tools.md). This batch adds private account shortlists, profile sharing, exact free-introductory-class filtering and unit-safe price ordering. It does not claim complete Superprof parity or authenticated competitor inspection.

## Verified release

- Backend `discovery-20261102-ca16ae99b8db`, source `ca16ae99b8db6a4740efc8515ac35a8bbccff273`; artifact SHA256 `f2a8c719aee941b36d4bfb86dd1c8e3eae4a7f1f0b35f7964d5acfdadc03ef81`.
- Fifteen allowlisted compiled/migration files overlay verified Linux base `location-20261101-b81e1353865e`. The candidate manifest verified 452 files; no Windows dependencies were copied. Existing lockfile/dependencies remain unchanged.
- Migration035 adds `saved_tutors` references/timestamps only. Both environments verified 35 migrations. Main and sandbox app roles received CRUD on the new table; the main backup role received SELECT.
- Sandbox frontend: `624c7a6255f820a9ddcb53f3138cb6de869e46b4`, ready Netlify deploy `6ae8643d998114828109f6fb`.
- Main frontend: `d1108f6ee891b1df0f58d122755ae66ec2cbb12d`, ready deploy `6ae864d2859a3bf6314ad8b5`. Existing same-origin proxies, sandbox API prefix, fictional-account notice and Lovable portrait/yellow design were preserved.

Sandbox deployment preceded main promotion. Fictional existing sandbox accounts and reviewed fictional FREE/NONE offers exercised actual API/UI behavior without real payments, new coupon promises or real identity uploads. Private test state/results and screenshots stay in ignored `.local/razorpay-testing/`; no session or credential is published here.

Main promotion used successful fresh encrypted backups before and after. Runtime verification confirmed both releases, migrations/table privileges, one eligible configured owner per environment, all four API/worker services plus Caddy active, and unchanged testing-MFA and automatic-stop deadlines: **3 November 2026 10:25:48 UTC / 15:55:48 IST**. No new AWS resource, paid-plan change or compute extension occurred. The renewed temporary AWS login restored a reviewed CloudFormation change set modifying only the existing SSH Security Group ingress to the current operator IPv4 /32 with no replacement; template, HTTPS and resource lifecycle were preserved.

## Acceptance

API build, UI production build/typecheck and all 83 UI tests passed. The API batch covered 32 cases across availability alerts, public discovery, privacy and simplified Tutor onboarding. Its initial new Saved Tutors reads caught a read-only transaction conflicting with the authentication row locks; the correction was verified by focused reruns. A new DELETE test was corrected to send JSON as required by existing middleware. All 32 cases have passing acceptance across the batch/focused runs; no production validation or authentication control was weakened.

Coverage includes authenticated ownership/Origin, current public eligibility and both-direction blocks, duplicate saves, concurrent 50-Tutor capacity, removal of unavailable items, export, owned and inbound erasure, exact FREE trials, hourly/per-lesson boundaries, stable tie pagination, mismatched/malformed cursors, cursor-offer disappearance and observed-search propagation. Existing privacy, alert consent, safety and discovery tests passed.

Local fixture browser checks covered navigation/reload, mobile width390, native-share fallback to manual canonical link, anonymous sign-in prompt, URL trial/sort filters and clearing an incompatible rate unit, with no page errors. Hosted sandbox checks used actual APIs to save, reload and remove a shortlist entry; filter the reviewed FREE offer; verify descending same-unit prices; share a canonical public link; and check mobile results/shortlist/profile layout. Main anonymous checks and REA after-capture verify the deployed feature surface without changing any real account. Paid checkout remains disabled pending the existing launch gates.

The first three fixture/browser scripts and package/deployment helpers remain local ignored operator artifacts for reproducibility. Temporary uploaded scripts/archives in `/home/ubuntu` are removed after final validation; protected runtime configs and private backups remain in place. Do not blindly roll back to a pre-035 runtime against the migrated databases; use a compatible forward release or an explicitly planned restore.
