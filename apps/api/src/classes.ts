import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Config } from "./config.js";
import { ConnectionsService } from "./connections.js";
import { ApiProblem } from "./errors.js";
import { decrypt, encrypt, tokenHash } from "./security.js";

export const googleMeetUrl = z
  .string()
  .trim()
  .max(1000)
  .transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "meet.google.com" ||
        url.port ||
        url.username ||
        url.password ||
        !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(url.pathname)
      )
        throw Error();
      return "https://meet.google.com" + url.pathname.toLowerCase();
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "Use a Google Meet link like https://meet.google.com/abc-defg-hij.",
      });
      return z.NEVER;
    }
  });
const fields = {
  title: z
    .string()
    .trim()
    .min(5, "Enter a class title of at least 5 characters.")
    .max(120),
  meet_url: googleMeetUrl,
  starts_at: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value).toISOString()),
  duration_minutes: z.number().int().min(15).max(240),
};
export const createClassInput = z.strictObject({
  ...fields,
  request_key: z.uuid(),
});
export const editClassInput = z.strictObject({
  ...fields,
  revision: z.number().int().positive(),
});
export const classRevisionInput = z.strictObject({
  revision: z.number().int().positive(),
});
type Details = z.infer<typeof createClassInput>;
type Row = Record<string, any>;
const problem = (code: string, message: string, status = 409) =>
  new ApiProblem(status, code, message);

