import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import {
  api,
  describeFailure,
  type ApiFailure,
  type PrivacyState,
  type PrivacyKind,
  type PrivacyQueue,
  type StaffAccess,
  type StaffScope,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice, useSingleFlight } from "@/components/account/ui";

const control = "input mt-2 w-full";
const date = (value: string) => new Date(value).toLocaleString("en-IN");
export function PrivacyDesk({ onDeleted }: { onDeleted?: () => void }) {
  const [state, setState] = useState<PrivacyState>(),
    [profiles, setProfiles] = useState<{ id: string; alias: string }[]>([]),
    [error, setError] = useState<string>(),
    [message, setMessage] = useState("");
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [child, setChild] = useState("");
  const { loading, run } = useSingleFlight(),
    key = useRef<{ action: string; value: string } | undefined>(undefined);
  const load = useCallback(async () => {
    const result = await api.privacyState();
    if (result.ok) {
      setState(result.data);
      setProfiles(result.data.authenticated ? result.data.child_profiles || [] : []);
    } else {
      setState(undefined);
      setProfiles([]);
      setError(describeFailure(result.error));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const fail = async (e: ApiFailure) => {
    setError(describeFailure(e));
    if (e.kind === "http" && e.status === 401) {
      setPassword("");
      await load();
    }
  };
  const request = (kind: PrivacyKind) =>
    run(async () => {
      setError(undefined);
      setMessage("");
      if (
        !password ||
        (kind === "DELETE" && confirmation !== "DELETE MY ACCOUNT") ||
        (kind === "WITHDRAW" && !child)
      )
        return;
      const verified = await api.verifyPrivacy(password, kind);
      setPassword("");
      if (!verified.ok) {
        await fail(verified.error);
        return;
      }
      const action = kind + ":" + (kind === "WITHDRAW" ? child : "");
      if (key.current?.action !== action) key.current = { action, value: crypto.randomUUID() };
      const result = await api.requestPrivacy({
        request_key: key.current.value,
        kind,
        verification: verified.data.proof,
        ...(kind === "WITHDRAW" ? { profile_id: child } : {}),
        ...(kind === "DELETE" ? { confirmation: "DELETE MY ACCOUNT" as const } : {}),
      });
      if (result.ok) {
        key.current = undefined;
        setConfirmation("");
        setMessage("Request received. Refresh below to follow its progress.");
        if (kind === "DELETE") onDeleted?.();
        await load();
      } else await fail(result.error);
    });
  const download = (id: string) =>
    run(async () => {
      setError(undefined);
      setMessage("");
      const verified = await api.verifyPrivacy(password, "DOWNLOAD");
      setPassword("");
      if (!verified.ok) {
        await fail(verified.error);
        return;
      }
      const result = await api.downloadPrivacy(id, verified.data.proof);
      if (!result.ok) {
        await fail(result.error);
        return;
      }
      const url = URL.createObjectURL(result.data),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "personal-data.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Export downloaded. Store this file privately.");
    });
  const refresh = () =>
    run(async () => {
      setError(undefined);
      await load();
    });
  return (
    <div className="space-y-6">
      <aside className="flex gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-5 text-sm leading-relaxed">
        <ShieldCheck className="mt-1 size-5 shrink-0 text-primary" />
        <p>
          Control your data. Exports include your contributed records and clean Tutor photo assets.
          Downloads expire after 24 hours and require your current password. Deletion stops new
          account activity; retained records keep their approved purpose and access restrictions.
        </p>
      </aside>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {!state && !error && !message && <p role="status">Loading privacy requests...</p>}
      {state && (
        <>
          {!state.authenticated && <Notice tone="info">Read-only request tracking</Notice>}
          {state.authenticated && (
            <>
              {!state.policy.deletion_enabled && (
                <Notice tone="info">
                  Retention policy approval is pending. Export is available.
                </Notice>
              )}
              {state.policy.retention_policy?.test_only && (
                <Notice tone="info">
                  Fictional testing policy. Use test accounts and fictional documents only.
                </Notice>
              )}
              <label className="block text-sm font-medium">
                Current password
                <input
                  aria-label="Current password"
                  className={control}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={128}
                />
                <span className="mt-2 block text-xs font-normal text-muted-foreground">
                  Verify each action. Your password is cleared after verification.
                </span>
              </label>
              <section className="space-y-3 rounded-2xl border p-5">
                <div className="flex items-center gap-2">
                  <Download className="size-5 text-primary" />
                  <h2 className="font-semibold">Get a copy of your data</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Request an export, then refresh its status. Enter your password again when the
                  download is ready. Other people's private messages and staff notes are excluded.
                </p>
                <Button
                  disabled={loading || !password || !state.policy.exports_enabled}
                  onClick={() => void request("EXPORT")}
                >
                  Request data export
                </Button>
              </section>
              {profiles.length > 0 && (
                <section className="space-y-3 rounded-2xl border p-5">
                  <h2 className="font-semibold">Withdraw child Learner consent</h2>
                  <p className="text-sm text-muted-foreground">
                    Stops the selected Learner's existing enquiries and chat access and erases the
                    old learning context under the configured policy. Your adult account and other
                    Learners remain available. A later consent starts fresh.
                  </p>
                  <label className="block text-sm">
                    Child Learner
                    <select
                      value={child}
                      onChange={(e) => {
                        setChild(e.target.value);
                        key.current = undefined;
                      }}
                      className={control}
                    >
                      <option value="">Choose a child Learner</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.alias}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="outline"
                    disabled={loading || !password || !child || !state.policy.withdrawal_enabled}
                    onClick={() => void request("WITHDRAW")}
                  >
                    Withdraw selected consent
                  </Button>
                </section>
              )}
              <section className="space-y-4 rounded-2xl border border-destructive/25 p-5">
                <div className="flex items-center gap-2">
                  <Trash2 className="size-5 text-destructive" />
                  <h2 className="font-semibold">Delete your account</h2>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This signs out every session, removes public Tutor content and stops Learner
                  activity. Payment, refund and safety obligations continue where required. Keep
                  this browser to track completion for 30 days. Export your data first if you need a
                  copy.
                </p>
                <label className="block text-sm font-medium">
                  Type DELETE MY ACCOUNT
                  <input
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                    className={control}
                  />
                </label>
                <Button
                  variant="destructive"
                  disabled={
                    loading ||
                    !password ||
                    confirmation !== "DELETE MY ACCOUNT" ||
                    !state.policy.deletion_enabled
                  }
                  onClick={() => void request("DELETE")}
                >
                  Delete my account
                </Button>
              </section>
            </>
          )}
          {state.policy.retention_policy && (
            <details className="rounded-2xl border p-5 text-sm">
              <summary className="cursor-pointer font-semibold">
                Retention purposes and periods
              </summary>
              <p className="mt-3 text-xs text-muted-foreground">
                Policy {state.policy.retention_policy.id}. Periods start when the relevant
                processing purpose ends. Active legal, safety or financial holds can extend
                retention.
              </p>
              <dl className="mt-3 space-y-3">
                {Object.entries(state.policy.retention_policy.classes).map(([name, rule]) => (
                  <div key={name}>
                    <dt className="font-medium">
                      {name} · {rule.days} days
                    </dt>
                    <dd className="text-muted-foreground">{rule.purpose}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          <section className="space-y-4" aria-label="Privacy request history">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Your requests</h2>
              <Button variant="outline" disabled={loading} onClick={() => void refresh()}>
                Refresh request status
              </Button>
            </div>
            {!state.requests.length && (
              <p className="text-sm text-muted-foreground">No privacy requests yet.</p>
            )}
            {state.requests.map((row) => (
              <article key={row.id} className="space-y-3 rounded-2xl border p-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">
                    {row.kind === "EXPORT"
                      ? "Data export"
                      : row.kind === "DELETE"
                        ? "Account deletion"
                        : "Consent withdrawal"}
                  </h3>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                    {row.status}
                  </span>
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  {row.id} · {date(row.created_at)}
                </p>
                {row.status === "EXTERNAL_REVIEW" && (
                  <p className="text-sm">
                    Local erasure is complete. A provider propagation review is pending with
                    support.
                  </p>
                )}
                {["FAILED", "RETRYING"].includes(row.status) && (
                  <p className="text-sm">
                    Processing needs another attempt. Support can review this reference.
                  </p>
                )}
                {row.result.expires_at && (
                  <p className="text-xs">Download expires {date(row.result.expires_at)}.</p>
                )}
                {row.result.retained?.map((r, i) => (
                  <div key={i} className="rounded-xl bg-secondary/50 p-3 text-xs">
                    <p className="font-medium">
                      {r.class}:{" "}
                      {r.purged
                        ? "Purged"
                        : r.held
                          ? "Restricted retention with active hold"
                          : "Restricted retention"}
                    </p>
                    <p className="mt-1">{r.purpose}</p>
                    <p className="mt-1">Base retention ends {date(r.expires_at)}.</p>
                  </div>
                ))}
                {row.kind === "EXPORT" &&
                  row.status === "COMPLETED" &&
                  state.authenticated &&
                  row.result.expires_at &&
                  new Date(row.result.expires_at) > new Date() && (
                    <Button
                      variant="outline"
                      disabled={loading || !password}
                      onClick={() => void download(row.id)}
                    >
                      Download export
                    </Button>
                  )}
              </article>
            ))}
          </section>
          {!state.authenticated && (
            <Button
              variant="outline"
              disabled={loading}
              onClick={() =>
                void run(async () => {
                  const r = await api.forgetPrivacyReceipt();
                  if (r.ok) {
                    setState(undefined);
                    setMessage("Request tracking cleared from this browser.");
                  } else await fail(r.error);
                })
              }
            >
              Forget tracking on this browser
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function PrivacyOperations() {
  const [access, setAccess] = useState<StaffAccess>(),
    [scope, setScope] = useState<StaffScope>("SUPPORT"),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [queue, setQueue] = useState<PrivacyQueue>(),
    [inspected, setInspected] = useState<{ id: string; record: unknown }>(),
    [error, setError] = useState<string>();
  const { loading, run } = useSingleFlight();
  useEffect(() => {
    void api.staffAccess().then((r) => {
      if (r.ok) {
        setAccess(r.data);
        setScope(r.data.scopes[0] || "SUPPORT");
      } else setError(describeFailure(r.error));
    });
  }, []);
  useEffect(() => {
    if (!access?.expires_at) return;
    const t = setTimeout(
      () => {
        setAccess(undefined);
        setQueue(undefined);
        setInspected(undefined);
        setError("Verify staff MFA again.");
      },
      Math.max(0, new Date(access.expires_at).getTime() - Date.now()),
    );
    return () => clearTimeout(t);
  }, [access?.expires_at]);
  const fail = (e: ApiFailure) => {
    setError(describeFailure(e));
    if (e.kind === "http" && [401, 403].includes(e.status)) {
      setQueue(undefined);
      setInspected(undefined);
      setAccess(undefined);
    }
  };
  const reload = async () => {
    setInspected(undefined);
    const r = await api.privacyQueue(scope, reason.trim());
    if (r.ok) setQueue(r.data);
    else fail(r.error);
  };
  const act = (fn: () => Promise<void>) =>
    run(async () => {
      setError(undefined);
      setInspected(undefined);
      await fn();
    });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act(reload);
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Staff MFA and the matching Support, Trust or Finance scope are required. Record a purpose
        before opening retained data. Holds require an actual case or legal reference.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {!access?.authenticated && (
        <Notice tone="info">Verify MFA in the staff console to use this queue.</Notice>
      )}
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          Queue scope
          <select
            className={control}
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as StaffScope);
              setQueue(undefined);
              setInspected(undefined);
            }}
          >
            {access?.scopes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Purpose for access or decision
          <textarea
            className={control}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setInspected(undefined);
            }}
            maxLength={240}
          />
        </label>
        <label className="block text-sm">
          Case or provider reference
          <input
            className={control}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={240}
          />
        </label>
        <Button disabled={loading || !access?.authenticated || reason.trim().length < 10}>
          Load privacy queue
        </Button>
      </form>
      {queue && (
        <>
          <section className="space-y-3" aria-label="Privacy operations requests">
            <h2 className="font-semibold">Tracked requests</h2>
            {!queue.requests.length && <p className="text-sm">No requests in this scoped queue.</p>}
            {queue.requests.map((r) => (
              <article className="space-y-3 rounded-2xl border p-4" key={r.id}>
                <p className="break-all text-sm">
                  {r.kind} · {r.id}
                </p>
                <p className="text-xs">Status: {r.status}</p>
                {scope === "SUPPORT" && ["FAILED", "RETRYING"].includes(r.status) && (
                  <Button
                    variant="outline"
                    disabled={loading || reason.trim().length < 10}
                    onClick={() =>
                      void act(async () => {
                        const v = await api.retryPrivacy(r.id, reason.trim());
                        if (v.ok) await reload();
                        else fail(v.error);
                      })
                    }
                  >
                    Retry privacy job
                  </Button>
                )}
                {scope === "SUPPORT" && r.status === "EXTERNAL_REVIEW" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Confirm only after the provider's handling has been verified using this
                      reference.
                    </p>
                    <Button
                      variant="outline"
                      disabled={
                        loading || reason.trim().length < 10 || reference.trim().length < 10
                      }
                      onClick={() =>
                        void act(async () => {
                          const v = await api.completePrivacyExternal(
                            r.id,
                            reason.trim(),
                            reference.trim(),
                          );
                          if (v.ok) await reload();
                          else fail(v.error);
                        })
                      }
                    >
                      Confirm provider propagation
                    </Button>
                  </>
                )}
              </article>
            ))}
          </section>
          <section className="space-y-3" aria-label="Restricted retained records">
            <h2 className="font-semibold">Restricted retained records</h2>
            {!queue.retained.length && (
              <p className="text-sm">No retained records for your selected scope.</p>
            )}
            {queue.retained.map((r) => (
              <article className="space-y-3 rounded-2xl border p-4" key={r.id}>
                <p className="font-semibold">{r.class}</p>
                <p className="break-all text-xs text-muted-foreground">Request {r.request_id}</p>
                <p className="text-sm">{r.purpose}</p>
                <p className="text-xs">
                  {r.purged ? "Purged" : r.held ? "Active hold" : "Restricted"} · base expiry{" "}
                  {date(r.expires_at)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={loading || r.purged || reason.trim().length < 10}
                    onClick={() =>
                      void act(async () => {
                        const v = await api.inspectPrivacyRetained(r.id, reason.trim());
                        if (v.ok) setInspected({ id: r.id, record: v.data.record });
                        else fail(v.error);
                      })
                    }
                  >
                    Inspect retained data
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      loading ||
                      r.purged ||
                      reason.trim().length < 10 ||
                      reference.trim().length < 10
                    }
                    onClick={() =>
                      void act(async () => {
                        const v = await api.privacyHold(r.id, {
                          operation: "HOLD",
                          reason: reason.trim(),
                          reference: reference.trim(),
                        });
                        if (v.ok) await reload();
                        else fail(v.error);
                      })
                    }
                  >
                    Record retention hold
                  </Button>
                </div>
                {r.holds.map((h) => (
                  <div key={h.id} className="space-y-2 rounded-xl bg-secondary/50 p-3 text-xs">
                    <p>
                      {h.reference} · {h.released_at ? "Released" : "Active"}
                    </p>
                    <p>{h.reason}</p>
                    {!h.released_at && (
                      <Button
                        variant="outline"
                        disabled={loading || reason.trim().length < 10}
                        onClick={() =>
                          void act(async () => {
                            const v = await api.privacyHold(r.id, {
                              operation: "RELEASE",
                              reason: reason.trim(),
                              hold_id: h.id,
                            });
                            if (v.ok) await reload();
                            else fail(v.error);
                          })
                        }
                      >
                        Release this hold
                      </Button>
                    )}
                  </div>
                ))}
                {inspected?.id === r.id && (
                  <pre
                    className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-secondary/50 p-3 text-xs"
                    aria-label="Retained data inspection"
                  >
                    {JSON.stringify(inspected.record, null, 2)}
                  </pre>
                )}
              </article>
            ))}
          </section>
          {queue.retention_runs && queue.retention_runs.length > 0 && (
            <section className="space-y-2 text-xs">
              <h2 className="font-semibold">Private evidence retention runs</h2>
              {queue.retention_runs.map((r) => (
                <p key={r.id}>
                  {date(r.started_at)} · {r.status} · {r.purged_count} purged
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
