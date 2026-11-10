import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import type { Config } from "./config.js";
import { ApiProblem } from "./errors.js";
import { encrypt, decrypt } from "./security.js";

// Beta community chat (ADR0017). Signed-in accounts join with an 18+ confirmation,
// a nickname and the community rules. There are no private messages; Tutors and
// Learners cannot swap contact details here; staff with the TRUST scope moderate.
export const rulesVersion = "2026-11-10";
export const reactionKinds = ["THUMBS_UP", "HEART", "LAUGH", "CELEBRATE", "THINKING", "EYES"] as const;
const contactPattern =
  /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d|(?:whatsapp|telegram|instagram|snapchat|signal)\s*[:@]|@[a-z][\w.]{2,})/i;
const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const noContact = "Keep emails, phone numbers, social handles and links out of the community.";
export const messageBody = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((v) => !controlCharacters.test(v), "Remove control characters.")
  .refine((v) => !contactPattern.test(v), noContact);
const nickname = z
  .string()
  .trim()
  .transform((v) => v.normalize("NFKC").replace(/\s+/g, " "))
  .pipe(z.string().min(2).max(30))
  .refine((v) => /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(v), "Use letters, numbers, spaces, dots, dashes or underscores.")
  .refine((v) => !contactPattern.test(v), noContact)
  .refine((v) => !/\b(team|staff|admin|moderator|official)\b/i.test(v), "Choose a nickname that doesn't look like a team account.");
export const joinInput = z.strictObject({
  nickname,
  adult_confirmed: z.literal(true),
  rules_accepted: z.literal(true),
});
export const nicknameInput = z.strictObject({ nickname });
export const postInput = z.strictObject({
  request_key: z.uuid(),
  body: messageBody,
  reply_to: z.uuid().optional(),
});
export const historyQuery = z
  .strictObject({
    before: z.uuid().optional(),
    after: z.coerce.number().int().min(0).optional(),
  })
  .refine((v) => v.before === undefined || v.after === undefined, "Use either before or after.");
export const reactionInput = z.strictObject({ emoji: z.enum(reactionKinds) });
export const reportInput = z.strictObject({
  category: z.enum(["SPAM", "HARASSMENT", "CONTACT_DETAILS", "INAPPROPRIATE", "OTHER"]),
  note: z.string().trim().max(500).refine((v) => !controlCharacters.test(v), "Remove control characters.").optional(),
});
export const staffReason = z.string().trim().min(10).max(240);
export const moderationInput = z.strictObject({
  operation: z.enum(["REMOVE", "RESTORE", "PIN", "UNPIN", "DISMISS_REPORTS"]),
  reason: staffReason,
});
export const muteInput = z.strictObject({
  user_id: z.uuid(),
  hours: z.number().int().min(0).max(8760),
  reason: staffReason,
});
const channelFields = {
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(200),
  staff_only_posting: z.boolean(),
  position: z.number().int().min(0).max(1000),
};
export const channelCreate = z.strictObject({ ...channelFields, reason: staffReason });
export const channelUpdate = z
  .strictObject({
    name: channelFields.name.optional(),
    description: channelFields.description.optional(),
    staff_only_posting: channelFields.staff_only_posting.optional(),
    position: channelFields.position.optional(),
    archived: z.boolean().optional(),
    reason: staffReason,
  })
  .refine((v) => Object.keys(v).length > 1, "Change at least one channel field.");

type Row = Record<string, any>;
const missing = (what = "Message") => new ApiProblem(404, "NOT_FOUND", `${what} not found.`);
const pageSize = 50;
const messageColumns = `m.*,cm.nickname,
  EXISTS(SELECT 1 FROM staff_accounts s WHERE s.user_id=m.author_id AND s.enabled) AS team,
  r.id AS reply_id,r.status AS reply_status,r.encrypted_body AS reply_body,rcm.nickname AS reply_nickname`;
const messageJoins = `FROM community_messages m
  LEFT JOIN community_members cm ON cm.user_id=m.author_id
  LEFT JOIN community_messages r ON r.id=m.reply_to
  LEFT JOIN community_members rcm ON rcm.user_id=r.author_id`;

