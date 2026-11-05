# P1: Rebase old workflow fixtures and E2E expectations

Status: needs-triage
Type: task

The full backend suite has 104 passing and 131 failing cases. 122 failures stop in old publication setup; 7 assume identity approval automatically publishes a profile. One rollback case hard-codes28 migrations instead of 38. One isolated recovery tool path failed but its actual PG16 encrypted export/restore scenario passed after supplying the installed tool directory. The existing browser suite has 3 passes, 15 failures and 1 skipped case; 14 failures are outdated selectors/navigation/network expectations and 1 exposes the real accessibility issue.

Evidence: [backend](../../../docs/qa/evidence/2026-11-05/backend-results.json), [browser](../../../docs/qa/evidence/2026-11-05/browser-suite-results.json).

Suggested acceptance: create valid current adult Tutor introductions, use explicit direct PUBLISH and current title/class word minima, update UI selectors to actual labels and observed-search POST, and derive migration counts from the manifest. Preserve independent access, financial, privacy and scope assertions; re-run the full suite and investigate newly reached failures. Do not bulk-replace expected statuses to force green. Paid/refund/concurrency cases blocked by setup must be revalidated before production sign-off.
