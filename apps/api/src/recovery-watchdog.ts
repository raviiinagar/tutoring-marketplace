type Snapshot = { id: string; snapshot_at: string; verified_at: string };
export async function inspectIndependentHealth(
  input: { store: { latestBackup(): Promise<Snapshot> }; origin: string },
  at = new Date(),
  request: typeof fetch = fetch,
) {
  if (new URL(input.origin).protocol !== "https:")
    throw new Error("WATCHDOG_HTTPS_REQUIRED");
  const conditions: string[] = [];
  let age: number | null = null;
  try {
    const backup = await input.store.latestBackup(),
      snapshot = Date.parse(backup.snapshot_at),
      verified = Date.parse(backup.verified_at);
    age = Math.floor((at.getTime() - snapshot) / 1000);
    if (
      !Number.isFinite(age) ||
      !Number.isFinite(verified) ||
      age < -300 ||
      verified < snapshot ||
      verified > at.getTime() + 300000
    )
      conditions.push("BACKUP_RECEIPT_INVALID");
    else if (age > 18 * 3600) conditions.push("BACKUP_STALE");
  } catch {
    conditions.push("BACKUP_UNAVAILABLE");
  }
  try {
    const response = await request(new URL("/v1/health", input.origin), {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (
      !response.ok ||
      ((await response.json()) as { status?: string }).status !== "ok"
    )
      conditions.push("HTTPS_UNAVAILABLE");
    const ui = await request(new URL("/", input.origin), {
      method: "HEAD",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!ui.ok && !conditions.includes("HTTPS_UNAVAILABLE"))
      conditions.push("HTTPS_UNAVAILABLE");
  } catch {
    conditions.push("HTTPS_UNAVAILABLE");
  }
  return {
    healthy: conditions.length === 0,
    conditions,
    snapshot_age_seconds: age,
    observed_at: at.toISOString(),
  };
}