export class CommunityService {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  get enabled() {
    return this.config.betaCommunity ?? this.config.mode !== "production";
  }
  requireEnabled() {
    if (!this.enabled) throw new ApiProblem(404, "FEATURE_DISABLED", "The community is not available.");
  }
  private get hideFixtures() {
    return this.config.mode === "production";
  }
  policy() {
    return {
      enabled: this.enabled,
      rules_version: rulesVersion,
      reactions: reactionKinds,
      max_message_length: 1000,
      rules: [
        "You must be 18 or older. Parents take part from their own account; don't share details about children.",
        "Be respectful. No harassment, hate, spam or adult content.",
        "Don't share phone numbers, emails, social handles or links. Use enquiries to contact a Tutor.",
        "Don't post passwords, payment details or other people's personal information.",
        "Account or payment problems belong in Support, not here.",
        "The team can remove messages and mute accounts that break these rules.",
      ],
    };
  }
  private async audit(client: PoolClient, actor: string, event: string, target: string, metadata: Row = {}) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), actor, event, randomUUID(), this.now(), { target, ...metadata }],
    );
  }
  private notify(client: PoolClient, channelId: string) {
    return client.query("SELECT pg_notify('community_changed',$1)", [channelId]);
  }
  private text(payload: any) {
    return decrypt<{ body: string }>(payload, this.config.authSecret).body;
  }
  private async mute(client: PoolClient, userId: string) {
    return (await client.query("SELECT muted_until FROM community_mutes WHERE user_id=$1 AND muted_until>$2", [userId, this.now()]))
      .rows[0]?.muted_until as Date | undefined;
  }
  private async membership(client: PoolClient, userId: string) {
    return (await client.query("SELECT * FROM community_members WHERE user_id=$1 AND left_at IS NULL", [userId])).rows[0];
  }
  private async member(client: PoolClient, token: string | undefined) {
    const { user } = await this.auth.authenticated(client, token);
    const member = await this.membership(client, user.id);
    if (!member) throw new ApiProblem(403, "COMMUNITY_JOIN_REQUIRED", "Join the community first.");
    return { user, member };
  }
  // Writers lock the channel row so change sequences commit in the order they are issued,
  // which keeps a reader's "after" cursor from skipping a slower concurrent write.
  private async channel(client: PoolClient, id: string, lock = false) {
    const row = (await client.query(`SELECT * FROM community_channels WHERE id=$1 AND NOT archived${lock ? " FOR UPDATE" : ""}`, [id])).rows[0];
    if (!row) throw missing("Channel");
    return row;
  }
  private async isTeam(client: PoolClient, userId: string) {
    return !!(await client.query("SELECT 1 FROM staff_accounts WHERE user_id=$1 AND enabled", [userId])).rowCount;
  }
  private async views(client: PoolClient, rows: Row[], viewer: string) {
    const ids = rows.map((row) => row.id);
    const reactions = ids.length
      ? (
          await client.query(
            "SELECT message_id,emoji,count(*)::integer AS count,bool_or(user_id=$2) AS mine FROM community_reactions WHERE message_id=ANY($1::uuid[]) GROUP BY message_id,emoji ORDER BY emoji",
            [ids, viewer],
          )
        ).rows
      : [];
    return rows.map((row) => {
      const visible = row.status === "VISIBLE";
      return {
        id: row.id,
        channel_id: row.channel_id,
        author: { nickname: row.nickname ?? "Former member", team: row.team, own: row.author_id === viewer },
        body: visible ? this.text(row.encrypted_body) : null,
        status: row.status,
        pinned: row.pinned,
        reply_to: row.reply_id
          ? {
              id: row.reply_id,
              nickname: row.reply_nickname ?? "Former member",
              excerpt: row.reply_status === "VISIBLE" ? this.text(row.reply_body).slice(0, 120) : null,
            }
          : null,
        reactions: visible
          ? reactions.filter((r) => r.message_id === row.id).map((r) => ({ emoji: r.emoji, count: r.count, mine: r.mine }))
          : [],
        change_seq: Number(row.change_seq),
        created_at: row.created_at,
      };
    });
  }
  async overview(token: string | undefined) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      const member = await this.membership(client, user.id);
      const team = await this.isTeam(client, user.id);
      const channels = member
        ? (
            await client.query(
              `SELECT c.id,c.slug,c.name,c.description,c.staff_only_posting,
                 (SELECT max(m.created_at) FROM community_messages m WHERE m.channel_id=c.id AND m.status='VISIBLE' AND (NOT $1::boolean OR NOT m.test_only)) AS last_message_at
               FROM community_channels c WHERE NOT c.archived ORDER BY c.position,c.name`,
              [this.hideFixtures],
            )
          ).rows.map((c) => ({ ...c, can_post: !c.staff_only_posting || team }))
        : [];
      const mutedUntil = member ? await this.mute(client, user.id) : undefined;
      return {
        policy: this.policy(),
        member: member ? { nickname: member.nickname, team, muted_until: mutedUntil ?? null } : null,
        channels,
      };
    });
  }
  async join(token: string | undefined, input: z.infer<typeof joinInput>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      await this.auth.limits.consume("community-join", user.id, 5, 86400000, client);
      await client.query(
        `INSERT INTO community_members(user_id,nickname,adult_confirmed_at,rules_accepted_at,rules_version,created_at,updated_at)
         VALUES($1,$2,$3,$3,$4,$3,$3)
         ON CONFLICT(user_id) DO UPDATE SET nickname=$2,adult_confirmed_at=$3,rules_accepted_at=$3,rules_version=$4,left_at=NULL,updated_at=$3`,
        [user.id, input.nickname, this.now(), rulesVersion],
      );
      await this.audit(client, user.id, "COMMUNITY_JOINED", user.id, { rules_version: rulesVersion });
      return { member: { nickname: input.nickname } };
    });
  }
  async rename(token: string | undefined, input: z.infer<typeof nicknameInput>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.member(client, token);
      await this.auth.limits.consume("community-nickname", user.id, 5, 86400000, client);
      // Earlier messages show the new nickname the next time a channel is loaded.
      await client.query("UPDATE community_members SET nickname=$2,updated_at=$3 WHERE user_id=$1", [user.id, input.nickname, this.now()]);
      return { member: { nickname: input.nickname } };
    });
  }
  async leave(token: string | undefined) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.member(client, token);
      await client.query("UPDATE community_members SET left_at=$2,updated_at=$2 WHERE user_id=$1", [user.id, this.now()]);
      await this.audit(client, user.id, "COMMUNITY_LEFT", user.id);
      return { member: null };
    });
  }
  private async cursor(client: PoolClient, channelId: string) {
    return Number(
      (await client.query("SELECT coalesce(max(change_seq),0) AS seq FROM community_messages WHERE channel_id=$1", [channelId])).rows[0].seq,
    );
  }
  /** Reauthorizes the member, then returns latest, older or changed messages. Used by the stream too. */
  async history(token: string | undefined, channelId: string, query: z.infer<typeof historyQuery>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.member(client, token);
      const channel = await this.channel(client, channelId);
      const fixtures = this.hideFixtures;
      if (query.after !== undefined) {
        const rows = (
          await client.query(
            `SELECT ${messageColumns} ${messageJoins}
             WHERE m.channel_id=$1 AND m.change_seq>$2 AND (NOT $3::boolean OR NOT m.test_only)
             ORDER BY m.change_seq LIMIT 201`,
            [channel.id, query.after, fixtures],
          )
        ).rows;
        const page = rows.slice(0, 200);
        return {
          messages: await this.views(client, page, user.id),
          cursor: page.length ? Number(page.at(-1)!.change_seq) : query.after,
          has_more: rows.length > 200,
        };
      }
      let anchor: Row | undefined;
      if (query.before) {
        anchor = (await client.query("SELECT sequence FROM community_messages WHERE id=$1 AND channel_id=$2", [query.before, channel.id]))
          .rows[0];
        if (!anchor) throw missing();
      }
      const rows = (
        await client.query(
          `SELECT ${messageColumns} ${messageJoins}
           WHERE m.channel_id=$1 AND (NOT $2::boolean OR NOT m.test_only)
             AND ($3::bigint IS NULL OR m.sequence<$3)
           ORDER BY m.sequence DESC LIMIT ${pageSize + 1}`,
          [channel.id, fixtures, anchor?.sequence ?? null],
        )
      ).rows;
      const page = rows.slice(0, pageSize).reverse();
      return {
        messages: await this.views(client, page, user.id),
        cursor: await this.cursor(client, channel.id),
        has_older: rows.length > pageSize,
      };
    });
  }
  async pins(token: string | undefined, channelId: string) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.member(client, token);
      const channel = await this.channel(client, channelId);
      const rows = (
        await client.query(
          `SELECT ${messageColumns} ${messageJoins} WHERE m.channel_id=$1 AND m.pinned AND m.status='VISIBLE' AND (NOT $2::boolean OR NOT m.test_only) ORDER BY m.sequence DESC LIMIT 20`,
          [channel.id, this.hideFixtures],
        )
      ).rows;
      return { messages: await this.views(client, rows, user.id) };
    });
  }
  private async teamPoster(client: PoolClient, account: string | undefined, staffToken: string | undefined) {
    let failure: unknown;
    for (const scope of ["TRUST", "SUPPORT"] as const) {
      try {
        return await this.staff.authorize(client, account, staffToken, scope);
      } catch (error) {
        failure = error;
      }
    }
    throw failure instanceof ApiProblem && failure.getStatus() === 401
      ? failure
      : new ApiProblem(403, "TEAM_ONLY_CHANNEL", "Only the team can post in this channel. Verify staff access first.");
  }
  async post(token: string | undefined, staffToken: string | undefined, channelId: string, input: z.infer<typeof postInput>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.member(client, token);
      const channel = await this.channel(client, channelId, true);
      const old = (await client.query("SELECT * FROM community_messages WHERE author_id=$1 AND request_key=$2", [user.id, input.request_key]))
        .rows[0];
      if (old) {
        if (old.channel_id !== channel.id || this.text(old.encrypted_body) !== input.body || (old.reply_to ?? undefined) !== input.reply_to)
          throw new ApiProblem(409, "MESSAGE_CONFLICT", "This request key belongs to another message.");
        const replay = (await client.query(`SELECT ${messageColumns} ${messageJoins} WHERE m.id=$1`, [old.id])).rows;
        return { message: (await this.views(client, replay, user.id))[0], replayed: true };
      }
      const muted = await this.mute(client, user.id);
      if (muted) throw new ApiProblem(403, "MUTED", `You can post again after ${muted.toISOString()}.`);
      if (channel.staff_only_posting) await this.teamPoster(client, token, staffToken);
      if (input.reply_to) {
        const parent = (await client.query("SELECT channel_id FROM community_messages WHERE id=$1", [input.reply_to])).rows[0];
        if (!parent || parent.channel_id !== channel.id) throw missing("The message you replied to");
      }
      await this.auth.limits.consume("community-post-minute", user.id, 8, 60000, client);
      await this.auth.limits.consume("community-post-day", user.id, 300, 86400000, client);
      const id = randomUUID();
      await client.query(
        `INSERT INTO community_messages(id,channel_id,author_id,request_key,reply_to,encrypted_body,test_only,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [id, channel.id, user.id, input.request_key, input.reply_to ?? null, encrypt({ body: input.body }, this.config.authSecret), this.config.mode !== "production", this.now()],
      );
      await this.notify(client, channel.id);
      const rows = (await client.query(`SELECT ${messageColumns} ${messageJoins} WHERE m.id=$1`, [id])).rows;
      return { message: (await this.views(client, rows, user.id))[0], replayed: false };
    });
  }
  private async message(client: PoolClient, id: string) {
    const row = (await client.query("SELECT * FROM community_messages WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!row || (this.hideFixtures && row.test_only)) throw missing();
    return row;
  }
  private async touch(client: PoolClient, row: Row, sets = "", params: unknown[] = []) {
    await client.query("SELECT 1 FROM community_channels WHERE id=$1 FOR UPDATE", [row.channel_id]);
    await client.query(
      `UPDATE community_messages SET ${sets}${sets ? "," : ""}change_seq=nextval('community_change_seq'),updated_at=$${params.length + 2} WHERE id=$1`,
      [row.id, ...params, this.now()],
    );
    await this.notify(client, row.channel_id);
  }
  async remove(token: string | undefined, id: string) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.member(client, token);
      const row = await this.message(client, id);
      if (row.author_id !== user.id) throw missing();
      if (row.status === "VISIBLE") await this.touch(client, row, "status='DELETED_BY_AUTHOR',pinned=false");
      return { deleted: true };
    });
  }
  async react(token: string | undefined, id: string, emoji: (typeof reactionKinds)[number], on: boolean) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.member(client, token);
      const row = await this.message(client, id);
      await this.channel(client, row.channel_id);
      if (row.status !== "VISIBLE") throw missing();
      if (on) {
        const muted = await this.mute(client, user.id);
        if (muted) throw new ApiProblem(403, "MUTED", `You can react again after ${muted.toISOString()}.`);
        await this.auth.limits.consume("community-react", user.id, 120, 3600000, client);
      }
      const changed = on
        ? (
            await client.query(
              "INSERT INTO community_reactions(message_id,user_id,emoji,created_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
              [id, user.id, emoji, this.now()],
            )
          ).rowCount
        : (await client.query("DELETE FROM community_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3", [id, user.id, emoji])).rowCount;
      if (changed) await this.touch(client, row);
      const rows = (await client.query(`SELECT ${messageColumns} ${messageJoins} WHERE m.id=$1`, [id])).rows;
      return { message: (await this.views(client, rows, user.id))[0] };
    });
  }
  async report(token: string | undefined, id: string, input: z.infer<typeof reportInput>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const { user } = await this.member(client, token);
      const row = await this.message(client, id);
      if (row.author_id === user.id) throw new ApiProblem(409, "OWN_MESSAGE", "You can delete your own message instead.");
      await this.auth.limits.consume("community-report", user.id, 20, 86400000, client);
      await client.query(
        `INSERT INTO community_reports(id,message_id,reporter_id,category,encrypted_note,created_at) VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(message_id,reporter_id) DO NOTHING`,
        [randomUUID(), id, user.id, input.category, encrypt({ note: input.note ?? "" }, this.config.authSecret), this.now()],
      );
      return { reported: true };
    });
  }

  // Staff moderation: TRUST scope with MFA. Every view and action records a reason.
  async reports(account: string | undefined, staffToken: string | undefined, reason: string) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(client, account, staffToken, "TRUST");
      const reports = (
        await client.query(
          `SELECT p.*,m.channel_id FROM community_reports p JOIN community_messages m ON m.id=p.message_id
           WHERE p.status='OPEN' AND (NOT $1::boolean OR NOT m.test_only) ORDER BY p.created_at LIMIT 300`,
          [this.hideFixtures],
        )
      ).rows;
      const ids = [...new Set(reports.map((r) => r.message_id))].slice(0, 100);
      const rows = ids.length
        ? (
            await client.query(
              `SELECT ${messageColumns},c.name AS channel_name ${messageJoins} JOIN community_channels c ON c.id=m.channel_id WHERE m.id=ANY($1::uuid[])`,
              [ids],
            )
          ).rows
        : [];
      await this.audit(client, actor.id, "COMMUNITY_REPORTS_VIEWED", actor.id, { reason });
      const views = await this.views(client, rows, actor.id);
      return {
        reported: ids.map((id) => {
          const row = rows.find((r) => r.id === id)!;
          const view = views.find((v) => v.id === id)!;
          return {
            message: { ...view, body: this.text(row.encrypted_body), author_id: row.author_id },
            channel_name: row.channel_name,
            reports: reports
              .filter((r) => r.message_id === id)
              .map((r) => ({
                id: r.id,
                category: r.category,
                note: decrypt<{ note: string }>(r.encrypted_note, this.config.authSecret).note || null,
                created_at: r.created_at,
              })),
          };
        }),
      };
    });
  }
  async moderate(account: string | undefined, staffToken: string | undefined, id: string, input: z.infer<typeof moderationInput>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(client, account, staffToken, "TRUST");
      const row = await this.message(client, id);
      const conflict = (message: string) => new ApiProblem(409, "MESSAGE_STATE_CHANGED", message);
      switch (input.operation) {
        case "REMOVE":
          if (row.status === "REMOVED_BY_STAFF") throw conflict("This message is already removed.");
          await this.touch(client, row, "status='REMOVED_BY_STAFF',pinned=false");
          await client.query(
            "UPDATE community_reports SET status='ACTIONED',resolved_by=$2,resolved_at=$3 WHERE message_id=$1 AND status='OPEN'",
            [id, actor.id, this.now()],
          );
          break;
        case "RESTORE":
          if (row.status !== "REMOVED_BY_STAFF") throw conflict("Only a message removed by staff can be restored.");
          await this.touch(client, row, "status='VISIBLE'");
          break;
        case "PIN":
        case "UNPIN":
          if (row.status !== "VISIBLE") throw conflict("Only a visible message can be pinned.");
          if (row.pinned === (input.operation === "PIN")) throw conflict(input.operation === "PIN" ? "Already pinned." : "Not pinned.");
          await this.touch(client, row, "pinned=$2", [input.operation === "PIN"]);
          break;
        case "DISMISS_REPORTS":
          if (
            !(
              await client.query(
                "UPDATE community_reports SET status='DISMISSED',resolved_by=$2,resolved_at=$3 WHERE message_id=$1 AND status='OPEN'",
                [id, actor.id, this.now()],
              )
            ).rowCount
          )
            throw conflict("There are no open reports for this message.");
          break;
      }
      await this.audit(client, actor.id, "COMMUNITY_MESSAGE_" + input.operation, id, { reason: input.reason, author: row.author_id });
      return { done: true };
    });
  }
  async setMute(account: string | undefined, staffToken: string | undefined, input: z.infer<typeof muteInput>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(client, account, staffToken, "TRUST", [input.user_id]);
      if (actor.id === input.user_id) throw new ApiProblem(403, "SELF_MODERATION", "You can't mute your own account.");
      if (!(await client.query("SELECT 1 FROM community_members WHERE user_id=$1", [input.user_id])).rowCount) throw missing("Member");
      if (input.hours === 0) await client.query("DELETE FROM community_mutes WHERE user_id=$1", [input.user_id]);
      else
        await client.query(
          `INSERT INTO community_mutes(user_id,muted_until,reason,muted_by,created_at) VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(user_id) DO UPDATE SET muted_until=$2,reason=$3,muted_by=$4,created_at=$5`,
          [input.user_id, new Date(this.now().getTime() + input.hours * 3600000), input.reason, actor.id, this.now()],
        );
      await this.audit(client, actor.id, input.hours ? "COMMUNITY_MEMBER_MUTED" : "COMMUNITY_MEMBER_UNMUTED", input.user_id, {
        reason: input.reason,
        hours: input.hours,
      });
      return { muted_until: input.hours ? await this.mute(client, input.user_id) : null };
    });
  }
  async mutes(account: string | undefined, staffToken: string | undefined) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      await this.staff.authorize(client, account, staffToken, "TRUST");
      return {
        mutes: (
          await client.query(
            "SELECT x.user_id,m.nickname,x.muted_until,x.reason,x.created_at FROM community_mutes x LEFT JOIN community_members m ON m.user_id=x.user_id WHERE x.muted_until>$1 ORDER BY x.muted_until DESC",
            [this.now()],
          )
        ).rows,
      };
    });
  }
  async staffChannels(account: string | undefined, staffToken: string | undefined) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      await this.staff.authorize(client, account, staffToken, "TRUST");
      return {
        channels: (
          await client.query(
            "SELECT id,slug,name,description,staff_only_posting,archived,position,updated_at FROM community_channels ORDER BY archived,position,name",
          )
        ).rows,
      };
    });
  }
  async createChannel(account: string | undefined, staffToken: string | undefined, input: z.infer<typeof channelCreate>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(client, account, staffToken, "TRUST");
      const slug = input.name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/g, "");
      if (!slug) throw new ApiProblem(400, "VALIDATION_ERROR", "Use letters or numbers in the channel name.");
      if ((await client.query("SELECT 1 FROM community_channels WHERE slug=$1", [slug])).rowCount)
        throw new ApiProblem(409, "CHANNEL_EXISTS", "A channel with that name already exists.");
      const id = randomUUID();
      await client.query(
        "INSERT INTO community_channels(id,slug,name,description,staff_only_posting,position,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7)",
        [id, slug, input.name, input.description, input.staff_only_posting, input.position, this.now()],
      );
      await this.audit(client, actor.id, "COMMUNITY_CHANNEL_CREATED", id, { reason: input.reason, name: input.name });
      return { channel: (await client.query("SELECT * FROM community_channels WHERE id=$1", [id])).rows[0] };
    });
  }
  async updateChannel(account: string | undefined, staffToken: string | undefined, id: string, input: z.infer<typeof channelUpdate>) {
    this.requireEnabled();
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(client, account, staffToken, "TRUST");
      const row = (await client.query("SELECT * FROM community_channels WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!row) throw missing("Channel");
      const next = { ...row, ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== "reason")) };
      await client.query(
        "UPDATE community_channels SET name=$2,description=$3,staff_only_posting=$4,position=$5,archived=$6,updated_at=$7 WHERE id=$1",
        [id, next.name, next.description, next.staff_only_posting, next.position, next.archived, this.now()],
      );
      await this.notify(client, id);
      const { reason, ...changes } = input;
      await this.audit(client, actor.id, "COMMUNITY_CHANNEL_UPDATED", id, { reason, changes });
      return { channel: (await client.query("SELECT * FROM community_channels WHERE id=$1", [id])).rows[0] };
    });
  }
}
