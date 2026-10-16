import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import {
  guardianVerifier,
  type GuardianVerificationPolicy,
} from "./guardian-verifier.js";
export const reviewDisclaimer =
  "Connection-linked feedback with an adult interaction attestation. Lesson attendance and teaching outcomes are not independently verified.";
export class ReviewPublication {
  constructor(
    private readonly config: Config,
    private readonly policy:
      | Pick<
          GuardianVerificationPolicy,
          "id" | "notice_version" | "consent_version"
        >
      | null
      | undefined = guardianVerifier(config)?.policy,
  ) {}
  private values(ids: string[]) {
    return [
      ids,
      this.config.mode === "production",
      this.policy?.id || "",
      this.policy?.notice_version || "",
      this.policy?.consent_version || "",
    ];
  }
  private selection = `FROM review_public_candidates WHERE tutor_id=ANY($1::uuid[]) AND test_only<>$2::boolean AND (learner_kind='ADULT' OR (policy_id=$3 AND notice_version=$4 AND consent_version=$5))`;
  async summaries(client: PoolClient, ids: string[]) {
    const rows = (
      await client.query(
        `SELECT tutor_id,count(*)::integer AS count,round(avg(rating),2)::float AS average ${this.selection} GROUP BY tutor_id`,
        this.values(ids),
      )
    ).rows;
    return new Map(
      rows.map((row) => [
        row.tutor_id,
        {
          count: row.count,
          average: row.average,
          label: "Connection-linked reviews",
        },
      ]),
    );
  }
  async page(client: PoolClient, tutor: string, cursor?: string) {
    const rows = (
      await client.query(
        `SELECT id,rating,published_text AS text,learner_kind,created_at ${this.selection} AND ($6::uuid IS NULL OR id>$6) ORDER BY id LIMIT 11`,
        [...this.values([tutor]), cursor || null],
      )
    ).rows;
    return {
      reviews: rows
        .slice(0, 10)
        .map((row) => ({
          id: row.id,
          rating: row.rating,
          text: row.text,
          reviewer: row.learner_kind === "CHILD" ? "Guardian" : "Adult learner",
          created_at: row.created_at,
          label: "Connection-linked review",
        })),
      summary: (await this.summaries(client, [tutor])).get(tutor) || {
        count: 0,
        average: null,
        label: "Connection-linked reviews",
      },
      next_cursor: rows.length > 10 ? rows[9].id : null,
      disclaimer: reviewDisclaimer,
    };
  }
}
