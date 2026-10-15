import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Shield, Flag } from "lucide-react";
import {
  api,
  describeFailure,
  type SafetyContext,
  type SafetyKind,
  type SafetyCategory,
} from "@/lib/api";
import { AuthShell, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/safety_/$kind/$targetId")({
  ssr: false,
  component: SafetyPage,
  head: () => ({
    meta: [
      { title: "Safety controls — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});
function SafetyPage() {
  const { kind, targetId } = Route.useParams();
  return kind === "connection" || kind === "request" ? (
    <Controls key={kind + targetId} kind={kind} targetId={targetId} />
  ) : (
    <AuthShell title="Safety controls">
      <Notice tone="error">This safety context is unavailable.</Notice>
    </AuthShell>
  );
}
function Controls({ kind, targetId }: { kind: SafetyKind; targetId: string }) {
  const [context, setContext] = useState<SafetyContext>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [caseId, setCaseId] = useState<string>();
  const [category, setCategory] = useState<SafetyCategory>("HARASSMENT");
  const [description, setDescription] = useState("");
  const [numbers, setNumbers] = useState("");
  const [retry, setRetry] = useState(false);
  const queued = useRef<
    | {
        request_key: string;
        category: SafetyCategory;
        description: string;
        message_sequences: number[];
      }
    | undefined
  >(undefined);
  const sequence = useRef(0);
  const identity = useRef<string | undefined>(undefined);
  const flight = useSingleFlight();
  const load = useCallback(async () => {
    const turn = ++sequence.current;
    setLoading(true);
    setContext(undefined);
    const r = await api.safetyContext(kind, targetId);
    if (sequence.current !== turn) return;
    if (r.ok) {
      if(identity.current&&identity.current!==r.data.actor_id){queued.current=undefined;setDescription('');setNumbers('');setRetry(false);setCaseId(undefined);setNotice(undefined);}
      identity.current=r.data.actor_id;setContext(r.data);
    } else {queued.current=undefined;setDescription('');setNumbers('');setRetry(false);setCaseId(undefined);setError(describeFailure(r.error));}
    setLoading(false);
  }, [kind, targetId]);
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("message");
    if (selected && /^[1-9][0-9]*$/.test(selected)) setNumbers(selected);
    void load();
    window.addEventListener("focus", load);
    return () => {
      sequence.current++;
      window.removeEventListener("focus", load);
    };
  }, [load]);
  const block = () =>
    flight.run(async () => {
      if (!context) return;
      setError(undefined);
      setNotice(undefined);
      const r = await api.blockPeer(kind, targetId, !context.blocked_by_you);
      if (r.ok) {
        setContext(r.data);
        setNotice(
          r.data.blocked_by_you
            ? "Account blocked. Communication is stopped."
            : r.data.communication_blocked
              ? "Your block was removed. Communication remains blocked."
              : "Your block was removed. Other safety permissions still apply.",
        );
      } else {
        setContext(undefined);
        setError(describeFailure(r.error));
      }
    });
  const report = (event: FormEvent) => {
    event.preventDefault();
    void flight.run(async () => {
      setError(undefined);
      setNotice(undefined);
      if (!queued.current) {
        const values = numbers.trim() ? numbers.split(",").map((v) => Number(v.trim())) : [];
        if (
          values.length > 10 ||
          values.some((v) => !Number.isSafeInteger(v) || v < 1) ||
          new Set(values).size !== values.length
        ) {
          setError("Choose up to ten different message numbers, separated by commas.");
          return;
        }
        queued.current = {
          request_key: crypto.randomUUID(),
          category,
          description: description.trim(),
          message_sequences: values,
        };
      }
      const r = await api.reportSafety(kind, targetId, queued.current);
      if (r.ok) {
        setCaseId(r.data.case.id);
        setNotice("Report received. Trust review is pending.");
        setDescription("");
        setNumbers("");
        setRetry(false);
        queued.current = undefined;
      } else {
        setError(describeFailure(r.error));
        if (r.error.kind === "unavailable" || r.error.status >= 500) setRetry(true);
        else {
          setRetry(false);
          queued.current = undefined;
        }
      }
    });
  };
  return (
    <AuthShell title="Safety controls" intro="Choose what feels right for this interaction.">
      <Link to="/safety" className="link text-sm">
        Safety and reports
      </Link>
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {notice && (
        <div className="mt-4">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}
      {caseId && (
        <p className="mt-3 break-all text-sm">
          Report reference: {caseId}.{" "}
          <Link to="/safety" className="link">
            Track report status
          </Link>
        </p>
      )}
      {loading ? (
        <p role="status" className="mt-5">
          Checking safety controls…
        </p>
      ) : (
        context && (
          <div className="mt-6 space-y-7">
            <p className="break-words text-sm font-semibold">{context.offer_title}</p>
            <section className="rounded-2xl border bg-secondary/30 p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Shield size={18} />
                Communication controls
              </h2>
              <p role="status" className="mt-3 text-sm">
                {context.blocked_by_you
                  ? "You have blocked this account."
                  : context.communication_blocked
                    ? "Communication is blocked."
                    : "You have not blocked this account."}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Blocking stops messages, contact reads and new enquiries between your accounts.
                Previously shared contact details cannot be recalled. You can remove your own block
                later.
              </p>
              <Button
                className="mt-4 rounded-full"
                variant={context.blocked_by_you ? "outline" : "destructive"}
                disabled={flight.loading}
                onClick={() => void block()}
              >
                {context.blocked_by_you ? "Unblock account" : "Block account"}
              </Button>
            </section>
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Flag size={18} />
                Report a concern
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Reports go to Trust staff. Only the messages you select, or this reported initial
                enquiry, are preserved for review. Blocking and reporting are separate actions.
              </p>
              <form onSubmit={report} className="mt-5 space-y-4">
                <fieldset disabled={flight.loading || retry} className="space-y-4">
                  <label className="block text-sm font-semibold">
                    Concern category
                    <select
                      className="input mt-2"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SafetyCategory)}
                    >
                      <option value="HARASSMENT">Harassment or unwanted contact</option>
                      <option value="FRAUD">Fraud or misleading conduct</option>
                      <option value="CHILD_SAFETY">Child safety</option>
                      <option value="OTHER">Another concern</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold">
                    Report details
                    <textarea
                      className="input mt-2 min-h-28"
                      minLength={10}
                      maxLength={2000}
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  {kind === "connection" && (
                    <label className="block text-sm font-semibold">
                      Message numbers (optional)
                      <input
                        className="input mt-2"
                        placeholder="For example: 2, 5"
                        value={numbers}
                        onChange={(e) => setNumbers(e.target.value)}
                        aria-describedby="message-number-hint"
                      />
                      <span
                        id="message-number-hint"
                        className="mt-2 block text-xs font-normal text-muted-foreground"
                      >
                        Use Report beside a chat message to select it. Up to ten messages.
                      </span>
                    </label>
                  )}
                </fieldset>
                <SubmitButton loading={flight.loading} loadingText="Submitting report…">
                  {retry ? "Retry report" : "Submit report"}
                </SubmitButton>
              </form>
            </section>
          </div>
        )
      )}
      <Button variant="outline" className="mt-6" disabled={loading||flight.loading} onClick={()=>void load()}>Refresh safety controls</Button>
      {!context && !loading && (
        <Link to="/auth/signin" className="link mt-5 inline-block">
          Sign in again
        </Link>
      )}
    </AuthShell>
  );
}
