import { useEffect, useRef, useState } from "react";
import { requestTimeRemaining } from "@/components/request-deadline";

export function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

type TimedRequest = { status: string; server_time: string; expires_at: string };
/** The live status of an enquiry, anchored to the server clock like RequestDeadline. */
export function useEnquiryState(request: TimedRequest) {
  const anchor = useRef({ server: request.server_time, start: performance.now() });
  if (anchor.current.server !== request.server_time)
    anchor.current = { server: request.server_time, start: performance.now() };
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const timer = setInterval(() => setElapsed(performance.now() - anchor.current.start), 30000);
    return () => clearInterval(timer);
  }, [request.server_time]);
  const remaining = requestTimeRemaining(request, elapsed);
  const status = request.status === "PENDING" && remaining <= 0 ? "EXPIRED" : request.status;
  return { status, remaining };
}
export function timeLeft(ms: number) {
  const hours = Math.ceil(ms / 3600000);
  if (hours <= 1) return "less than an hour";
  if (hours < 24) return `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
export const isPendingNow = (request: TimedRequest, now = 0) =>
  request.status === "PENDING" && requestTimeRemaining(request, now) > 0;
