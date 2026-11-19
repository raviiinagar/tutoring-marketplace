import { useQueries } from "@tanstack/react-query";
import { api, type ClassInvitation, type ConnectionSummary } from "./api";

/** At most this many conversations are checked, so a large inbox never fans out. */
const LIMIT = 6;

export type UpcomingClass = ClassInvitation & { connectionId: string; with: string };

/**
 * The next scheduled class across the account's first few available conversations.
 * Classes are read through each Connection's own authorized endpoint; a failed read
 * simply contributes nothing. "Upcoming" is judged against each response's server time.
 */
export function useUpcomingClasses(
  accountId: string | undefined,
  connections: ConnectionSummary[] | undefined,
) {
  const usable = (connections ?? []).filter((c) => c.available).slice(0, LIMIT);
  const results = useQueries({
    queries: usable.map((c) => ({
      queryKey: ["upcoming-classes", accountId ?? "signed-out", c.id],
      enabled: !!accountId,
      retry: false,
      staleTime: 60000,
      gcTime: 0,
      queryFn: async () => {
        const result = await api.classes(c.id);
        if (!result.ok) return [] as UpcomingClass[];
        const now = new Date(result.data.server_time).getTime();
        return result.data.classes
          .filter((k) => k.status === "SCHEDULED" && new Date(k.ends_at).getTime() > now)
          .map((k) => ({
            ...k,
            connectionId: c.id,
            with: c.peer?.display_name ?? c.offer.title,
          }));
      },
    })),
  });
  const classes = results
    .flatMap((r) => r.data ?? [])
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return {
    classes,
    next: classes[0],
    loading: results.some((r) => r.isPending && r.fetchStatus !== "idle"),
  };
}

export function formatClassTime(iso: string) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
  const time = date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  return `${day} · ${time} IST`;
}
