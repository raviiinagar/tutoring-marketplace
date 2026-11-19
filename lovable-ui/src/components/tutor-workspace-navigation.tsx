import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { accountSessionKey } from "@/lib/session";
import { useTeachingPresence } from "@/lib/teaching-presence";
import { requestTimeRemaining } from "./request-deadline";

const linkClass = "reference-workspace-link";
const activeProps = { "aria-current": "page", className: "reference-workspace-active" } as const;

/**
 * The teaching workspace navigation (ADR0021). Evaluations appear once an ad is online, and
 * the switch to learning only for accounts that also learn.
 */
export function TutorWorkspaceNavigation() {
  const session = useQuery({
    queryKey: accountSessionKey,
    queryFn: api.me,
    enabled: false,
    retry: false,
  });
  const user = session.data?.ok ? session.data.data.user : null;
  const { summary } = useTeachingPresence();
  const learns = !user || user.roles.includes("LEARNER");
  const online = (summary?.online ?? 0) > 0;
  // Enquiries are not on the dashboard any more, so the menu shows how many still need a reply.
  const tutorId = user?.roles.includes("TUTOR") ? user.id : undefined;
  const enquiries = useQuery({
    queryKey: ["tutor-enquiry-count", tutorId ?? "signed-out"],
    enabled: !!tutorId,
    retry: false,
    staleTime: 30000,
    queryFn: async () => {
      const result = await api.tutorRequests();
      if (!result.ok) return 0;
      return result.data.requests.filter(
        (row) =>
          row.status === "PENDING" &&
          (row.can_accept || row.can_decline) &&
          requestTimeRemaining(row, 0) > 0,
      ).length;
    },
  });
  const waiting = enquiries.data ?? 0;
  return (
    <nav aria-label="Teaching workspace navigation" className="reference-workspace-nav">
      <Link
        to="/tutor/dashboard"
        activeOptions={{ exact: true }}
        activeProps={activeProps}
        className={linkClass}
      >
        Dashboard
      </Link>
      <Link
        to="/connections"
        activeOptions={{ exact: true, includeSearch: false }}
        activeProps={activeProps}
        className={linkClass}
      >
        My messages
        {waiting > 0 && (
          <span className="nav-count">
            {waiting}
            <span className="sr-only">
              {" "}
              {waiting === 1 ? "enquiry" : "enquiries"} waiting for a reply
            </span>
          </span>
        )}
      </Link>
      <Link
        to="/tutor/listings"
        activeOptions={{ exact: true }}
        activeProps={activeProps}
        className={linkClass}
      >
        My ads
      </Link>
      {online && (
        <Link
          to="/tutor/evaluations"
          activeOptions={{ exact: true }}
          activeProps={activeProps}
          className={linkClass}
        >
          Evaluations
        </Link>
      )}
      <Link
        to="/account/settings"
        activeOptions={{ exact: true }}
        activeProps={activeProps}
        className={linkClass}
      >
        My account
      </Link>
      {learns && (
        <Link to="/account" className={`${linkClass} reference-workspace-switch`}>
          Switch to learning
        </Link>
      )}
    </nav>
  );
}
