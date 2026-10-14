import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Config } from "./config.js";
import { ConnectionsService } from "./connections.js";
import { encrypt, decrypt } from "./security.js";
import { ApiProblem } from "./errors.js";
import { Database } from "./database.js";
import { RateLimiter } from "./rate-limit.js";

export const chatMessageInput = z.strictObject({
  client_message_id: z.uuid(),
  text: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      "Remove control characters.",
    ),
});
export const chatReadInput = z.strictObject({
  sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
const cursor = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .transform(Number)
  .pipe(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER));
export const chatHistoryInput = z
  .strictObject({
    after: cursor.optional(),
    before: cursor.optional(),
    limit: cursor.pipe(z.number().min(1).max(100)).optional(),
  })
  .refine(
    (value) => value.after === undefined || value.before === undefined,
    "Use one cursor.",
  );
export type HistoryQuery = z.infer<typeof chatHistoryInput>;
type MessageInput = z.infer<typeof chatMessageInput>;
type Row = Record<string, any>;
export class ChatService {
  private readonly limiter: RateLimiter;
  constructor(
    private readonly connections: ConnectionsService,
    private readonly config: Config,
    database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.limiter = new RateLimiter(database, config.authSecret, now);
  }
  private async conversation(client: PoolClient, connectionId: string) {
    const row = (
      await client.query(
        "SELECT * FROM conversations WHERE connection_id=$1 FOR UPDATE",
        [connectionId],
      )
    ).rows[0];
    if (!row) throw new ApiProblem(404, "NOT_FOUND", "Conversation not found.");
    return row;
  }
  private message(row: Row, actor: string, tutor: string) {
    return {
      sequence: Number(row.sequence),
      client_message_id: row.client_message_id,
      text: decrypt<{ text: string }>(
        row.encrypted_text,
        this.config.authSecret,
      ).text,
      sender_role: row.sender_id === tutor ? "TUTOR" : "PAYER",
      your_message: row.sender_id === actor,
      created_at: new Date(row.created_at).toISOString(),
    };
  }
  private async readState(
    client: PoolClient,
    conversationId: string,
    actor: string,
    peer: string,
  ) {
    const positions = (
      await client.query(
        "SELECT user_id,last_read_sequence FROM conversation_read_positions WHERE conversation_id=$1 AND user_id=ANY($2::uuid[])",
        [conversationId, [actor, peer]],
      )
    ).rows;
    const read_sequence = Number(
      positions.find((row) => row.user_id === actor)?.last_read_sequence || 0,
    );
    const peer_read_sequence = Number(
      positions.find((row) => row.user_id === peer)?.last_read_sequence || 0,
    );
    const unread_count = Number(
      (
        await client.query(
          "SELECT count(*) FROM conversation_messages WHERE conversation_id=$1 AND sender_id<>$2 AND sequence>$3",
          [conversationId, actor, read_sequence],
        )
      ).rows[0].count,
    );
    return { read_sequence, peer_read_sequence, unread_count };
  }
  async send(
    token: string | undefined,
    connectionId: string,
    input: MessageInput,
    correlation: string,
  ) {
    return this.connections.withConnection(
      token,
      connectionId,
      async (client, context) => {
        const conversation = await this.conversation(client, connectionId);
        const at = this.now();
        const prior = (
          await client.query(
            "SELECT * FROM conversation_messages WHERE conversation_id=$1 AND sender_id=$2 AND client_message_id=$3",
            [conversation.id, context.actor.id, input.client_message_id],
          )
        ).rows[0];
        if (prior) {
          if (
            decrypt<{ text: string }>(
              prior.encrypted_text,
              this.config.authSecret,
            ).text !== input.text
          )
            throw new ApiProblem(
              409,
              "IDEMPOTENCY_CONFLICT",
              "This message identifier was already used for different text.",
            );
          return {
            message: this.message(
              prior,
              context.actor.id,
              context.request.tutor_id,
            ),
            replayed: true,
          };
        }
        await this.limiter.consume(
          "chat-send",
          context.actor.id,
          60,
          60000,
          client,
        );
        const next = (
          await client.query(
            "UPDATE conversations SET last_sequence=last_sequence+1 WHERE id=$1 RETURNING last_sequence",
            [conversation.id],
          )
        ).rows[0].last_sequence;
        const row = (
          await client.query(
            "INSERT INTO conversation_messages(conversation_id,sequence,sender_id,client_message_id,encrypted_text,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              conversation.id,
              next,
              context.actor.id,
              input.client_message_id,
              encrypt({ text: input.text }, this.config.authSecret),
              at,
            ],
          )
        ).rows[0];
        await client.query(
          "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            context.actor.id,
            "CHAT_MESSAGE_SENT",
            correlation,
            at,
            { target: connectionId, sequence: Number(next) },
          ],
        );
        await client.query("SELECT pg_notify('chat_changed',$1)", [
          connectionId,
        ]);
        return {
          message: this.message(
            row,
            context.actor.id,
            context.request.tutor_id,
          ),
          replayed: false,
        };
      },
    );
  }
  async history(
    token: string | undefined,
    connectionId: string,
    query: HistoryQuery = {},
  ) {
    return this.withState(token, connectionId, query, (state) => state);
  }
  async withState<T>(
    token: string | undefined,
    connectionId: string,
    query: HistoryQuery,
    consume: (
      state: Awaited<ReturnType<ChatService["state"]>>,
      actor: string,
    ) => T,
  ) {
    return this.connections.withConnection(
      token,
      connectionId,
      async (client, context) => {
        const conversation = await this.conversation(client, connectionId);
        const state = await this.state(
          client,
          conversation,
          connectionId,
          context.actor.id,
          context.request,
          context.learner.kind,
          query,
        );
        // Synchronous consumers enqueue realtime bytes while current authority locks are held.
        return consume(state, context.actor.id);
      },
    );
  }
  private async state(
    client: PoolClient,
    conversation: Row,
    connectionId: string,
    actor: string,
    request: Row,
    learnerKind: string,
    query: HistoryQuery,
  ) {
    const last = Number(conversation.last_sequence);
    if (
      (query.after !== undefined && query.after > last) ||
      (query.before !== undefined && query.before > last + 1)
    )
      throw new ApiProblem(
        400,
        "INVALID_CURSOR",
        "Message cursor exceeds this conversation.",
      );
    const limit = query.limit ?? 50;
    const forward = query.after !== undefined;
    const fetched = (
      await client.query(
        `SELECT * FROM conversation_messages WHERE conversation_id=$1 AND sequence>$2 AND sequence<$3 ORDER BY sequence ${forward ? "ASC" : "DESC"} LIMIT $4`,
        [
          conversation.id,
          query.after ?? 0,
          query.before ?? last + 1,
          limit + 1,
        ],
      )
    ).rows;
    const rows = fetched.slice(0, limit);
    if (!forward) rows.reverse();
    const state = await this.readState(
      client,
      conversation.id,
      actor,
      actor === request.tutor_id ? request.payer_id : request.tutor_id,
    );
    return {
      connection_id: connectionId,
      conversation_id: conversation.id,
      offer_title: request.offer_snapshot.title,
      your_role: actor === request.tutor_id ? "TUTOR" : "PAYER",
      learner_kind: learnerKind,
      messages: rows.map((row) => this.message(row, actor, request.tutor_id)),
      last_sequence: last,
      next_after: rows.length
        ? Number(rows.at(-1)!.sequence)
        : (query.after ?? last),
      has_more: forward && fetched.length > limit,
      has_older: rows.length ? Number(rows[0].sequence) > 1 : false,
      ...state,
    };
  }
  async markRead(
    token: string | undefined,
    connectionId: string,
    sequence: number,
  ) {
    return this.connections.withConnection(
      token,
      connectionId,
      async (client, context) => {
        const conversation = await this.conversation(client, connectionId);
        if (sequence > Number(conversation.last_sequence))
          throw new ApiProblem(
            400,
            "INVALID_READ_POSITION",
            "Read position cannot exceed the recorded conversation.",
          );
        await client.query(
          "INSERT INTO conversation_read_positions(conversation_id,user_id,last_read_sequence,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_sequence=EXCLUDED.last_read_sequence,updated_at=EXCLUDED.updated_at WHERE conversation_read_positions.last_read_sequence<EXCLUDED.last_read_sequence",
          [conversation.id, context.actor.id, sequence, this.now()],
        );
        await client.query("SELECT pg_notify('chat_changed',$1)", [
          connectionId,
        ]);
        return this.readState(
          client,
          conversation.id,
          context.actor.id,
          context.actor.id === context.request.tutor_id
            ? context.request.payer_id
            : context.request.tutor_id,
        );
      },
    );
  }
}