export class ClassesService {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly config: Config,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private future(starts: string) {
    const difference = new Date(starts).getTime() - this.now().getTime();
    if (difference <= 0 || difference > 366 * 86400000)
      throw problem(
        "CLASS_TIME_INVALID",
        "Choose a future class time within the next year.",
        400,
      );
  }
  private teacher(actor: string, tutor: string) {
    if (actor !== tutor)
      throw problem(
        "TUTOR_ONLY",
        "Only the Tutor in this Connection can schedule or change a class.",
        403,
      );
  }
  private view(row: Row, tutor: boolean) {
    const payload = decrypt<{ title: string; meet_url: string | null }>(
        row.encrypted_payload,
        this.config.authSecret,
      ),
      start = new Date(row.starts_at),
      end = new Date(start.getTime() + row.duration_minutes * 60000),
      at = this.now().getTime();
    return {
      id: row.id,
      title: payload.title,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      duration_minutes: row.duration_minutes,
      status: row.status,
      revision: row.revision,
      updated_at: new Date(row.updated_at).toISOString(),
      can_join:
        row.status === "SCHEDULED" &&
        !!payload.meet_url &&
        at >= start.getTime() - 15 * 60000 &&
        at <= end.getTime() + 15 * 60000,
      ...(tutor && row.status === "SCHEDULED"
        ? { meet_url: payload.meet_url }
        : {}),
    };
  }
  private async row(client: PoolClient, connection: string, id: string) {
    const row = (
      await client.query(
        "SELECT * FROM class_invitations WHERE id=$1 AND connection_id=$2 FOR UPDATE",
        [id, connection],
      )
    ).rows[0];
    if (!row)
      throw problem("NOT_FOUND", "Class not found in this Connection.", 404);
    return row;
  }
  private async audit(
    client: PoolClient,
    user: string,
    event: string,
    id: string,
    correlation: string,
  ) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), user, event, correlation, this.now(), { target: id }],
    );
  }
  list(token: string | undefined, id: string) {
    return this.connections.withConnection(token, id, async (client, c) => ({
      viewer_role: c.actor.id === c.request.tutor_id ? "TUTOR" : "PAYER",
      server_time: this.now().toISOString(),
      classes: (
        await client.query(
          "SELECT * FROM class_invitations WHERE connection_id=$1 ORDER BY starts_at DESC,id DESC LIMIT 200",
          [id],
        )
      ).rows.map((row) => this.view(row, c.actor.id === c.request.tutor_id)),
    }));
  }
  create(
    token: string | undefined,
    id: string,
    input: Details,
    correlation: string,
  ) {
    return this.connections.withConnection(token, id, async (client, c) => {
      this.teacher(c.actor.id, c.request.tutor_id);
      const hash = tokenHash(JSON.stringify(input));
      const previous = (
        await client.query(
          "SELECT * FROM class_invitations WHERE connection_id=$1 AND request_key=$2 FOR UPDATE",
          [id, input.request_key],
        )
      ).rows[0];
      if (previous) {
        if (previous.payload_hash !== hash)
          throw problem(
            "CLASS_RETRY_CHANGED",
            "This save key was already used for different class details. Refresh and try again.",
          );
        return { class: this.view(previous, true), replayed: true };
      }
      this.future(input.starts_at);
      if (
        Number(
          (
            await client.query(
              "SELECT count(*) FROM class_invitations WHERE connection_id=$1 AND status='SCHEDULED' AND starts_at>$2",
              [id, this.now()],
            )
          ).rows[0].count,
        ) >= 50
      )
        throw problem(
          "CLASS_LIMIT",
          "At most 50 upcoming classes can be scheduled for this Connection.",
        );
      const result = await client.query(
        "INSERT INTO class_invitations(id,connection_id,created_by,request_key,payload_hash,encrypted_payload,starts_at,duration_minutes,status,revision,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'SCHEDULED',1,$9,$9) RETURNING *",
        [
          randomUUID(),
          id,
          c.actor.id,
          input.request_key,
          hash,
          encrypt(
            { title: input.title, meet_url: input.meet_url },
            this.config.authSecret,
          ),
          input.starts_at,
          input.duration_minutes,
          this.now(),
        ],
      );
      await this.audit(
        client,
        c.actor.id,
        "CLASS_INVITATION_CREATED",
        result.rows[0].id,
        correlation,
      );
      return { class: this.view(result.rows[0], true), replayed: false };
    });
  }
  edit(
    token: string | undefined,
    connection: string,
    id: string,
    input: z.infer<typeof editClassInput>,
    correlation: string,
  ) {
    return this.connections.withConnection(
      token,
      connection,
      async (client, c) => {
        this.teacher(c.actor.id, c.request.tutor_id);
        const row = await this.row(client, connection, id);
        if (row.revision !== input.revision)
          throw problem(
            "CLASS_CHANGED",
            "This class changed. Refresh its status before editing.",
          );
        if (row.status !== "SCHEDULED")
          throw problem(
            "CLASS_CANCELLED",
            "A cancelled class cannot be rescheduled. Create another class.",
          );
        if (new Date(row.starts_at) <= this.now())
          throw problem(
            "CLASS_ALREADY_STARTED",
            "This class time has started. Schedule a new class instead.",
          );
        this.future(input.starts_at);
        const result = await client.query(
          "UPDATE class_invitations SET encrypted_payload=$2,starts_at=$3,duration_minutes=$4,revision=revision+1,updated_at=$5 WHERE id=$1 RETURNING *",
          [
            id,
            encrypt(
              { title: input.title, meet_url: input.meet_url },
              this.config.authSecret,
            ),
            input.starts_at,
            input.duration_minutes,
            this.now(),
          ],
        );
        await this.audit(
          client,
          c.actor.id,
          "CLASS_INVITATION_UPDATED",
          id,
          correlation,
        );
        return { class: this.view(result.rows[0], true) };
      },
    );
  }
  cancel(
    token: string | undefined,
    connection: string,
    id: string,
    revision: number,
    correlation: string,
  ) {
    return this.connections.withConnection(
      token,
      connection,
      async (client, c) => {
        this.teacher(c.actor.id, c.request.tutor_id);
        const row = await this.row(client, connection, id);
        if (row.revision !== revision)
          throw problem(
            "CLASS_CHANGED",
            "This class changed. Refresh its status before cancelling.",
          );
        if (row.status === "CANCELLED") return { class: this.view(row, true) };
        const result = await client.query(
          "UPDATE class_invitations SET status='CANCELLED',revision=revision+1,updated_at=$2 WHERE id=$1 RETURNING *",
          [id, this.now()],
        );
        await this.audit(
          client,
          c.actor.id,
          "CLASS_INVITATION_CANCELLED",
          id,
          correlation,
        );
        return { class: this.view(result.rows[0], true) };
      },
    );
  }
  join(
    token: string | undefined,
    connection: string,
    id: string,
    correlation: string,
  ) {
    return this.connections.withConnection(
      token,
      connection,
      async (client, c) => {
        const row = await this.row(client, connection, id),
          view = this.view(row, c.actor.id === c.request.tutor_id);
        if (row.status === "CANCELLED")
          throw problem(
            "CLASS_CANCELLED",
            "This class was cancelled. Ask your Tutor for another time.",
          );
        if (!view.can_join)
          throw problem(
            "CLASS_NOT_JOINABLE",
            "Join opens 15 minutes before the class and closes 15 minutes after its scheduled end.",
          );
        const payload = decrypt<{ meet_url: string }>(
            row.encrypted_payload,
            this.config.authSecret,
          ),
          url = googleMeetUrl.parse(payload.meet_url);
        await this.audit(
          client,
          c.actor.id,
          "CLASS_MEETING_LINK_RELEASED",
          id,
          correlation,
        );
        return { url };
      },
    );
  }
}
