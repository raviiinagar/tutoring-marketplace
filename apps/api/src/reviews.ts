import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import { ConnectionsService } from "./connections.js";
import type { Config } from "./config.js";
import { ApiProblem } from "./errors.js";
import { encrypt, decrypt } from "./security.js";
import { testCoverage } from "./paid-access.js";
const text = z
  .string()
  .trim()
  .min(30)
  .max(1500)
  .refine(
    (v) =>
      !/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d|[\u0000-\u001f\u007f])/.test(
        v,
      ),
    "Keep contact details, links and private information out of public reviews.",
  );
export const reviewInput = z.strictObject({
  request_key: z.uuid(),
  rating: z.number().int().min(1).max(5),
  text,
  interaction_attested: z.literal(true),
  policy_version: z.literal("review-v1"),
});
export const reviewReason = z.string().trim().min(10).max(240);
export const moderationInput = z.strictObject({
  revision: z.number().int().positive(),
  outcome: z.enum(["PUBLISH", "REJECT", "REMOVE"]),
  policy_code: z.enum([
    "POLICY_COMPLIANT",
    "PERSONAL_DATA",
    "ABUSE",
    "IRRELEVANT",
    "UNSUPPORTED_CLAIMS",
  ]),
  reason: reviewReason,
});
type Row = Record<string, any>;
const conflict = (code: string, message: string) =>
  new ApiProblem(409, code, message);
