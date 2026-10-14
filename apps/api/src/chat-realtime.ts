import { Client } from "pg";
import type { Response } from "express";
import type { Config } from "./config.js";
import { ChatService } from "./chat.js";
import { ApiProblem } from "./errors.js";

type Subscription = {
  connection: string;
  actor: string;
  wake: () => void;
  close: () => void;
};
/** NOTIFY is only a wakeup. Every payload comes from committed, reauthorized history. */
export class ChatRealtime {
  private listener?: Client;
  private readonly subscriptions = new Set<Subscription>();
  private stopped = false;
  private reconnect?: ReturnType<typeof setTimeout>;
  constructor(
    private readonly chat: ChatService,
    private readonly config: Config,
  ) {}
  async onModuleInit() {
    await this.listen();
  }
  private async listen() {
    if (this.stopped) return;
    const client = new Client({
      connectionString: this.config.databaseUrl,
      connectionTimeoutMillis: 3000,
    });
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
      for (const subscription of this.subscriptions)
        if (
          event.channel === "chat_authority_changed" ||
          subscription.connection === event.payload
        )
          subscription.wake();
    });
    try {
      await client.connect();
      await client.query("LISTEN chat_changed");
      await client.query("LISTEN chat_authority_changed");
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
  async open(
    token: string | undefined,
    id: string,
    after: number,
    response: Response,
  ) {
    let cursor = after,
      busy = false,
      dirty = false,
      closed = false,
      blocked = false,
      lastState = "",
      lastWrite = Date.now(),
      blockedAt = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    let subscription: Subscription | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(interval);
      if (subscription) this.subscriptions.delete(subscription);
      response.off("close", close);
      response.off("drain", drain);
      response.end();
    };
    const write = (frame: string) => {
      if (closed) return;
      if (!response.write(frame)) {
        blocked = true;
        blockedAt = Date.now();
      }
      lastWrite = Date.now();
    };
    const drain = () => {
      blocked = false;
      void tick();
    };
    const deliver = (
      state: Awaited<ReturnType<ChatService["history"]>>,
      actor: string,
    ) => {
      if (closed) return;
      if (!subscription) {
        if (
          this.stopped ||
          this.subscriptions.size >= 200 ||
          [...this.subscriptions].filter((s) => s.actor === actor).length >= 4
        )
          throw new ApiProblem(
            429,
            "CHAT_STREAM_LIMIT",
            "Close another chat tab before opening this one.",
          );
        subscription = {
          connection: id,
          actor,
          wake: () => void tick(),
          close,
        };
        this.subscriptions.add(subscription);
        response
          .status(200)
          .set({
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          });
        response.flushHeaders();
      }
      const signature = JSON.stringify([
        state.next_after,
        state.read_sequence,
        state.peer_read_sequence,
        state.unread_count,
      ]);
      if (signature !== lastState) {
        write(
          `id: ${state.next_after}\nevent: state\ndata: ${JSON.stringify(state)}\n\n`,
        );
        lastState = signature;
        cursor = state.next_after;
      } else if (Date.now() - lastWrite > 15000) write(": keepalive\n\n");
      if (state.has_more) dirty = true;
    };
    const tick = async () => {
      if (closed) return;
      if (blocked) {
        if (Date.now() - blockedAt > 10000) close();
        return;
      }
      if (busy) {
        dirty = true;
        return;
      }
      busy = true;
      dirty = false;
      try {
        await this.chat.withState(
          token,
          id,
          { after: cursor, limit: 100 },
          deliver,
        );
      } catch (error) {
        if (!closed) {
          const denied =
            error instanceof ApiProblem &&
            [401, 403, 404].includes(error.getStatus());
          write(
            `event: ${denied ? "access-revoked" : "reconnect"}\ndata: ${JSON.stringify({ code: denied ? "ACCESS_UNAVAILABLE" : "RECONNECT_REQUIRED" })}\n\n`,
          );
          close();
        }
      } finally {
        busy = false;
        if (dirty && !closed && !blocked) setImmediate(() => void tick());
      }
    };
    response.on("close", close);
    response.on("drain", drain);
    try {
      busy = true;
      await this.chat.withState(
        token,
        id,
        { after: cursor, limit: 100 },
        deliver,
      );
    } catch (error) {
      response.off("close", close);
      response.off("drain", drain);
      if (subscription) close();
      throw error;
    } finally {
      busy = false;
    }
    if (!closed) {
      interval = setInterval(() => void tick(), 2000);
      if (dirty) setImmediate(() => void tick());
    }
  }
}
