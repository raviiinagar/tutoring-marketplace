import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, describeFailure, type ConnectionDetail, type ConnectionPeer } from "@/lib/api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { connectionReason } from "@/components/connection-reason";

/** Owner-authorized details; contact disclosure remains an explicit server-checked action. */
export function ConnectionDetails({
  connectionId,
  unavailableReason,
}: {
  connectionId: string;
  unavailableReason?: string | null;
}) {
  const [detail, setDetail] = useState<ConnectionDetail>();
  const [peer, setPeer] = useState<ConnectionPeer>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const sequence = useRef(0);
  const action = useSingleFlight();
  const load = useCallback(async () => {
    const attempt = ++sequence.current;
    setLoading(true);
    setDetail(undefined);
    setPeer(undefined);
    setError(undefined);
    const result = await api.connection(connectionId);
    if (attempt !== sequence.current) return;
    if (result.ok) setDetail(result.data.connection);
    else setError(describeFailure(result.error));
    setLoading(false);
  }, [connectionId]);
  useEffect(() => {
    void load();
    const focus = () => {
      if (document.visibilityState === "visible") void load();
    };
    const hide = () => {
      sequence.current++;
      setPeer(undefined);
    };
    const visibility = () => (document.visibilityState === "visible" ? focus() : hide());
    window.addEventListener("focus", focus);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      sequence.current++;
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  const reveal = () =>
    action.run(async () => {
      const attempt = sequence.current;
      setError(undefined);
      setPeer(undefined);
      const result = await api.connectionContacts(connectionId);
      if (attempt !== sequence.current) return;
      if (result.ok) setPeer(result.data.peer);
      else {
        if (result.error.kind === "http" && [401, 403, 404].includes(result.error.status))
          setDetail(undefined);
        setError(describeFailure(result.error));
      }
    });
  return (
    <div className="messaging-section space-y-5">
      <h3 className="text-lg font-semibold">{detail ? "Your Connection" : "Connection access"}</h3>
      {unavailableReason && <p>{connectionReason(unavailableReason)}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {loading ? (
        <p role="status">Checking Connection access…</p>
      ) : (
        detail && (
          <>
            <section className="rounded-2xl border p-5">
              <h4 className="break-words font-semibold">{detail.offer.title}</h4>
              <p className="mt-2 text-sm">
                Connection active. Established {new Date(detail.created_at).toLocaleString()}.
              </p>
              {detail.test_only && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Fictional test Connection. No payment was made.
                </p>
              )}
              <p className="mt-4 whitespace-pre-wrap break-words text-sm">
                {detail.learning_requirements}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                Preferred times: {detail.preferred_times}
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Agree teaching arrangements directly with the Tutor. This Connection does not
                confirm a booked or completed lesson.
              </p>
            </section>
            <section className="rounded-2xl border p-5">
              <h4 className="font-semibold">Verified email contact</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Only the adult participants can access these details. A child Learner is represented
                by their Guardian.
              </p>
              <Button
                className="mt-4 rounded-full"
                disabled={action.loading}
                onClick={() => void reveal()}
              >
                {action.loading ? "Checking permission…" : "Show verified contact"}
              </Button>
              {peer && (
                <div className="mt-5 rounded-xl bg-secondary p-4">
                  <p className="break-words font-semibold">{peer.display_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {peer.role === "GUARDIAN"
                      ? "Guardian"
                      : peer.role === "TUTOR"
                        ? "Tutor"
                        : "Adult Learner"}{" "}
                    · Email ownership verified
                  </p>
                  <a
                    className="link mt-3 inline-block break-all"
                    href={"mailto:" + encodeURIComponent(peer.email)}
                  >
                    {peer.email}
                  </a>
                </div>
              )}
            </section>
          </>
        )
      )}
      <Link
        to="/safety/$kind/$targetId"
        params={{ kind: "connection", targetId: connectionId }}
        className="link block"
      >
        Report or block this account
      </Link>
      <Button variant="outline" disabled={loading || action.loading} onClick={() => void load()}>
        Refresh Connection access
      </Button>
    </div>
  );
}
