import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, describeFailure } from "@/lib/api";
import { AuthShell, Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

/**
 * "Stop these reminders" from a Become-a-Tutor email (ADR0023). The signed token travels in the
 * URL hash, is removed from the address bar at once, and is used only when the button is pressed,
 * so link scanners in mail apps cannot stop reminders by opening the link.
 */
export const Route = createFileRoute("/reminders/stop")({
  ssr: false,
  component: StopReminders,
  head: () => ({
    meta: [
      { title: "Stop Tutor ad reminders — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});

function StopReminders() {
  const token = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const { loading, run } = useSingleFlight();
  useEffect(() => {
    const found = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (found) {
      token.current = found;
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
    setReady(true);
  }, []);
  const stop = () =>
    run(async () => {
      if (!token.current) return;
      setError(undefined);
      const r = await api.stopTeachReminders(token.current);
      if (r.ok) {
        token.current = null;
        setDone(true);
      } else setError(describeFailure(r.error));
    });
  const usable = !!token.current && /^[A-Za-z0-9_-]{10,80}\.[A-Za-z0-9_-]{43}$/.test(token.current);
  return (
    <AuthShell
      title={done ? "Reminders stopped" : "Stop Tutor ad reminders"}
      footer={
        <Link to="/notifications" className="link">
          Email settings
        </Link>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {done ? (
        <Notice tone="success">
          You won't get more reminders to create your Tutor ad. You can turn them back on in your
          email settings.
        </Notice>
      ) : !ready ? (
        <p role="status">Reading your email link…</p>
      ) : !usable ? (
        <Notice tone="info">
          Open the complete link from your reminder email, or change this in your email settings.
        </Notice>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Press the button to stop emails reminding you to create your Tutor ad. Other emails,
            such as enquiries and account notices, are not affected.
          </p>
          <Button disabled={loading} className="w-full" onClick={() => void stop()}>
            {loading ? "Saving…" : "Stop these reminders"}
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
