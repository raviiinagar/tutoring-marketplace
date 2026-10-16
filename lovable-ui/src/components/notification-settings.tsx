import { useCallback, useEffect, useState } from "react";
import {
  api,
  describeFailure,
  type NotificationHistory,
  type NotificationPreferences,
} from "@/lib/api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

export const notificationLabel = (template: string) =>
  ({
    REQUEST_RECEIVED: "New Tutor enquiry",
    REQUEST_SENT: "Enquiry sent",
    REQUEST_DECISION: "Tutor response",
    RESPONSE_DUE: "Enquiry response due",
    REQUEST_EXPIRED: "Enquiry expired",
    CHAT_MESSAGE: "New private message",
    PAYMENT_CAPTURED: "Payment confirmed",
    PAYMENT_REVIEW: "Payment needs review",
    ACCESS_ACTIVATED: "Access Pass activated",
    PURCHASE_CANCELLED: "Purchase cancelled",
    REFUND_REQUESTED: "Refund requested",
    REFUND_UPDATE: "Refund status updated",
    REFUND_CASE_DECIDED: "Refund review outcome",
    AVAILABILITY_MATCH: "Tutor availability",
    OPERATOR_REFUND_ALERT: "Critical refund alert",
  })[template] || "Service update";
export const deliveryLabel = (status: string) =>
  ({
    SENT: "Accepted by delivery service",
    PENDING: "Queued",
    PROCESSING: "Sending",
    UNKNOWN: "Provider outcome unknown",
    FAILED: "Delivery failed",
    SUPPRESSED: "Not sent",
    CONFIG_REQUIRED: "Delivery setup required",
  })[status] || status;
export function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>();
  const [history, setHistory] = useState<NotificationHistory>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const action = useSingleFlight();
  const load = useCallback(async () => {
    setError(undefined);
    const [p, h] = await Promise.all([api.notificationPreferences(), api.notifications()]);
    if (p.ok) setPreferences(p.data.preferences);
    else setError(describeFailure(p.error));
    if (h.ok) setHistory(h.data);
    else setError(describeFailure(h.error));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const save = () =>
    action.run(async () => {
      if (!preferences) return;
      setError(undefined);
      setSaved(false);
      const r = await api.saveNotificationPreferences(preferences);
      if (r.ok) {
        setPreferences(r.data.preferences);
        setSaved(true);
      } else setError(describeFailure(r.error));
    });
  const fields: [keyof Omit<NotificationPreferences, "notice_version">, string, string][] = [
    [
      "enquiry_email",
      "Enquiries and Tutor responses",
      "Receive enquiry updates and response reminders.",
    ],
    [
      "chat_email",
      "New private messages",
      "Receive a private link when an unread message arrives.",
    ],
    [
      "availability_email",
      "Optional availability alerts",
      "Requires a separate verified subscription. Turning this off withdraws your current alerts; turning it on requires a new subscription.",
    ],
    [
      "marketing_email",
      "Marketing updates",
      "Optional and off by default. No marketing campaigns are currently sent.",
    ],
  ];
  return (
    <div className="space-y-7">
      {error && <Notice tone="error">{error}</Notice>}
      {!preferences ? (
        <p role="status">Loading notification preferences...</p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="flex items-start gap-3 rounded-xl border bg-secondary/40 p-4">
            <input
              type="checkbox"
              checked
              disabled
              className="mt-1"
              aria-label="Financial and security notices"
            />
            <span>
              <span className="font-semibold">Financial and security notices</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Required service emails stay enabled, including payment, access and refund updates.
              </span>
            </span>
          </label>
          {fields.map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-3">
              <input
                type="checkbox"
                aria-label={label}
                className="mt-1 size-4 accent-primary"
                checked={preferences[key]}
                onChange={(e) => {
                  setPreferences({ ...preferences, [key]: e.target.checked });
                  setSaved(false);
                }}
              />
              <span>
                <span className="font-medium">{label}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
          <Button type="submit" disabled={action.loading}>
            {action.loading ? "Saving..." : "Save preferences"}
          </Button>
          {saved && (
            <p role="status" className="text-sm">
              Preferences saved.
            </p>
          )}
        </form>
      )}
      <section className="border-t pt-6">
        <h2 className="text-xl font-semibold">Recent service updates</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Private details stay inside your account. Delivery acceptance does not confirm that an
          email was read.
        </p>
        {history?.delivery_mode === "LOCAL_CAPTURE" && (
          <div className="mt-4">
            <Notice tone="info">
              Testing: messages are saved locally and have not been sent to real inboxes. Open the
              development inbox to inspect them.
            </Notice>
          </div>
        )}
        {history && !history.notifications.length && (
          <p className="mt-4 text-sm">No service updates yet.</p>
        )}
        <ul className="mt-4 space-y-3">
          {history?.notifications.map((n) => (
            <li key={n.id} className="rounded-xl border p-4">
              <p className="font-medium">{notificationLabel(n.template)}</p>
              <p className="mt-1 text-sm">
                {deliveryLabel(n.status)}
                {n.test_only ? " · Test" : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={action.loading}
          onClick={() => void action.run(load)}
        >
          Refresh preferences and updates
        </Button>
      </section>
    </div>
  );
}
