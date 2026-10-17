import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  describeFailure,
  type OperationJob,
  type OperationObservation,
  type OperationsReport,
  type OperationsScope,
  type StaffAccess,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/account/ui";
const labels: Record<string, string> = {
  UNKNOWN_PAYMENTS: "Unknown payment outcomes",
  CAPTURE_WITHOUT_ACTIVATION: "Captured payments without timely activation",
  REFUND_FAILURES: "Refund failures or insufficient reserve",
  RECONCILIATION_EXCEPTIONS: "Unresolved financial exceptions",
  PAYMENT_QUEUE_AGE: "Payment inbox backlog",
  REFUND_QUEUE_AGE: "Refund backlog",
  RECONCILIATION_QUEUE_AGE: "Reconciliation work needs attention",
  PAYMENT_REPEATED_ERRORS: "Repeated payment verification errors",
  NOTIFICATION_QUEUE_AGE: "Notification backlog",
  NOTIFICATION_ERRORS: "Notification delivery failures",
  AUTH_MAIL_FAILURES: "Account email delivery failures",
  WORKER_ERRORS: "Repeated worker failures",
  WORKER_STALE: "Worker heartbeat is stale",
  SECURITY_RECOVERY: "Staff authenticator recovery needs inspection",
  WEBHOOK_UNHEALTHY: "Webhook delivery is unverified or unhealthy",
  BACKUP_UNHEALTHY: "Backup evidence is unverified or unhealthy",
  SECURITY_OBSERVATION: "Security condition needs inspection",
};
const time = (s: string) => new Date(s).toLocaleString();
export function OperationsDesk() {
  const [access, setAccess] = useState<StaffAccess>(),
    [scope, setScope] = useState<OperationsScope>("FINANCE"),
    [reason, setReason] = useState(""),
    [report, setReport] = useState<OperationsReport>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [message, setMessage] = useState<string>();
  const [kind, setKind] = useState<OperationObservation["kind"]>("BACKUP"),
    [healthy, setHealthy] = useState(false),
    [evidence, setEvidence] = useState("");
  const [reconciliationIds, setReconciliationIds] = useState(""),
    [recoveryEvidence, setRecoveryEvidence] = useState(""),
    [reviewedMoney, setReviewedMoney] = useState(false),
    [moneyCheckedThrough, setMoneyCheckedThrough] = useState("");
  const keys = useRef(new Map<string, string>()),
    generation = useRef(0);
  const stableKey = (shape: string) => {
    if (!keys.current.has(shape)) keys.current.set(shape, crypto.randomUUID());
    return keys.current.get(shape)!;
  };
  useEffect(() => {
    let alive = true;
    void api.staffAccess().then((r) => {
      if (!alive) return;
      if (r.ok) {
        setAccess(r.data);
        setScope(r.data.scopes.includes("FINANCE") ? "FINANCE" : "SUPPORT");
      } else setError(describeFailure(r.error));
    });
    return () => {
      alive = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (!access?.expires_at) return;
    const timer = setTimeout(
      () => {
        generation.current++;
        setAccess(undefined);
        setReport(undefined);
        setError("Verify staff MFA again.");
      },
      Math.max(0, new Date(access.expires_at).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [access?.expires_at]);
  const authorized = !!access?.authenticated && access.scopes.includes(scope),
    valid = authorized && reason.trim().length >= 10;
  const fail = (result: { ok: false; error: Parameters<typeof describeFailure>[0] }) => {
    setError(describeFailure(result.error));
    if (result.error.kind === "http" && [401, 403].includes(result.error.status)) {
      generation.current++;
      setAccess(undefined);
      setReport(undefined);
    }
  };
  const refresh = async () => {
    const version = ++generation.current;
    const r = await api.operations(scope, reason.trim());
    if (version !== generation.current) return;
    if (r.ok) setReport(r.data);
    else {
      setReport(undefined);
      fail(r);
    }
  };
  const inspect = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setReport(undefined);
    setError(undefined);
    setMessage(undefined);
    await refresh();
    setBusy(false);
  };
  const action = async (
    command: () => Promise<
      | { ok: true; data: { correlation_id: string } }
      | { ok: false; error: Parameters<typeof describeFailure>[0] }
    >,
  ) => {
    if (!valid || busy || !report) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const version = generation.current;
    const result = await command();
    if (version === generation.current) {
      if (result.ok) {
        setMessage("Command recorded. Correlation: " + result.data.correlation_id);
        await refresh();
      } else fail(result);
    }
    setBusy(false);
  };
  const checkout = () => {
    if (!report) return;
    const body = {
      revision: report.checkout.revision,
      paused: !report.checkout.paused,
      reason: reason.trim(),
    };
    void action(() =>
      api.controlCheckout({ ...body, request_key: stableKey("checkout:" + JSON.stringify(body)) }),
    );
  };
  const replay = (job: OperationJob) => {
    if (job.kind === "PURCHASE") return;
    const body = { kind: job.kind, id: job.id, reason: reason.trim() };
    void action(() =>
      api.replayOperation({ ...body, request_key: stableKey("replay:" + JSON.stringify(body)) }),
    );
  };
  const observe = (event: FormEvent) => {
    event.preventDefault();
    const body = {
      kind:
        scope === "FINANCE"
          ? ("WEBHOOK_DELIVERY" as const)
          : kind === "WEBHOOK_DELIVERY"
            ? ("BACKUP" as const)
            : kind,
      healthy,
      evidence_reference: evidence.trim(),
      reason: reason.trim(),
    };
    void action(() =>
      api.observeOperation({
        ...body,
        observed_at: new Date().toISOString(),
        request_key: crypto.randomUUID(),
      }),
    );
  };
  const pendingRecovery = report?.recoveries?.find((r) => r.state === "MONEY_REVIEW");
  const recoveryIds = reconciliationIds.split(/[\s,]+/).filter(Boolean);
  const isolatedRecovery = report?.recovery_payment_mode === "DISABLED_ISOLATED";
  const recoveryValid =
    reviewedMoney &&
    Number.isFinite(Date.parse(moneyCheckedThrough)) &&
    /^[A-Za-z0-9][A-Za-z0-9_.:/-]{7,159}$/.test(recoveryEvidence) &&
    (isolatedRecovery ||
      (recoveryIds.length > 0 &&
        recoveryIds.every((id) =>
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id),
        )));
  useEffect(() => {
    setReconciliationIds("");
    setRecoveryEvidence("");
    setReviewedMoney(false);
    setMoneyCheckedThrough("");
  }, [pendingRecovery?.id]);
  const active = report?.alerts.filter((a) => a.status === "OPEN") || [],
    stale =
      !report?.monitor.checked_at ||
      Date.now() - new Date(report.monitor.checked_at).getTime() > 120000;
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-muted-foreground">
        Inspect committed work, current alert conditions and safe recovery commands. Automated
        critical routing runs outside human support hours; this does not promise 24-hour human
        support.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {access && !authorized && (
        <Notice tone="info">
          Support or Finance permission and active staff MFA are required. Verify access in the
          staff console.
        </Notice>
      )}
      <form
        onSubmit={(e) => void inspect(e)}
        className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
      >
        <label className="text-sm">
          Operations area
          <select
            aria-label="Operations area"
            className="input mt-2 w-full"
            value={scope}
            disabled={busy}
            onChange={(e) => {
              generation.current++;
              setScope(e.target.value as OperationsScope);
              setReport(undefined);
              setMessage(undefined);
            }}
          >
            {(["FINANCE", "SUPPORT"] as const)
              .filter((s) => access?.scopes.includes(s))
              .map((s) => (
                <option key={s} value={s}>
                  {s === "FINANCE" ? "Billing and payments" : "Delivery and recovery"}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Reason for operations access
          <textarea
            className="input mt-2 w-full"
            maxLength={240}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Button disabled={!valid || busy} type="submit">
          {busy ? "Checking…" : "Inspect operations"}
        </Button>
      </form>
      {report && (
        <>
          {report.test_only && (
            <Notice tone="info">
              Fictional development/test facts. These are not live payment or recovery evidence.
            </Notice>
          )}
          {report.routing.email === "CONFIG_REQUIRED" && (
            <Notice tone="error">
              Owner email routing needs configuration. Assign a verified operations owner with this
              staff scope before relying on critical alerts.
            </Notice>
          )}
          {stale && (
            <Notice tone="error">
              The monitor has no recent completed scan. Check the worker and external watchdog; this
              view cannot certify current health.
            </Notice>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border p-5">
              <p className="text-sm text-muted-foreground">Active conditions</p>
              <p className="mt-2 text-3xl font-semibold">{active.length}</p>
            </div>
            <div className="rounded-2xl border p-5">
              <p className="text-sm text-muted-foreground">New checkout</p>
              <p className="mt-2 text-xl font-semibold">
                {report.checkout.paused ? "Paused" : "Not paused"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Provider configuration and eligibility still apply.
              </p>
            </div>
            <div className="rounded-2xl border p-5">
              <p className="text-sm text-muted-foreground">Last completed scan</p>
              <p className="mt-2 text-sm">
                {report.monitor.checked_at ? time(report.monitor.checked_at) : "No scan recorded"}
              </p>
            </div>
          </div>
          {scope === "FINANCE" && (
            <section className="space-y-3 rounded-2xl border p-5">
              <h2 className="text-xl font-semibold">Checkout control</h2>
              <p className="text-sm text-muted-foreground">
                Pause new purchases and checkout launches during unsafe billing conditions.
                Verification, refunds and existing records remain available. An already opened
                provider window cannot be recalled.
              </p>
              <Button
                type="button"
                disabled={busy || !valid || (!!pendingRecovery && report.checkout.paused)}
                onClick={checkout}
              >
                {report.checkout.paused ? "Resume new checkout" : "Pause new checkout"}
              </Button>
            </section>
          )}
          {scope === "FINANCE" && pendingRecovery && (
            <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <h2 className="text-xl font-semibold">Recovery review</h2>
              <p className="text-sm text-muted-foreground">
                Checkout stays blocked until privacy is reapplied and Finance reviews external
                money. Complete full-month provider reconciliation from{" "}
                {time(pendingRecovery.source_snapshot_at)} through the current review, including
                refunds and bank evidence.
              </p>
              <p className="text-sm">
                Privacy replay: {pendingRecovery.privacy_reapplied_at ? "Recorded" : "Required"}
              </p>
              {isolatedRecovery ? (
                <p className="text-sm">
                  Payments are disabled in this isolated staging environment. The server requires no
                  purchases or financial history before release.
                </p>
              ) : (
                <label className="block space-y-2">
                  <span>Completed reconciliation IDs</span>
                  <Textarea
                    className="w-full rounded-xl border bg-background p-3"
                    value={reconciliationIds}
                    onChange={(e) => setReconciliationIds(e.target.value)}
                    placeholder="Comma-separated reconciliation IDs"
                  />
                </label>
              )}
              <label className="block space-y-2">
                <span>Money checked through (your local time)</span>
                <Input
                  type="datetime-local"
                  aria-describedby="recovery-cutoff-hint"
                  className="w-full rounded-xl border bg-background p-3"
                  value={moneyCheckedThrough}
                  onChange={(e) => setMoneyCheckedThrough(e.target.value)}
                />
              </label>
              <p id="recovery-cutoff-hint" className="text-xs text-muted-foreground">
                Use the verified cutoff covered by all completed reconciliation runs, within the
                last 15 minutes.
              </p>
              <label className="block space-y-2">
                <span>Recovery evidence reference</span>
                <Input
                  className="w-full rounded-xl border bg-background p-3"
                  value={recoveryEvidence}
                  onChange={(e) => setRecoveryEvidence(e.target.value)}
                  placeholder="Private review reference, without bank or personal details"
                />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={reviewedMoney}
                  onChange={(e) => setReviewedMoney(e.target.checked)}
                />
                <span>
                  I checked provider payments, refunds and bank evidence for this recovery.
                </span>
              </label>
              <Button
                type="button"
                disabled={busy || !valid || !recoveryValid || !pendingRecovery.privacy_reapplied_at}
                onClick={() =>
                  void action(() =>
                    api.releaseRecovery({
                      recovery_id: pendingRecovery.id,
                      reconciliation_ids: recoveryIds,
                      evidence_reference: recoveryEvidence.trim(),
                      checked_through: new Date(moneyCheckedThrough).toISOString(),
                      provider_checked: true,
                      refunds_checked: true,
                      bank_checked: true,
                      reason: reason.trim(),
                    }),
                  )
                }
              >
                Record recovery review
              </Button>
              <p className="text-xs text-muted-foreground">
                The server checks fresh reconciliation and unresolved exceptions. Recording this
                review leaves checkout paused for a separate deliberate resume.
              </p>
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Active alert conditions</h2>
            {!active.length && (
              <p className="text-muted-foreground">
                No active conditions in the last completed scan.
              </p>
            )}
            {active.map((a) => (
              <article key={a.id} className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-semibold">{labels[a.code] || a.code.replaceAll("_", " ")}</h3>
                  <span className="rounded-full bg-background px-3 py-1 text-sm">
                    {a.count} affected
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  First observed {time(a.opened_at)}
                </p>
                <p className="mt-2 break-all text-xs">Alert reference: {a.id}</p>
              </article>
            ))}
          </section>
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Durable work and dead letters</h2>
            <p className="text-sm text-muted-foreground">
              Up to {report.job_limit} unfinished jobs, prioritising review and failure. Replay
              schedules the same logical operation; it does not create a replacement charge. Unknown
              SMS outcomes need provider confirmation.
            </p>
            {!report.jobs.length && <p>No unfinished work in this area.</p>}
            <div className="grid gap-4 lg:grid-cols-2">
              {report.jobs.map((job) => (
                <article key={job.kind + job.id} className="min-w-0 rounded-2xl border p-5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="font-semibold">{job.kind.replaceAll("_", " ")}</h3>
                    <span className="text-sm">{job.status}</span>
                  </div>
                  <p className="mt-2 break-all text-xs text-muted-foreground">{job.id}</p>
                  <p className="my-3 text-sm">
                    {job.attempts} attempts · queued {time(job.created_at)}
                  </p>
                  {job.recovery === "REPLAY" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!valid || busy}
                      onClick={() => replay(job)}
                    >
                      Replay original operation
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {job.recovery === "WAIT"
                        ? "Current processing lease or scheduled worker must finish."
                        : job.recovery === "EXPIRED"
                          ? "Expired. Request a fresh verification."
                          : job.recovery === "RECONCILE_PROVIDER"
                            ? "Confirm the original SMS provider result in notification delivery."
                            : "Review original provider evidence in Finance reconciliation."}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="space-y-4 rounded-2xl border p-5">
            <h2 className="text-xl font-semibold">Verified health evidence</h2>
            <p className="text-sm text-muted-foreground">
              Record an observation after checking the provider or recovery evidence.
              Webhook/security evidence expires after 15 minutes; backup evidence after 24 hours.
              This does not run a backup or verify an external dashboard automatically.
            </p>
            {report.observations.map((o) => (
              <p key={o.kind} className="text-sm">
                <strong>{o.kind.replaceAll("_", " ")}:</strong>{" "}
                {o.stale ? "Stale" : o.healthy ? "Reported healthy" : "Reported unhealthy"} ·
                expires {time(o.valid_until)}
              </p>
            ))}
            <form onSubmit={observe} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Evidence type
                <select
                  className="input mt-2 w-full"
                  value={
                    scope === "FINANCE"
                      ? "WEBHOOK_DELIVERY"
                      : kind === "WEBHOOK_DELIVERY"
                        ? "BACKUP"
                        : kind
                  }
                  onChange={(e) => setKind(e.target.value as OperationObservation["kind"])}
                >
                  {(scope === "FINANCE" ? ["WEBHOOK_DELIVERY"] : ["BACKUP", "SECURITY"]).map(
                    (k) => (
                      <option key={k} value={k}>
                        {k.replaceAll("_", " ")}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="text-sm">
                Observed status
                <select
                  className="input mt-2 w-full"
                  value={String(healthy)}
                  onChange={(e) => setHealthy(e.target.value === "true")}
                >
                  <option value="false">Unhealthy / disabled</option>
                  <option value="true">Healthy — checked with evidence</option>
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                Evidence reference
                <input
                  className="input mt-2 w-full"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  minLength={8}
                  maxLength={160}
                  placeholder="Case, backup or provider-check reference"
                />
              </label>
              <Button
                className="sm:col-span-2 sm:justify-self-start"
                type="submit"
                disabled={!valid || busy || evidence.trim().length < 8}
              >
                Record verified observation
              </Button>
            </form>
          </section>
          {!!report.replays?.length && (
            <details className="rounded-2xl border p-5">
              <summary className="cursor-pointer font-semibold">Recent recovery commands</summary>
              <ul className="mt-4 space-y-3">
                {report.replays.map((r) => (
                  <li key={r.correlation_id} className="break-all text-sm">
                    {r.kind} · {r.status}
                    <p className="text-xs text-muted-foreground">Correlation: {r.correlation_id}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-muted-foreground">
            Inspected {time(report.as_of)}. Alerts resolve when observed conditions recover. A
            healthy observation does not clear unrelated financial facts.
          </p>
        </>
      )}
    </div>
  );
}