export class ReviewsService {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly connections: ConnectionsService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private project(row: Row) {
    return {
      id: row.id,
      connection_id: row.connection_id,
      rating: row.rating,
      text: decrypt<{ text: string }>(
        row.encrypted_text,
        this.config.authSecret,
      ).text,
      status: row.status,
      revision: row.revision,
      created_at: row.created_at,
      test_only: row.test_only,
      policy_version: row.policy_version,
    };
  }
  private audit(
    client: PoolClient,
    actor: string,
    event: string,
    id: string,
    metadata: Row = {},
  ) {
    return client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        actor,
        event,
        randomUUID(),
        this.now(),
        { target: id, ...metadata },
      ],
    );
  }
  async context(token: string | undefined, id: string) {
    return this.connections.withReview(token, id, async (client, c) => {
      if (c.actor.id !== c.request.payer_id)
        throw new ApiProblem(
          403,
          "PAYER_REQUIRED",
          "Only the connected adult Learner or Guardian may submit a review.",
        );
      const row = (
        await client.query(
          "SELECT * FROM connection_reviews WHERE author_id=$1 AND tutor_id=$2",
          [c.actor.id, c.request.tutor_id],
        )
      ).rows[0];
      const eligibleAt = new Date(
        new Date(c.connection.created_at).getTime() + 7 * 86400000,
      );
      return {
        eligible: !row && this.now() >= eligibleAt,
        eligible_at: eligibleAt.toISOString(),
        server_time: this.now().toISOString(),
        review: row ? this.project(row) : null,
        policy_version: "review-v1",
        policy:
          "Confirm actual interaction. Be specific and fair. Keep names of children, private documents, contacts and links out of your review. The same policy applies to positive and negative feedback.",
      };
    });
  }
  async submit(
    token: string | undefined,
    id: string,
    input: z.infer<typeof reviewInput>,
  ) {
    return this.connections.withReview(token, id, async (client, c) => {
      if (
        c.actor.id !== c.request.payer_id ||
        c.actor.id === c.request.tutor_id
      )
        throw new ApiProblem(
          403,
          "PAYER_REQUIRED",
          "Only the connected adult Learner or Guardian may submit a review.",
        );
      const old = (
        await client.query(
          "SELECT * FROM connection_reviews WHERE author_id=$1 AND (tutor_id=$2 OR request_key=$3) FOR UPDATE",
          [c.actor.id, c.request.tutor_id, input.request_key],
        )
      ).rows[0];
      if (old) {
        const previous = decrypt<{ text: string }>(
          old.encrypted_text,
          this.config.authSecret,
        );
        if (
          old.request_key === input.request_key &&
          old.connection_id === id &&
          old.rating === input.rating &&
          previous.text === input.text
        )
          return { review: this.project(old), replayed: true };
        throw conflict(
          "REVIEW_EXISTS",
          "One review is allowed per adult and Tutor relationship.",
        );
      }
      if (
        this.now().getTime() <
        new Date(c.connection.created_at).getTime() + 7 * 86400000
      )
        throw conflict(
          "REVIEW_TOO_EARLY",
          "Reviews open seven days after this Connection was established.",
        );
      const row = (
        await client.query(
          "INSERT INTO connection_reviews(id,connection_id,author_id,tutor_id,request_key,rating,encrypted_text,interaction_attested_at,policy_version,test_only,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING',$8,$8) RETURNING *",
          [
            randomUUID(),
            id,
            c.actor.id,
            c.request.tutor_id,
            input.request_key,
            input.rating,
            encrypt({ text: input.text }, this.config.authSecret),
            this.now(),
            input.policy_version,
            testCoverage(c.request.coverage_snapshot),
          ],
        )
      ).rows[0];
      await this.audit(client, c.actor.id, "REVIEW_SUBMITTED", row.id);
      return { review: this.project(row), replayed: false };
    });
  }
  async own(token: string | undefined) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const rows = (
        await client.query(
          "SELECT * FROM connection_reviews WHERE (author_id=$1 OR tutor_id=$1) AND (NOT $2::boolean OR NOT test_only) ORDER BY created_at DESC,id LIMIT 50",
          [user.id, this.config.mode === "production"],
        )
      ).rows;
      const reviews = [];
      for (const row of rows) {
        const decisions = (
          await client.query(
            "SELECT id,revision,outcome,policy_code,reason,created_at FROM review_decisions WHERE review_id=$1 ORDER BY revision",
            [row.id],
          )
        ).rows;
        const appeals = (
          await client.query(
            "SELECT id,review_revision,status,created_at FROM review_appeals WHERE review_id=$1 AND actor_id=$2 ORDER BY created_at",
            [row.id, user.id],
          )
        ).rows;
        reviews.push({
          ...this.project(row),
          text:
            user.id === row.author_id || row.status === "PUBLISHED"
              ? this.project(row).text
              : null,
          relationship: user.id === row.author_id ? "AUTHOR" : "TUTOR",
          decisions,
          appeals,
        });
      }
      return { reviews };
    });
  }
  private async member(
    client: PoolClient,
    token: string | undefined,
    id: string,
  ) {
    const found = (
      await client.query("SELECT * FROM connection_reviews WHERE id=$1", [id])
    ).rows[0];
    const { user } = await this.auth.safetyIdentity(
      client,
      token,
      found ? [found.author_id, found.tutor_id] : [],
    );
    if (
      !found ||
      ![found.author_id, found.tutor_id].includes(user.id) ||
      (this.config.mode === "production" && found.test_only)
    )
      throw new ApiProblem(404, "NOT_FOUND", "Review not found.");
    return {
      user,
      row: (
        await client.query(
          "SELECT * FROM connection_reviews WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0],
    };
  }
  private async decision(
    client: PoolClient,
    row: Row,
    actor: string,
    status: string,
    outcome: string,
    code: string,
    reason: string,
  ) {
    const revision = row.revision + 1;
    const content =
      status === "PUBLISHED"
        ? decrypt<{ text: string }>(row.encrypted_text, this.config.authSecret)
            .text
        : null;
    const changed = (
      await client.query(
        "UPDATE connection_reviews SET status=$2,revision=$3,published_text=$4,updated_at=$5 WHERE id=$1 RETURNING *",
        [row.id, status, revision, content, this.now()],
      )
    ).rows[0];
    await client.query(
      "INSERT INTO review_decisions(id,review_id,actor_id,revision,outcome,policy_code,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        row.id,
        actor,
        revision,
        outcome,
        code,
        reason,
        this.now(),
      ],
    );
    await this.audit(client, actor, "REVIEW_" + outcome, row.id, {
      revision,
      policy_code: code,
    });
    return { review: this.project(changed) };
  }
  async withdraw(token: string | undefined, id: string, revision: number) {
    return this.database.transaction(async (client) => {
      const { user, row } = await this.member(client, token, id);
      if (user.id !== row.author_id)
        throw new ApiProblem(404, "NOT_FOUND", "Review not found.");
      if (row.status === "WITHDRAWN")
        return { review: this.project(row), replayed: true };
      if (row.revision !== revision)
        throw conflict(
          "STALE_REVIEW",
          "Refresh the current review before changing it.",
        );
      return this.decision(
        client,
        row,
        user.id,
        "WITHDRAWN",
        "WITHDRAW",
        "AUTHOR_REQUEST",
        "Withdrawn by its author",
      );
    });
  }
  async queue(
    account: string | undefined,
    elevated: string | undefined,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "TRUST",
      );
      await this.audit(client, user.id, "REVIEW_QUEUE_READ", "review-queue", {
        reason,
      });
      return {
        reviews: (
          await client.query(
            "SELECT id,rating,status,revision,created_at,test_only FROM connection_reviews WHERE NOT $1::boolean OR NOT test_only ORDER BY CASE WHEN status='PENDING' THEN 0 ELSE 1 END,created_at DESC,id LIMIT 100",
            [this.config.mode === "production"],
          )
        ).rows,
        policy:
          "Apply the same relevance, privacy, abuse and unsupported-claim checks to all ratings. Negative feedback is not a removal reason.",
      };
    });
  }
  private async reviewer(
    client: PoolClient,
    account: string | undefined,
    elevated: string | undefined,
    id: string,
  ) {
    const found = (
      await client.query("SELECT * FROM connection_reviews WHERE id=$1", [id])
    ).rows[0];
    const user = await this.staff.authorize(
      client,
      account,
      elevated,
      "TRUST",
      found ? [found.author_id, found.tutor_id] : [],
    );
    if (!found || (this.config.mode === "production" && found.test_only))
      throw new ApiProblem(404, "NOT_FOUND", "Review not found.");
    if ([found.author_id, found.tutor_id].includes(user.id))
      throw new ApiProblem(
        403,
        "SELF_REVIEW_FORBIDDEN",
        "A different Trust reviewer must moderate this feedback.",
      );
    return { user, row: found };
  }
  async inspect(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const { user, row } = await this.reviewer(client, account, elevated, id);
      await this.audit(client, user.id, "REVIEW_INSPECTED", id, { reason });
      return {
        review: this.project(row),
        decisions: (
          await client.query(
            "SELECT id,revision,outcome,policy_code,reason,created_at FROM review_decisions WHERE review_id=$1 ORDER BY revision",
            [id],
          )
        ).rows,
      };
    });
  }
  async moderate(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    input: z.infer<typeof moderationInput>,
  ) {
    return this.database.transaction(async (client) => {
      const { user, row: found } = await this.reviewer(
        client,
        account,
        elevated,
        id,
      );
      if (
        input.outcome === "PUBLISH" &&
        !(await this.connections.reviewEligible(
          client,
          found.connection_id,
          found.author_id,
        ))
      )
        throw conflict(
          "REVIEW_SOURCE_UNAVAILABLE",
          "The current Connection or consent is unavailable.",
        );
      const row = (
        await client.query(
          "SELECT * FROM connection_reviews WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (row.revision !== input.revision)
        throw conflict(
          "STALE_REVIEW",
          "Refresh the current review before deciding.",
        );
      if (
        input.outcome === "REMOVE"
          ? row.status !== "PUBLISHED"
          : row.status !== "PENDING"
      )
        throw conflict(
          "REVIEW_STATE_CHANGED",
          "This review cannot enter that moderation state.",
        );
      if (
        (input.outcome === "PUBLISH") !==
        (input.policy_code === "POLICY_COMPLIANT")
      )
        throw new ApiProblem(
          400,
          "POLICY_REASON_REQUIRED",
          "Publish compliant feedback; identify a policy violation for rejection or removal.",
        );
      return this.decision(
        client,
        row,
        user.id,
        input.outcome === "PUBLISH"
          ? "PUBLISHED"
          : input.outcome === "REJECT"
            ? "REJECTED"
            : "REMOVED",
        input.outcome,
        input.policy_code,
        input.reason,
      );
    });
  }

  // Reopening an appeal returns feedback to moderation; it never publishes it.
  async resolveAppealWithin(
    client: PoolClient,
    account: string | undefined,
    elevated: string | undefined,
    appealId: string,
    operation: "UPHOLD" | "REOPEN_REVIEW" | "SUPERSEDED",
    reason: string,
  ) {
    const appeal = (
      await client.query("SELECT * FROM review_appeals WHERE id=$1", [appealId])
    ).rows[0];
    if (!appeal) throw new ApiProblem(404, "NOT_FOUND", "Appeal not found.");
    const { user } = await this.reviewer(
      client,
      account,
      elevated,
      appeal.review_id,
    );
    const row = (
      await client.query(
        "SELECT * FROM connection_reviews WHERE id=$1 FOR UPDATE",
        [appeal.review_id],
      )
    ).rows[0];
    if (appeal.status !== "PENDING")
      throw conflict("APPEAL_CLOSED", "This appeal already has a decision.");
    if (operation === "SUPERSEDED") {
      if (row.revision === appeal.review_revision)
        throw conflict(
          "APPEAL_CURRENT",
          "The appealed outcome is still current.",
        );
    } else {
      if (row.revision !== appeal.review_revision)
        throw conflict(
          "STALE_REVIEW",
          "The review has changed. Refresh and record this appeal as superseded.",
        );
      if (operation === "REOPEN_REVIEW") {
        if (!["REJECTED", "REMOVED"].includes(row.status))
          throw conflict(
            "APPEAL_ACTION_UNAVAILABLE",
            "Only rejected or removed feedback can return to moderation.",
          );
        await this.decision(
          client,
          row,
          user.id,
          "PENDING",
          "REOPEN_REVIEW",
          "APPEAL_RECONSIDERATION",
          reason,
        );
      }
    }
    await client.query(
      "UPDATE review_appeals SET status='RESOLVED' WHERE id=$1",
      [appealId],
    );
    return {
      review_id: row.id,
      appealed_revision: appeal.review_revision,
      outcome: operation,
    };
  }
  async appeal(
    token: string | undefined,
    id: string,
    input: { request_key: string; revision: number; description: string },
  ) {
    return this.database.transaction(async (client) => {
      const { user, row } = await this.member(client, token, id);
      const old = (
        await client.query(
          "SELECT * FROM review_appeals WHERE actor_id=$1 AND request_key=$2",
          [user.id, input.request_key],
        )
      ).rows[0];
      if (old) {
        if (
          old.review_id !== id ||
          old.review_revision !== input.revision ||
          decrypt<{ description: string }>(
            old.encrypted_description,
            this.config.authSecret,
          ).description !== input.description
        )
          throw conflict(
            "APPEAL_KEY_CONFLICT",
            "Use the same key only for the original appeal.",
          );
        return {
          appeal: {
            id: old.id,
            status: old.status,
            review_revision: old.review_revision,
          },
          replayed: true,
        };
      }
      if (row.revision !== input.revision)
        throw conflict(
          "STALE_REVIEW",
          "Refresh the current moderation outcome before appealing.",
        );
      if (!["PUBLISHED", "REJECTED", "REMOVED"].includes(row.status))
        throw conflict(
          "APPEAL_UNAVAILABLE",
          "An appeal requires a current moderation outcome.",
        );
      if (
        (
          await client.query(
            "SELECT 1 FROM review_appeals WHERE review_id=$1 AND actor_id=$2 AND review_revision=$3",
            [id, user.id, row.revision],
          )
        ).rowCount
      )
        throw conflict(
          "APPEAL_EXISTS",
          "An appeal is already recorded for this outcome.",
        );
      const appeal = (
        await client.query(
          "INSERT INTO review_appeals(id,review_id,actor_id,request_key,review_revision,encrypted_description,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,review_revision",
          [
            randomUUID(),
            id,
            user.id,
            input.request_key,
            row.revision,
            encrypt({ description: input.description }, this.config.authSecret),
            this.now(),
          ],
        )
      ).rows[0];
      await this.audit(client, user.id, "REVIEW_APPEAL_RECORDED", id, {
        appeal_id: appeal.id,
        revision: row.revision,
      });
      return { appeal, replayed: false };
    });
  }
}
