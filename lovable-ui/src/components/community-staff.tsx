import { useState, type FormEvent } from "react";
import {
  api,
  describeFailure,
  type ApiFailure,
  type CommunityReported,
  type CommunityStaffChannel,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice, useSingleFlight } from "@/components/account/ui";

const control = "input mt-2 w-full";
const reportLabels: Record<string, string> = {
  SPAM: "Spam",
  HARASSMENT: "Harassment",
  CONTACT_DETAILS: "Contact details",
  INAPPROPRIATE: "Inappropriate",
  OTHER: "Other",
};
const when = (value: string) =>
  new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";
type Tab = "reports" | "mutes" | "channels";
type Mute = {
  user_id: string;
  nickname: string | null;
  muted_until: string;
  reason: string;
  created_at: string;
};

export function CommunityOperations() {
  const [reason, setReason] = useState(""),
    [tab, setTab] = useState<Tab>("reports"),
    [reported, setReported] = useState<CommunityReported[]>(),
    [removed, setRemoved] = useState<Set<string>>(new Set()),
    [mutes, setMutes] = useState<Mute[]>(),
    [channels, setChannels] = useState<CommunityStaffChannel[]>(),
    [muteHours, setMuteHours] = useState(24),
    [draft, setDraft] = useState({
      name: "",
      description: "",
      staff_only_posting: false,
      position: 100,
    }),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const flight = useSingleFlight();
  const ready = reason.trim().length >= 10;
  const fail = (failure: ApiFailure) => {
    setError(describeFailure(failure));
    if (failure.kind === "http" && (failure.status === 401 || failure.status === 403)) {
      setReported(undefined);
      setMutes(undefined);
      setChannels(undefined);
    }
  };
  const run = (task: () => Promise<void>) =>
    flight.run(async () => {
      setError(undefined);
      setNotice(undefined);
      await task();
    });
  const loadReports = () =>
    run(async () => {
      const result = await api.communityReports(reason);
      if (result.ok) setReported(result.data.reported);
      else fail(result.error);
    });
  const loadMutes = () =>
    run(async () => {
      const result = await api.communityMutes();
      if (result.ok) setMutes(result.data.mutes);
      else fail(result.error);
    });
  const loadChannels = () =>
    run(async () => {
      const result = await api.communityChannels();
      if (result.ok) setChannels(result.data.channels);
      else fail(result.error);
    });
  const moderate = (id: string, operation: "REMOVE" | "RESTORE" | "DISMISS_REPORTS") =>
    run(async () => {
      const result = await api.moderateCommunity(id, operation, reason);
      if (!result.ok) return fail(result.error);
      setNotice(
        operation === "REMOVE"
          ? "Message removed."
          : operation === "RESTORE"
            ? "Message restored."
            : "Reports dismissed.",
      );
      setRemoved((current) => {
        const next = new Set(current);
        if (operation === "REMOVE") next.add(id);
        else next.delete(id);
        return next;
      });
      if (operation === "DISMISS_REPORTS")
        setReported((current) => current?.filter((item) => item.message.id !== id));
    });
  const mute = (userId: string, hours: number) =>
    run(async () => {
      const result = await api.muteCommunity(userId, hours, reason);
      if (!result.ok) return fail(result.error);
      setNotice(hours ? `Muted until ${when(result.data.muted_until!)}.` : "Mute lifted.");
      if (mutes) {
        const refreshed = await api.communityMutes();
        if (refreshed.ok) setMutes(refreshed.data.mutes);
      }
    });
  const updateChannel = (channel: CommunityStaffChannel, changes: Partial<CommunityStaffChannel>) =>
    run(async () => {
      const result = await api.updateCommunityChannel(channel.id, { ...changes, reason });
      if (!result.ok) return fail(result.error);
      setChannels((current) =>
        current?.map((item) => (item.id === channel.id ? result.data.channel : item)),
      );
      setNotice("Channel updated.");
    });
  const createChannel = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await api.createCommunityChannel({ ...draft, reason });
      if (!result.ok) return fail(result.error);
      setChannels((current) => [...(current ?? []), result.data.channel]);
      setDraft({ name: "", description: "", staff_only_posting: false, position: 100 });
      setNotice("Channel created.");
    });
  };
  return (
    <div className="space-y-6">
      <label className="block text-sm font-medium">
        Reason for this moderation session
        <input
          className={control}
          minLength={10}
          maxLength={240}
          value={reason}
          placeholder="For example: Daily community moderation"
          onChange={(event) => setReason(event.target.value)}
        />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Recorded with every view and action.
        </span>
      </label>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Community management">
        {(
          [
            ["reports", "Reported messages"],
            ["mutes", "Muted members"],
            ["channels", "Channels"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-10 rounded-full border px-4 text-sm font-medium ${tab === id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary/60"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {tab === "reports" && (
        <section className="space-y-4" aria-label="Reported messages">
          <Button disabled={flight.loading || !ready} onClick={() => void loadReports()}>
            Load reported messages
          </Button>
          {reported && !reported.length && (
            <p className="text-sm text-muted-foreground">No open reports.</p>
          )}
          <ul className="space-y-3">
            {reported?.map((item) => {
              const isRemoved = removed.has(item.message.id);
              return (
                <li
                  key={item.message.id}
                  className="space-y-3 rounded-2xl border p-4"
                  aria-label={`Reported message from ${item.message.author.nickname}`}
                >
                  <p className="text-xs text-muted-foreground">
                    #{item.channel_name} · {item.message.author.nickname} · account{" "}
                    {item.message.author_id} · {when(item.message.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap break-words rounded-xl bg-secondary/50 p-3 text-sm">
                    {item.message.body}
                  </p>
                  <ul className="space-y-1 text-xs">
                    {item.reports.map((report) => (
                      <li key={report.id}>
                        <strong>{reportLabels[report.category] ?? report.category}</strong>
                        {report.note ? `: ${report.note}` : ""} · {when(report.created_at)}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    {isRemoved ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={flight.loading || !ready}
                        onClick={() => void moderate(item.message.id, "RESTORE")}
                      >
                        Restore message
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          disabled={flight.loading || !ready}
                          onClick={() => void moderate(item.message.id, "REMOVE")}
                        >
                          Remove message
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={flight.loading || !ready}
                          onClick={() => void moderate(item.message.id, "DISMISS_REPORTS")}
                        >
                          Dismiss reports
                        </Button>
                      </>
                    )}
                    <label className="flex items-center gap-2 text-xs">
                      Mute for
                      <select
                        aria-label="Mute length"
                        className="input h-9"
                        value={muteHours}
                        onChange={(event) => setMuteHours(Number(event.target.value))}
                      >
                        <option value={24}>1 day</option>
                        <option value={72}>3 days</option>
                        <option value={168}>1 week</option>
                        <option value={720}>30 days</option>
                        <option value={8760}>1 year</option>
                      </select>
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={flight.loading || !ready}
                      onClick={() => void mute(item.message.author_id, muteHours)}
                    >
                      Mute author
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === "mutes" && (
        <section className="space-y-4" aria-label="Muted members">
          <Button disabled={flight.loading} onClick={() => void loadMutes()}>
            Load muted members
          </Button>
          {mutes && !mutes.length && (
            <p className="text-sm text-muted-foreground">Nobody is muted.</p>
          )}
          <ul className="space-y-2">
            {mutes?.map((item) => (
              <li
                key={item.user_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
              >
                <span>
                  <strong>{item.nickname ?? "Former member"}</strong> until {when(item.muted_until)}
                  <span className="block text-xs text-muted-foreground">{item.reason}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={flight.loading || !ready}
                  onClick={() => void mute(item.user_id, 0)}
                >
                  Lift mute
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "channels" && (
        <section className="space-y-4" aria-label="Channels">
          <Button disabled={flight.loading} onClick={() => void loadChannels()}>
            Load channels
          </Button>
          <ul className="space-y-2">
            {channels?.map((channel) => (
              <li key={channel.id} className="space-y-2 rounded-xl border p-3 text-sm">
                <p>
                  <strong>{channel.name}</strong>{" "}
                  <span className="text-xs text-muted-foreground">#{channel.slug}</span>
                  {channel.archived && <span className="ml-2 text-xs font-semibold">Archived</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {channel.description || "No description"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={flight.loading || !ready}
                    onClick={() =>
                      void updateChannel(channel, {
                        staff_only_posting: !channel.staff_only_posting,
                      })
                    }
                  >
                    {channel.staff_only_posting ? "Let members post" : "Team posts only"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={flight.loading || !ready}
                    onClick={() => void updateChannel(channel, { archived: !channel.archived })}
                  >
                    {channel.archived ? "Unarchive" : "Archive"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <form onSubmit={createChannel} className="space-y-3 rounded-2xl border p-4">
            <h2 className="font-semibold">Create a channel</h2>
            <label className="block text-sm font-medium">
              Channel name
              <input
                className={control}
                minLength={2}
                maxLength={40}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Description
              <input
                className={control}
                maxLength={200}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.staff_only_posting}
                onChange={(event) =>
                  setDraft({ ...draft, staff_only_posting: event.target.checked })
                }
              />
              Only the team can post
            </label>
            <Button disabled={flight.loading || !ready || draft.name.trim().length < 2}>
              Create channel
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
