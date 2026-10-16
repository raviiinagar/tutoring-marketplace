import { useEffect, useRef, useState, type ReactNode } from "react";

type TimedRequest = { status: string; server_time: string; expires_at: string };
export function RequestDeadline({
  request,
  children,
}: {
  request: TimedRequest;
  children?: (pending: boolean) => ReactNode;
}) {
  const anchor = useRef({ server: request.server_time, start: performance.now() });
  if (anchor.current.server !== request.server_time)
    anchor.current = { server: request.server_time, start: performance.now() };
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const timer = setInterval(() => setElapsed(performance.now() - anchor.current.start), 1000);
    return () => clearInterval(timer);
  }, [request.server_time]);
  const remaining =
    new Date(request.expires_at).getTime() - new Date(request.server_time).getTime() - elapsed;
  const status = request.status === "PENDING" && remaining <= 0 ? "EXPIRED" : request.status;
  return (
    <>
      <p className="mt-2 font-semibold">Status: {status}</p>
      <p className="mt-2 text-sm">
        Response deadline:{" "}
        <time dateTime={request.expires_at}>{new Date(request.expires_at).toLocaleString()}</time>
      </p>
      {status === "PENDING" && remaining <= 24 * 3600000 && (
        <p className="mt-2 text-sm font-medium text-coral-strong">
          Response due in less than 24 hours. This deadline will not be extended.
        </p>
      )}
      {status === "EXPIRED" && (
        <p className="mt-2 text-sm text-muted-foreground">
          The response window has ended. A new enquiry needs current access.
        </p>
      )}
      {children?.(status === "PENDING")}
    </>
  );
}
