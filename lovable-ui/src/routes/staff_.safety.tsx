import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  describeFailure,
  type SafetyCase,
  type SafetyCaseView,
  type SafetyOperation,
} from "@/lib/api";
import { AuthShell, Notice, Field, SubmitButton, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/staff_/safety")({
  ssr: false,
  component: TrustCases,
  head: () => ({
    meta: [
      { title: "Safety investigations — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});
const operations: Record<SafetyOperation, string> = {
  RESTRICT_ACCOUNT: "Restrict reported account",
  LIFT_ACCOUNT: "Lift this case’s account restriction",
  RESTRICT_LISTING: "Restrict this teaching offer",
  LIFT_LISTING: "Lift this case’s offer restriction",
  RESTRICT_CONNECTION: "Restrict this Connection",
  LIFT_CONNECTION: "Lift this case’s Connection restriction",
  RESOLVE: "Resolve case",
  DISMISS: "Dismiss case",
};
function TrustCases() {
  const [rows, setRows] = useState<SafetyCase[]>([]);
  const [selected, setSelected] = useState("");
  const [purpose, setPurpose] = useState("");
  const [detail, setDetail] = useState<SafetyCaseView>();
  const [reason, setReason] = useState("");
  const [operation, setOperation] = useState<SafetyOperation>("RESTRICT_CONNECTION");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [ready, setReady] = useState(false);
  const flight = useSingleFlight();
  const sequence = useRef(0);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const load = useCallback(async () => {
    const turn = ++sequence.current;
    setDetail(undefined);
    setRows([]);
    setReady(false);
    setError(undefined);
    const r = await api.safetyQueue();
    if (turn !== sequence.current) return;
    if (r.ok) {
      setRows(r.data.cases);
      setReady(true);
      const access = await api.staffAccess();
      if (turn !== sequence.current) return;
      clearTimeout(expiry.current);
      if (access.ok && access.data.expires_at)
        expiry.current = setTimeout(
          () => {
            sequence.current++;
            setDetail(undefined);
            setRows([]);
            setReady(false);
            setError("Verify MFA to continue reviewing safety cases.");
          },
          Math.max(0, new Date(access.data.expires_at).getTime() - Date.now()),
        );
    } else setError(describeFailure(r.error));
  }, []);
  useEffect(() => {
    void load();
    window.addEventListener("focus", load);
    return () => {
      sequence.current++;
      clearTimeout(expiry.current);
      window.removeEventListener("focus", load);
    };
  }, [load]);
  const inspect = (event: FormEvent) => {
    event.preventDefault();
    void flight.run(async () => {
      const turn = sequence.current;
      setDetail(undefined);
      setError(undefined);
      setNotice(undefined);
      const r = await api.inspectSafety(selected, purpose.trim());
      if (turn !== sequence.current) return;
      if (r.ok) {
        setDetail(r.data.case);
        setReason("");
      } else setError(describeFailure(r.error));
    });
  };
  const decide = (event: FormEvent) => {
    event.preventDefault();
    void flight.run(async () => {
      if (!detail) return;
      const turn = sequence.current;
      setError(undefined);
      setNotice(undefined);
      const r = await api.safetyAction(detail.id, detail.revision, operation, reason.trim());
      if (turn !== sequence.current) return;
      if (r.ok) {
        setDetail((previous) =>
          previous ? { ...previous, ...r.data.case, restrictions: r.data.restrictions } : previous,
        );
        setNotice("Safety decision recorded. Active restrictions remain authoritative.");
        setReason("");
      } else {
        setDetail(undefined);
        setError(describeFailure(r.error));
      }
    });
  };
  return (
    <AuthShell
      title="Safety investigations"
      intro="Trust scope and active staff MFA are required. Open one reported case for a recorded purpose."
    >
      {error && <Notice tone="error">{error}</Notice>}
      {notice && (
        <div className="mt-4">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}
      {ready && (
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">
            Recent safety cases
            <select
              className="input mt-2"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setDetail(undefined);
                setPurpose("");
              }}
            >
              <option value="">Choose case</option>
              {rows.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.category} · {item.status} · {item.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          {!rows.length && (
            <p className="text-sm text-muted-foreground">No recent reviewable cases.</p>
          )}
          <form onSubmit={inspect} className="space-y-4">
            <Field
              label="Safety case reference"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setDetail(undefined);
              }}
              required
              maxLength={36}
            />
            <Field
              label="Purpose for case access"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              minLength={10}
              maxLength={240}
              required
              hint="This purpose is audited. Do not enter message text or private evidence."
            />
            <SubmitButton
              disabled={!selected}
              loading={flight.loading}
              loadingText="Checking case access…"
            >
              Inspect safety case
            </SubmitButton>
          </form>
        </div>
      )}
      {detail && (
        <section className="mt-7 space-y-5 border-t pt-6">
          <h2 className="text-lg font-semibold">Reported case</h2>
          <p className="break-words font-medium">{detail.evidence.offer_title}</p>
          <p className="text-sm">
            Status: {detail.status} · Revision {detail.revision}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">{detail.description}</p>
          {detail.evidence.initial_request && (
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold">Reported initial enquiry</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {detail.evidence.initial_request.learning_requirements}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {detail.evidence.initial_request.preferred_times}
              </p>
            </div>
          )}
          <h3 className="font-semibold">Selected message evidence</h3>
          {!detail.evidence.messages.length ? (
            <p className="text-sm text-muted-foreground">
              No chat messages selected in this report.
            </p>
          ) : (
            detail.evidence.messages.map((message) => (
              <article key={message.sequence} className="rounded-xl border bg-secondary/30 p-4">
                <p className="text-xs font-medium">
                  Message {message.sequence} · {message.sender_role}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                  {message.text}
                </p>
              </article>
            ))
          )}
          <h3 className="font-semibold">Restrictions from this case</h3>
          {!detail.restrictions.length ? (
            <p className="text-sm text-muted-foreground">No restrictions recorded.</p>
          ) : (
            detail.restrictions.map((r) => (
              <p key={r.id} className="text-sm">
                {r.target_type} · {r.lifted_at ? "LIFTED" : "ACTIVE"} ·{" "}
                {r.lifted_at ? r.lift_reason : r.reason}
              </p>
            ))
          )}
          {detail.appeals.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-semibold">Appeal entries</h3>
              {detail.appeals.map((appeal) => (
                <div key={appeal.id} className="rounded-xl border p-4">
                  <p className="text-sm font-medium">Pending review</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {appeal.description}
                  </p>
                </div>
              ))}
            </section>
          )}
          <form onSubmit={decide} className="space-y-4 rounded-2xl border p-5">
            <h3 className="font-semibold">Record a safety decision</h3>
            <label className="block text-sm font-semibold">
              Safety action
              <select
                className="input mt-2"
                value={operation}
                onChange={(e) => setOperation(e.target.value as SafetyOperation)}
              >
                {Object.entries(operations).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Public decision reason"
              hint="Affected adults can see this reason. Do not include reporter identity or private evidence."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={10}
              maxLength={240}
              required
            />
            <SubmitButton loading={flight.loading} loadingText="Recording decision…">
              Record safety decision
            </SubmitButton>
          </form>
        </section>
      )}
      <Button
        variant="outline"
        disabled={flight.loading}
        className="mt-6"
        onClick={() => void load()}
      >
        Refresh safety queue
      </Button>
      <Link to="/staff" className="link mt-6 block">
        Back to staff console
      </Link>
    </AuthShell>
  );
}
