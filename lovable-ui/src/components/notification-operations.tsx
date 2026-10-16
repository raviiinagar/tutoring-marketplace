import { useState } from "react";
import { api, describeFailure, type NotificationQueue } from "@/lib/api";
import { Field, Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { notificationLabel, deliveryLabel } from "./notification-settings";
export function NotificationOperations() {
  const [reason, setReason] = useState("");
  const [queue, setQueue] = useState<NotificationQueue>();
  const [error, setError] = useState<string>();
  const [references, setReferences] = useState<Record<string, string>>({});
  const action = useSingleFlight();
  const load = async () => {
    const r = await api.notificationQueue(reason.trim());
    if (r.ok) {
      setQueue(r.data);
      setError(undefined);
    } else {
      setQueue(undefined);
      setError(describeFailure(r.error));
    }
  };
  const run = (id: string, reconcile = false) =>
    action.run(async () => {
      setError(undefined);
      const r = reconcile
        ? await api.reconcileNotification(id, references[id]?.trim() || "", reason.trim())
        : await api.retryNotification(id, reason.trim());
      if (r.ok) await load();
      else {
        setError(describeFailure(r.error));
        setQueue(undefined);
      }
    });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Support permission and current staff MFA are required. Inspect delivery metadata with an
        operational purpose. Message bodies and recipient addresses are excluded.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(load);
        }}
      >
        <Field
          label="Reason for notification access"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setQueue(undefined);
          }}
          minLength={10}
          maxLength={240}
          required
        />
        <Button disabled={action.loading || reason.trim().length < 10}>
          Inspect delivery queue
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      {queue && (
        <>
          <Notice tone="info">
            Critical SMS:{" "}
            {queue.sms_configured
              ? "configured for the verified operations owner"
              : "setup required"}
            . Limit: {queue.sms_daily_limit} send attempts per UTC day. Delivery acceptance does not
            confirm handset or inbox delivery.
          </Notice>
          {queue.delivery_mode === "LOCAL_CAPTURE" && (
            <p className="text-sm">Local email capture is active. No real emails are sent.</p>
          )}
          {!queue.notifications.length && <p>No queued notifications.</p>}
          <ul className="space-y-4">
            {queue.notifications.map((n) => (
              <li key={n.id} className="min-w-0 space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-semibold">{notificationLabel(n.template)}</h2>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                    {n.channel} · {deliveryLabel(n.status)}
                  </span>
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  Reference {n.id} · {n.template_version} · {n.test_only ? "Test" : "Live"}
                </p>
                <p className="text-sm">
                  Attempts: {n.attempts} · {new Date(n.created_at).toLocaleString()}
                </p>
                {n.last_error && (
                  <p className="break-words text-sm">{n.last_error.replaceAll("_", " ")}</p>
                )}
                {n.channel === "SMS" && n.status === "UNKNOWN" ? (
                  <div className="space-y-3">
                    <p className="text-sm">
                      Verify the original message in the provider account. Unknown delivery cannot
                      be blindly resent.
                    </p>
                    <Field
                      label={"Original SMS provider reference for " + n.id}
                      value={references[n.id] || ""}
                      onChange={(e) => setReferences({ ...references, [n.id]: e.target.value })}
                      placeholder="SM..."
                    />
                    <Button
                      variant="outline"
                      disabled={
                        action.loading || !/^SM[0-9a-fA-F]{32}$/.test(references[n.id] || "")
                      }
                      onClick={() => void run(n.id, true)}
                    >
                      Verify original provider outcome
                    </Button>
                  </div>
                ) : ["FAILED", "CONFIG_REQUIRED", "PENDING"].includes(n.status) ? (
                  <Button
                    variant="outline"
                    disabled={action.loading}
                    onClick={() => void run(n.id)}
                  >
                    Retry existing notification
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
