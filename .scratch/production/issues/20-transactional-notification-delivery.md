# 20: Deliver transactional notifications with preferences

Status: ready-for-agent
Type: task
Blocked by: 09 — Subscribe to availability in an empty category; 12 — Send durable text messages and recover after reconnect; 17 — Cancel unactivated purchases and refund unmatched payments

**What to build:** Users receive verified service email and configured critical SMS, while preferences, availability consent and durable retry preserve reliable delivery.

## Acceptance criteria

- [ ] Committed requests, messages, access and refund events enqueue durable minimal notification payloads.
- [ ] Template versions and preferences distinguish mandatory service messages, optional availability notices and marketing.
- [ ] Delivery attempts deduplicate logically, retry failures and display operator-visible pending/failed states.
- [ ] Notifications avoid sensitive child details, message bodies and private evidence; provider keys stay server-side.
- [ ] Tests simulate provider outages, duplicate events, unsubscribe and preference changes; production cannot use a fake sender.

## Verification evidence

Record the implemented behaviour, meaningful checks run, results and remaining external dependencies here before marking work complete.

## Comments


