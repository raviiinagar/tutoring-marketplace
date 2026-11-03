# Adapt public Tutor and teaching-offer profiles

Status: ready-for-agent
Type: task

## Acceptance

- Capture requested-site evidence with honest REA/fallback attribution and limitations.
- Share a responsive branded profile shell across introduction and offer pages.
- Preserve real rates, tuition units, trial terms, privacy labels, save/share and enquiry controls.
- Validate current data, errors, no offers, portrait fallback and desktop/mobile navigation.
- Typecheck, relevant tests, Cloudflare build/deploy and sanitized acceptance evidence.

## Comments

3 November 2026: implementation deployed to the existing Cloudflare frontend, Worker version `9536f947-ef66-4cb5-91c3-534c48121914`. REA profile capture and honest fallback attribution, adaptation map, screenshots and acceptance are in [the research report](../../../docs/research/superprof-tutor-profile-2026-11-03.md). Typecheck/build, 16 focused tests, desktop/390px/320px controlled browser checks and a live existing-data portrait/profile check passed. No backend schema or commercial rules changed. No remaining implementation work for this UI ticket; main live offer availability is an existing data constraint, with offer view coverage supplied by controlled fixtures.
