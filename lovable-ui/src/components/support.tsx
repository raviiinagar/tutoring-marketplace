import { useEffect, useRef, useState, type FormEvent } from "react";
import { Clock3, MessageSquare, ShieldCheck } from "lucide-react";
import {
  api,
  describeFailure,
  type SupportCase,
  type SupportPolicy,
  type StaffScope,
  type SupportOperation,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice, useSingleFlight } from "@/components/account/ui";

const control = "input mt-2 w-full";
function History({ row }: { row: SupportCase }) {
  return (
    <section className="space-y-4 rounded-2xl border p-5" aria-label="Case details">
      <div className="flex items-start gap-3">
        <MessageSquare className="mt-1 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold">{row.subject}</h2>
          <p className="mt-1 text-sm font-medium">Status: {row.status}</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            Case {row.id} · {row.assigned ? "Assigned to staff" : "Awaiting assignment"}
          </p>
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{row.description}</p>
      {row.source_id && (
        <div className="space-y-1 rounded-xl bg-secondary/50 p-3 text-xs">
          <p>Appeal reference: {row.source_id}</p>
          <p className="break-all">
            Original record: {row.related_id}
            {row.source_revision ? ` · revision ${row.source_revision}` : ""}
          </p>
          <p>Evidence stays in the original review, safety or refund record.</p>
        </div>
      )}
      <ol className="space-y-3" aria-label="Case history">
        {row.events?.map((event) => (
          <li
            key={event.id}
            className={`rounded-xl border p-3 text-sm ${event.visibility === "INTERNAL" ? "border-dashed bg-secondary/50" : ""}`}
          >
            <p className="font-semibold">
              {event.outcome.replaceAll("_", " ")}
              {event.visibility === "INTERNAL" ? " · Staff only" : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(event.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
            </p>
            {event.message && (
              <p className="mt-2 whitespace-pre-wrap break-words">{event.message}</p>
            )}
            {event.reason && (
              <p className="mt-2 break-words text-xs">Decision reason: {event.reason}</p>
            )}
            {event.source_result?.refund_case_id && (
              <p className="mt-2 break-all text-xs">
                New refund review: {event.source_result.refund_case_id}. This is awaiting a Finance
                decision; no refund is confirmed.
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
function Coverage({ policy }: { policy: SupportPolicy }) {
  return (
    <aside className="space-y-2 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <Clock3 className="size-4" />
        <p>{policy.hours}</p>
      </div>
      <p>
        {policy.open_now
          ? "Within support hours"
          : "Outside support hours — your case can still be submitted."}
      </p>
      {policy.next_opening_at && (
        <p className="text-xs text-muted-foreground">
          Next opening:{" "}
          {new Date(policy.next_opening_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{" "}
          IST
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">{policy.notice}</p>
    </aside>
  );
}
export function SupportDesk() {
  const [cases, setCases] = useState<SupportCase[]>([]),
    [policy, setPolicy] = useState<SupportPolicy>(),
    [selected, setSelected] = useState<SupportCase>();
  const [category, setCategory] = useState<"ACCOUNT" | "BILLING" | "OTHER">("ACCOUNT"),
    [subject, setSubject] = useState(""),
    [description, setDescription] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState<string>(),
    [loaded, setLoaded] = useState(false);
  const key = useRef(crypto.randomUUID()),
    flight = useSingleFlight();
  const load = async () => {
    const r = await api.supportCases();
    setLoaded(true);
    if (r.ok) {
      setCases(r.data.cases);
      setPolicy(r.data.policy);
    } else {
      setCases([]);
      setSelected(undefined);
      setMessage("");
      setError(describeFailure(r.error));
    }
  };
  useEffect(() => {
    void load();
    let active = true;
    void api.supportPolicy().then((r) => {
      if (active && r.ok && r.data.hours) setPolicy(r.data);
    });
    return () => {
      active = false;
    };
  }, []);
  const open = (id: string) =>
    flight.run(async () => {
      setError(undefined);
      const r = await api.supportCase(id);
      if (r.ok) {
        setSelected(r.data.case);
        setMessage("");
      } else {
        setSelected(undefined);
        setMessage("");
        setError(describeFailure(r.error));
      }
    });
  const create = (e: FormEvent) => {
    e.preventDefault();
    void flight.run(async () => {
      setError(undefined);
      const r = await api.createSupportCase({
        request_key: key.current,
        category,
        subject,
        description,
      });
      if (r.ok) {
        setSelected(r.data.case);
        setSubject("");
        setDescription("");
        key.current = crypto.randomUUID();
        await load();
      } else setError(describeFailure(r.error));
    });
  };
  const reply = (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    void flight.run(async () => {
      setError(undefined);
      const r = await api.replySupportCase(selected.id, selected.revision, message);
      if (r.ok) {
        setSelected(r.data.case);
        setMessage("");
        await load();
      } else setError(describeFailure(r.error));
    });
  };
  return (
    <div className="space-y-7">
      {policy && <Coverage policy={policy} />}
      {error && <Notice tone="error">{error}</Notice>}
      <section className="space-y-3">
        <h2 className="font-semibold">Your cases and appeals</h2>
        <p className="text-sm text-muted-foreground">
          Review and safety appeals appear here after submission. Appeal a refund decision from its
          payment history record.
        </p>
        {!loaded ? (
          <p role="status">Loading your cases...</p>
        ) : !cases.length ? (
          <p className="text-sm text-muted-foreground">No cases yet.</p>
        ) : (
          <ul className="space-y-2">
            {cases.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={flight.loading}
                  onClick={() => void open(row.id)}
                  aria-label={"Open case " + row.id}
                  className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block text-sm font-semibold">
                    {row.category.replaceAll("_", " ")} · {row.status}
                  </span>
                  <span className="mt-1 block break-all text-xs text-muted-foreground">
                    {row.id}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          disabled={flight.loading}
          onClick={() =>
            void flight.run(async () => {
              await load();
              if (selected) {
                const r = await api.supportCase(selected.id);
                if (r.ok) setSelected(r.data.case);
                else setError(describeFailure(r.error));
              }
            })
          }
        >
          Refresh cases
        </Button>
      </section>
      {selected && (
        <>
          <History row={selected} />
          {selected.status !== "RESOLVED" && (
            <form onSubmit={reply} className="space-y-3">
              <label className="block text-sm font-medium">
                Reply to this case
                <textarea
                  className={control + " min-h-24"}
                  required
                  minLength={10}
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
              <Button disabled={flight.loading || message.trim().length < 10}>
                Send case reply
              </Button>
            </form>
          )}
        </>
      )}
      <form onSubmit={create} className="space-y-4 border-t pt-6">
        <h2 className="text-lg font-semibold">How can we help?</h2>
        <label className="block text-sm font-medium">
          Category
          <select
            aria-label="Category"
            className={control}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as typeof category);
              key.current = crypto.randomUUID();
            }}
          >
            <option value="ACCOUNT">Account help</option>
            <option value="BILLING">Platform payment question</option>
            <option value="OTHER">Other question</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Subject
          <input
            className={control}
            required
            minLength={5}
            maxLength={120}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              key.current = crypto.randomUUID();
            }}
          />
        </label>
        <label className="block text-sm font-medium">
          Describe the issue
          <textarea
            className={control + " min-h-28"}
            required
            minLength={10}
            maxLength={2000}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              key.current = crypto.randomUUID();
            }}
          />
        </label>
        <Button
          disabled={flight.loading || subject.trim().length < 5 || description.trim().length < 10}
        >
          Create support case
        </Button>
      </form>
    </div>
  );
}
const labels: Record<SupportOperation, string> = {
  CLAIM: "Claim case",
  RELEASE: "Release assignment",
  NOTE: "Add private staff note",
  REPLY: "Reply and wait for customer",
  RESOLVE: "Resolve support question",
  UPHOLD: "Uphold original decision",
  SUPERSEDED: "Close superseded appeal",
  REOPEN_REVIEW: "Return review to moderation",
  LIFT_ACCOUNT: "Lift this case account restriction",
  LIFT_LISTING: "Lift this case listing restriction",
  LIFT_CONNECTION: "Lift this case conversation restriction",
  RECONSIDER_REFUND: "Open a new Finance refund review",
};
export function SupportOperations() {
  const [scopes, setScopes] = useState<StaffScope[]>([]),
    [scope, setScope] = useState<StaffScope>("SUPPORT"),
    [reason, setReason] = useState(""),
    [rows, setRows] = useState<SupportCase[]>(),
    [selected, setSelected] = useState<SupportCase>(),
    [operation, setOperation] = useState<SupportOperation>("REPLY"),
    [message, setMessage] = useState(""),
    [error, setError] = useState<string>();
  const flight = useSingleFlight();
  useEffect(() => {
    void api.staffAccess().then((r) => {
      if (r.ok && r.data.authenticated) {
        setScopes(r.data.scopes);
        setScope(r.data.scopes[0] || "SUPPORT");
      } else
        setError(
          r.ok
            ? "Verify MFA in the staff console to open support cases."
            : describeFailure(r.error),
        );
    });
  }, []);
  const load = () =>
    flight.run(async () => {
      setError(undefined);
      setSelected(undefined);
      const r = await api.supportQueue(scope, reason);
      if (r.ok) setRows(r.data.cases);
      else setError(describeFailure(r.error));
    });
  const inspect = (id: string) =>
    flight.run(async () => {
      setError(undefined);
      setSelected(undefined);
      const r = await api.inspectSupportCase(id, reason);
      if (r.ok) {
        setSelected(r.data.case);
        setMessage("");
        setOperation("REPLY");
      } else setError(describeFailure(r.error));
    });
  const act = (op: SupportOperation) =>
    flight.run(async () => {
      if (!selected) return;
      setError(undefined);
      const r = await api.actSupportCase(selected.id, {
        revision: selected.revision,
        operation: op,
        reason,
        ...(["CLAIM", "RELEASE"].includes(op) ? {} : { message }),
      });
      if (r.ok) {
        setSelected(r.data.case);
        setMessage("");
        setRows((old) => old?.map((row) => (row.id === selected.id ? r.data.case : row)));
      } else {
        setError(describeFailure(r.error));
        if (r.error.kind === "http" && (r.error.status === 401 || r.error.status === 403))
          setSelected(undefined);
      }
    });
  const appeal = selected?.category.endsWith("_APPEAL");
  const operations: SupportOperation[] = [
    "NOTE",
    "REPLY",
    ...(appeal
      ? [
          "UPHOLD" as const,
          ...(selected?.category === "REFUND_APPEAL"
            ? ["RECONSIDER_REFUND" as const]
            : ["SUPERSEDED" as const]),
          ...(selected?.category === "REVIEW_APPEAL"
            ? ["REOPEN_REVIEW" as const]
            : selected?.category === "SAFETY_APPEAL"
              ? ["LIFT_ACCOUNT" as const, "LIFT_LISTING" as const, "LIFT_CONNECTION" as const]
              : []),
        ]
      : ["RESOLVE" as const]),
  ];
  return (
    <div className="space-y-6">
      <p className="flex gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-5 shrink-0" />
        Current staff MFA and the case's Finance, Trust or Support scope are required. Claim a case
        before responding.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <label className="block text-sm font-medium">
        Case queue
        <select
          aria-label="Case queue"
          className={control}
          value={scope}
          disabled={!scopes.length || flight.loading}
          onChange={(e) => {
            setScope(e.target.value as StaffScope);
            setRows(undefined);
            setSelected(undefined);
          }}
        >
          {scopes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Reason for case access
        <input
          className={control}
          minLength={10}
          maxLength={240}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button
        disabled={flight.loading || !scopes.length || reason.trim().length < 10}
        onClick={() => void load()}
      >
        Load case queue
      </Button>
      {rows &&
        (!rows.length ? (
          <p className="text-sm">No cases in this queue.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li className="rounded-xl border p-4" key={row.id}>
                <p className="text-sm font-semibold">
                  {row.category.replaceAll("_", " ")} · {row.status}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.assigned ? "Assigned" : "Unassigned"}
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  disabled={flight.loading || reason.trim().length < 10}
                  aria-label={"Inspect case " + row.id}
                  onClick={() => void inspect(row.id)}
                >
                  Inspect case {row.id.slice(0, 8)}
                </Button>
              </li>
            ))}
          </ul>
        ))}
      {selected && (
        <>
          <History row={selected} />
          {selected.status !== "RESOLVED" && (
            <section className="space-y-4">
              <p className="break-all text-xs text-muted-foreground">
                Assigned staff: {selected.assigned_to || "Unassigned"}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={flight.loading || reason.trim().length < 10}
                  onClick={() => void act("CLAIM")}
                >
                  Claim case
                </Button>
                {selected.assigned && (
                  <Button
                    variant="outline"
                    disabled={flight.loading || reason.trim().length < 10}
                    onClick={() => void act("RELEASE")}
                  >
                    Release assignment
                  </Button>
                )}
              </div>
              {appeal && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Inspect the original evidence in the{" "}
                  {selected.category === "REFUND_APPEAL" ? (
                    <a className="link" href="/staff/finance">
                      Finance workspace
                    </a>
                  ) : selected.category === "REVIEW_APPEAL" ? (
                    <a className="link" href="/staff/reviews">
                      review workspace
                    </a>
                  ) : (
                    <a className="link" href="/staff/safety">
                      safety workspace
                    </a>
                  )}
                  . Reopening a review does not publish it. A new Finance review does not approve a
                  refund. Changed source decisions must be closed as superseded.
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(operation);
                }}
                className="space-y-4"
              >
                <label className="block text-sm font-medium">
                  Case action
                  <select
                    aria-label="Case action"
                    className={control}
                    value={operation}
                    onChange={(e) => setOperation(e.target.value as SupportOperation)}
                  >
                    {operations.map((op) => (
                      <option key={op} value={op}>
                        {labels[op]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {operation === "NOTE" ? "Private staff note" : "Response to customer"}
                  <textarea
                    className={control + " min-h-28"}
                    required
                    minLength={10}
                    maxLength={2000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  {operation === "NOTE"
                    ? "Visible only to staff with this case scope."
                    : "This response and outcome will be visible to the case owner."}{" "}
                  Use the access reason above to record the decision purpose.
                </p>
                <Button
                  disabled={
                    flight.loading ||
                    !selected.assigned ||
                    reason.trim().length < 10 ||
                    message.trim().length < 10
                  }
                >
                  {labels[operation]}
                </Button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
