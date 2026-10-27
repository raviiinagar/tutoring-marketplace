import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscribeChat } from "@/lib/api";

class Stream {
  static latest: Stream;
  listeners = new Map<string, (event: MessageEvent) => void>();
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    Stream.latest = this;
  }
  addEventListener(name: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(name, listener);
  }
  state(data: unknown) {
    this.listeners.get("state")?.(new MessageEvent("state", { data: JSON.stringify(data) }));
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", Stream);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps a working event stream without making fallback requests", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  const receive = vi.fn(),
    disconnect = vi.fn();
  const stop = subscribeChat("connection", 7, receive, disconnect);
  Stream.latest.state({ next_after: 8, messages: [] });
  await vi.advanceTimersByTimeAsync(10000);
  expect(receive).toHaveBeenCalledOnce();
  expect(fetcher).not.toHaveBeenCalled();
  expect(disconnect).not.toHaveBeenCalled();
  stop();
});
it("receives new messages through authenticated history when the proxy never delivers a frame", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({
        next_after: 8,
        messages: [{ sequence: 8, text: "Fictional test message" }],
        has_more: false,
      }),
    )
    .mockResolvedValueOnce(Response.json({ next_after: 8, messages: [], has_more: false }));
  const receive = vi.fn(),
    disconnect = vi.fn();
  const stop = subscribeChat("connection", 7, receive, disconnect);
  await vi.advanceTimersByTimeAsync(3000);
  expect(Stream.latest.close).toHaveBeenCalled();
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({ next_after: 8 }));
  expect(String(fetcher.mock.calls[0]?.[0])).toContain("/messages?after=7&limit=100");
  expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe("include");
  await vi.advanceTimersByTimeAsync(2000);
  expect(String(fetcher.mock.calls[1]?.[0])).toContain("/messages?after=8&limit=100");
  expect(disconnect).not.toHaveBeenCalled();
  stop();
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("revokes access and stops polling when the history endpoint denies the participant", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json(
        { code: "CONNECTION_UNAVAILABLE", message: "Access unavailable" },
        { status: 403 },
      ),
    );
  const receive = vi.fn(),
    disconnect = vi.fn();
  subscribeChat("connection", 0, receive, disconnect);
  await vi.advanceTimersByTimeAsync(10000);
  expect(disconnect).toHaveBeenCalledExactlyOnceWith(true);
  expect(receive).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
});
it("does not deliver a late history response after leaving the conversation", async () => {
  let resolve: ((value: Response) => void) | undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const receive = vi.fn(),
    disconnect = vi.fn();
  const stop = subscribeChat("connection", 0, receive, disconnect);
  await vi.advanceTimersByTimeAsync(3000);
  stop();
  resolve?.(Response.json({ next_after: 1, messages: [], has_more: false }));
  await vi.advanceTimersByTimeAsync(10000);
  expect(receive).not.toHaveBeenCalled();
  expect(disconnect).not.toHaveBeenCalled();
});
