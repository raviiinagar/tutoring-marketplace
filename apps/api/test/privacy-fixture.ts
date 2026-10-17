// Simulates approvals ONLY for production configuration contract tests. Never a live policy.
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
export function productionPrivacyFixture() {
  const rule = {
    days: 1,
    purpose: "Fictional retention for isolated configuration tests only.",
  };
  return {
    PRIVACY_RETENTION_POLICY: JSON.stringify({
      id: "simulated-config-policy-v1",
      test_only: false,
      approved_by: "SIMULATED TEST HARNESS",
      approval_reference: "SIMULATED-NOT-A-LIVE-APPROVAL",
      classes: {
        ACCOUNT: rule,
        PHOTO: rule,
        EVIDENCE: rule,
        SAFETY: rule,
        SUPPORT: rule,
        FINANCE: rule,
      },
    }),
    PRIVACY_TOMBSTONE_DIR: resolve(
      ".local/tests/privacy-production-" + randomUUID(),
    ),
    PRIVACY_POLICY_APPROVED: "true",
    PRIVACY_LEDGER_DURABILITY_CONFIRMED: "true",
  };
}
