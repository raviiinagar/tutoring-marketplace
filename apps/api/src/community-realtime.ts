import { Client } from "pg";
import type { Response } from "express";
import type { Config } from "./config.js";
import { CommunityService } from "./community.js";
import { ApiProblem } from "./errors.js";

type Subscription = { channel: string; actor: string; wake: () => void; close: () => void };

/**
 * Server-sent events for a community channel. NOTIFY is only a wakeup: every frame
 * comes from `history`, which re-checks the session, membership and channel.
 */
export class CommunityRealtime {
  private listener?: Client;
  private readonly subscriptions = new Set<Subscription>();
  private stopped = false;
  private reconnect?: ReturnType<typeof setTimeout>;
  constructor(
    private readonly community: CommunityService,
    private readonly config: Config,
  ) {}
  async onModuleInit() {
    await this.listen();
  }
  private async listen() {
    if (this.stopped) return;
    const client = new Client({ connectionString: this.config.databaseUrl, connectionTimeoutMillis: 3000 });
    this.listener = client;
    const retry = () => {
      if (this.listener !== client || this.stopped) return;
      this.listener = undefined;
      void client.end().catch(() => {});
      this.reconnect = setTimeout(() => void this.listen(), 3000);
    };
    client.on("error", retry);
    client.on("end", retry);
    client.on("notification", (event) => {
      for (const subscription of this.subscriptions) if (subscription.channel === event.payload) subscription.wake();
    });
    try {
      await client.connect();
      await client.query("LISTEN community_changed");
    } catch {
      retry();
    }
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.reconnect);
    for (const subscription of [...this.subscriptions]) subscription.close();
    await this.listener?.end().catch(() => {});
  }
  async open(token: string | undefined, actor: string, channel: string, after: number, response: Response) {
    let cursor = after,
      busy = false,
      dirty = false,
      closed = false,
      started = false,
      lastWrite = Date.now();
    let interval: ReturnType<typeof setInterval> | undefined;
    let subscription: Subscription | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(interval);
      if (subscription) this.subscriptions.delete(subscription);
      response.off("close", close);
      response.end();
    };
    const write = (frame: string) => {
      if (closed) return;
      // A client that stops reading is dropped rather than buffered without limit.
      if (!response.write(frame)) close();
      lastWrite = Date.now();
    };
    const fetch = () => this.community.history(token, channel, { after: cursor });
    const deliver = (state: Awaited<ReturnType<typeof fetch>>) => {
      if (state.messages.length || !started) {
        write(`id: ${state.cursor}\nevent: changes\ndata: ${JSON.stringify(state)}\n\n`);
        started = true;
      } else if (Date.now() - lastWrite > 15000) write(": keepalive\n\n");
      cursor = state.cursor;
      if (state.has_more) dirty = true;
    };
    const tick = async () => {
      if (closed) return;
      if (busy) {
        dirty = true;
        return;
      }
      busy = true;
      dirty = false;
      try {
        deliver(await fetch());
      } catch (error) {
        const denied = error instanceof ApiProblem && [401, 403, 404].includes(error.getStatus());
        write(`event: ${denied ? "access-revoked" : "reconnect"}\ndata: ${JSON.stringify({ code: denied ? "ACCESS_UNAVAILABLE" : "RECONNECT_REQUIRED" })}\n\n`);
        close();
      } finally {
        busy = false;
        if (dirty && !closed) setImmediate(() => void tick());
      }
    };
    // The first read authorizes the stream before any header is sent, so failures are ordinary JSON errors.
    const first = await fetch();
    if (this.stopped || this.subscriptions.size >= 300 || [...this.subscriptions].filter((s) => s.actor === actor).length >= 4)
      throw new ApiProblem(429, "COMMUNITY_STREAM_LIMIT", "Close another community tab before opening this one.");
    subscription = { channel, actor, wake: () => void tick(), close };
    this.subscriptions.add(subscription);
    response.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    response.flushHeaders();
    response.on("close", close);
    deliver(first);
    interval = setInterval(() => void tick(), 5000);
    if (dirty) setImmediate(() => void tick());
  }
}
