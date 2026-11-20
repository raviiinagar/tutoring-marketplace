import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { requestTimeRemaining } from "./request-deadline";

/**
 * Red count on "My messages" in the teaching menu: enquiries that still need a reply.
 * Loaded lazily so the shared header code on public pages stays as small as before.
 */
export default function EnquiryCount({ tutorId }: { tutorId: string }) {
  const enquiries = useQuery({
    queryKey: ["tutor-enquiry-count", tutorId],
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
  if (!waiting) return null;
  return (
    <span className="nav-count">
      {waiting}
      <span className="sr-only">
        {" "}
        {waiting === 1 ? "enquiry" : "enquiries"} waiting for a reply
      </span>
    </span>
  );
}
