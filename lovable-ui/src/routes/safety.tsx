import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, describeFailure, type SafetyCenter } from "@/lib/api";
import { AuthShell, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/safety")({
  ssr: false,
  component: Center,
  head: () => ({
    meta: [
      { title: "Safety and reports — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Center() {
  const [data, setData] = useState<SafetyCenter>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [selected, setSelected] = useState("");
  const [description, setDescription] = useState("");
  const [retry, setRetry] = useState(false);
  const flight = useSingleFlight();
  const sequence = useRef(0);
  const identity = useRef<string | undefined>(undefined);
  const queued = useRef<{ id: string; request_key: string; description: string } | undefined>(
    undefined,
  );
  const load = useCallback(async () => {
    const turn = ++sequence.current;
    const r = await api.safetyCenter();
    if (turn !== sequence.current) return;
    if (r.ok) {if(identity.current&&identity.current!==r.data.actor_id){queued.current=undefined;setSelected('');setDescription('');setRetry(false);setNotice(undefined);}identity.current=r.data.actor_id;setData(r.data);}
    else {
      queued.current=undefined;setSelected('');setDescription('');setRetry(false);
      setData(undefined);
      setError(describeFailure(r.error));
    }
  }, []);
  useEffect(() => {
    void load();
    window.addEventListener("focus", load);
    return () => {
      sequence.current++;
      window.removeEventListener("focus", load);
    };
  }, [load]);
  const appeal = (event: FormEvent) => {
    event.preventDefault();
    void flight.run(async () => {
      setError(undefined);
      setNotice(undefined);
      queued.current ??= {
        id: selected,
        request_key: crypto.randomUUID(),
        description: description.trim(),
      };
      const r = await api.appealSafety(queued.current.id, {
        request_key: queued.current.request_key,
        description: queued.current.description,
      });
      if (r.ok) {
        queued.current = undefined;
        setSelected("");
        setDescription("");
        setRetry(false);
        setNotice(
          "Appeal received. Status: Pending review. Restrictions remain in place until a recorded decision changes them.",
        );
        await load();
      } else {
        setError(describeFailure(r.error));
        if (r.error.kind === "unavailable" || r.error.status >= 500) setRetry(true);
        else {
          queued.current = undefined;
          setRetry(false);
        }
      }
    });
  };
  return (
    <AuthShell
      title="Safety and reports"
      intro="Your reports, communication blocks and safety decisions."
    >
      {error && <Notice tone="error">{error}</Notice>}
      {notice && (
        <div className="mt-4">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}
      {!data && !error ? (
        <p role="status">Loading your safety information…</p>
      ) : (
        data && (
          <div className="space-y-7">
            <section>
              <h2 className="text-lg font-semibold">Your communication blocks</h2>
              {!data.blocks.length ? (
                <p className="mt-3 text-sm text-muted-foreground">You have no account blocks.</p>
              ) : (
                data.blocks.map((block) => (
                  <div key={block.kind + block.target_id} className="mt-3 rounded-xl border p-4">
                    <p className="break-words text-sm">{block.offer_title}</p>
                    <Link
                      to="/safety/$kind/$targetId"
                      params={{ kind: block.kind, targetId: block.target_id }}
                      className="link mt-2 inline-block text-sm"
                    >
                      Manage block
                    </Link>
                  </div>
                ))
              )}
            </section>
            <section>
              <h2 className="text-lg font-semibold">Recent reports and decisions</h2>
              {!data.cases.length ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No reports or safety decisions to show.
                </p>
              ) : (
                data.cases.map((item) => (
                  <article key={item.id} className="mt-4 space-y-3 rounded-2xl border p-5">
                    <h3 className="font-semibold">
                      {item.relationship === "REPORTER"
                        ? "Your report"
                        : "Decision affecting your interaction"}
                    </h3>
                    <p className="text-sm">
                      Status: {item.status} · {item.category.replaceAll("_", " ")}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">Reference: {item.id}</p>
                    {item.public_notice && (
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {item.public_notice}
                      </p>
                    )}
                    {data.restrictions
                      .filter((r) => r.case_id === item.id)
                      .map((r) => (
                        <p key={r.id} className="text-sm">
                          {r.target_type.toLowerCase()} restriction:{" "}
                          {r.lifted_at ? "Lifted" : "Active"}
                        </p>
                      ))}
                    {data.appeals.some((a) => a.case_id === item.id && a.case_revision === item.revision) ? (
                      <p role="status" className="text-sm font-medium">
                        {data.appeals.find((a) => a.case_id === item.id && a.case_revision === item.revision)?.status === 'RESOLVED' ? 'Appeal: Resolved — see Support for the outcome' : 'Appeal: Pending review'}
                      </p>
                    ) : (
                      item.can_appeal && (
                        <Button
                          variant="outline"
                          disabled={flight.loading || retry}
                          onClick={() => {
                            setSelected(item.id);
                            setDescription("");
                            setNotice(undefined);
                          }}
                        >
                          Appeal decision
                        </Button>
                      )
                    )}
                  </article>
                ))
              )}
            </section>
            {selected && (
              <form onSubmit={appeal} className="space-y-4 rounded-2xl border bg-secondary/30 p-5">
                <h2 className="font-semibold">Request a safety decision review</h2>
                <p className="break-all text-xs text-muted-foreground">Case: {selected}</p>
                <label className="block text-sm font-semibold">
                  Appeal details
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    className="input mt-2 min-h-28"
                    value={description}
                    disabled={flight.loading || retry}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <SubmitButton loading={flight.loading} loadingText="Submitting appeal…">
                  {retry ? "Retry appeal" : "Submit appeal"}
                </SubmitButton>
              </form>
            )}
            <Button variant="outline" disabled={flight.loading} onClick={() => void load()}>
              Refresh safety status
            </Button>
          </div>
        )
      )}
      <Link to="/support" className="link mt-5 block">Track safety appeals in Support</Link>
      <Link to="/account" className="link mt-6 inline-block">
        Back to your account
      </Link>
    </AuthShell>
  );
}
