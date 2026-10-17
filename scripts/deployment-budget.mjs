import { readFile } from "node:fs/promises";
const file = process.argv[2];
try {
  if (!file || process.argv.length !== 3)
    throw new Error(
      "Usage: node scripts/deployment-budget.mjs <reviewed-budget.json>",
    );
  const input = JSON.parse(await readFile(file, "utf8"));
  const finite = (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;
  const missing = Object.entries(input.monthly_usd || {})
    .filter(([, value]) => !finite(value))
    .map(([key]) => "monthly_usd." + key);
  for (const key of [
    "effective_billing_inr_per_usd",
    "applicable_tax_fraction",
    "inr_billing_fees",
  ])
    if (!finite(input[key])) missing.push(key);
  if (!input.price_evidence_reference) missing.push("price_evidence_reference");
  if (
    finite(input.effective_billing_inr_per_usd) &&
    input.effective_billing_inr_per_usd === 0
  )
    throw new Error("Billing exchange rate must be positive.");
  if (
    finite(input.applicable_tax_fraction) &&
    input.applicable_tax_fraction > 1
  )
    throw new Error("Enter applicable tax as a fraction from zero to one.");
  if (input.recovery_region_approved !== true)
    missing.push("recovery_region_approved");
  if (
    !finite(input.ceiling_inr) ||
    input.ceiling_inr > 10000 ||
    input.ceiling_inr === 0
  )
    throw new Error(
      "Budget ceiling must be positive and no greater than INR 10000.",
    );
  if (!Object.keys(input.monthly_usd || {}).length)
    throw new Error("Itemised monthly costs are required.");
  const known = Object.values(input.monthly_usd)
    .filter(finite)
    .reduce((sum, value) => sum + value, 0);
  if (missing.length) {
    console.log(
      JSON.stringify(
        {
          state: "INCOMPLETE",
          known_monthly_usd: known,
          missing,
          paid_provisioning_approved: false,
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  } else {
    const inr =
      known *
        input.effective_billing_inr_per_usd *
        (1 + input.applicable_tax_fraction) +
      input.inr_billing_fees;
    const within = inr <= input.ceiling_inr;
    console.log(
      JSON.stringify(
        {
          state: within ? "WITHIN_REVIEWED_INPUTS" : "OVER_CEILING",
          monthly_usd: known,
          monthly_inr: Math.round(inr * 100) / 100,
          ceiling_inr: input.ceiling_inr,
          paid_provisioning_approved: false,
        },
        null,
        2,
      ),
    );
    if (!within) process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
