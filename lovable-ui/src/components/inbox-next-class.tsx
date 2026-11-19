import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { api, type ClassInvitations } from "@/lib/api";
import { formatClassTime } from "@/lib/upcoming-class";

/**
 * A slim strip above the chat with the next planned class, or the next step when none is
 * planned. Tutors plan classes; the adult Learner sees the time and joins from Classes.
 * It reads the Connection's own authorized classes endpoint and shows nothing on failure.
 */
export function InboxNextClass({ connectionId }: { connectionId: string }) {
  const [data, setData] = useState<{ id: string; value: ClassInvitations }>();
  useEffect(() => {
    let live = true;
    void api.classes(connectionId).then((result) => {
      if (live && result.ok) setData({ id: connectionId, value: result.data });
    });
    return () => {
      live = false;
    };
  }, [connectionId]);
  if (!data || data.id !== connectionId) return null;
  const { value } = data;
  const now = new Date(value.server_time).getTime();
  const next = value.classes
    .filter((k) => k.status === "SCHEDULED" && new Date(k.ends_at).getTime() > now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
  const tutor = value.viewer_role === "TUTOR";
  return (
    <div className="inbox-next" role="note" aria-label="Next class">
      <span className="inbox-next-tile" aria-hidden="true">
        {next || !tutor ? (
          <CalendarClock className="size-5" />
        ) : (
          <CalendarPlus className="size-5" />
        )}
      </span>
      <p>
        {next ? (
          <>
            <b>Next class: {formatClassTime(next.starts_at)}</b>
            <span className="inbox-next-more">
              {next.title} · {next.duration_minutes} min · Google Meet
            </span>
          </>
        ) : tutor ? (
          <>
            <b>No class planned yet</b>
            <span className="inbox-next-more">Pick a time and add your Google Meet link.</span>
          </>
        ) : (
          <>
            <b>No class planned yet</b>
            <span className="inbox-next-more">
              Your Tutor will add the time and Google Meet link here.
            </span>
          </>
        )}
      </p>
      {(next || tutor) && (
        <Link
          to="/connections"
          search={{ conversation: connectionId, view: "classes" }}
          resetScroll={false}
          className="inbox-next-action"
        >
          {next ? "View class" : "Plan a class"}
        </Link>
      )}
    </div>
  );
}
