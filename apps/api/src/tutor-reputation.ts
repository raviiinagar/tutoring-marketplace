import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AuthService } from "./auth.js";
import { Database } from "./database.js";
import { StaffService, staffCookieName } from "./staff.js";
import { PublicTutors } from "./public-tutors.js";
import { sessionCookieName, type Config } from "./config.js";
import { ApiProblem } from "./errors.js";
import { decrypt, encrypt } from "./security.js";
import { requireSafetyClear } from "./safety-permissions.js";
import { isAdult } from "./tutors.js";
const publicText = z
  .string()
  .trim()
  .min(40)
  .max(1500)
  .refine(
    (v) =>
      !/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d)/i.test(
        v,
      ),
    "Keep contact details and links out of recommendations.",
  );
export const recommendationInput = z.strictObject({
  relationship: z.enum(["FORMER_STUDENT", "COLLEAGUE", "FAMILY", "OTHER"]),
  text: publicText,
  interaction_attested: z.literal(true),
});
export const recommendationDecision = z.strictObject({
  revision: z.number().int().positive(),
  outcome: z.enum(["PUBLISH", "REJECT", "REMOVE"]),
  reason: z.string().trim().min(10).max(240),
});
const reasonInput = z.string().trim().min(10).max(240);
const criterion = (
  status: "MET" | "NOT_MET" | "UNVERIFIED",
  detail: string,
) => ({ status, detail });
const met = (value: boolean, detail: string) =>
  criterion(value ? "MET" : "NOT_MET", detail);
export function deriveTutorLevel(facts: {
  public_eligible: boolean;
  recommendations: number;
  quality_ready: boolean;
}) {
  return facts.public_eligible
    ? facts.recommendations >= 2 && facts.quality_ready
      ? "EXPERIENCED"
      : "NEW"
    : null;
}
export async function reputationSnapshot(
  c: PoolClient,
  userId: string,
  config: Config,
  at: Date,
) {
  const production = config.mode === "production";
  const p = (
    await c.query(
      "SELECT p.*,u.status AS account_status,u.email_verified_at,u.roles FROM tutor_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1",
      [userId],
    )
  ).rows[0];
  const identity =
    !!p &&
    (
      await c.query(
        "SELECT 1 FROM tutor_claims c JOIN tutor_evidence e ON e.id=c.evidence_id AND e.user_id=c.user_id WHERE c.user_id=$1 AND c.profile_revision=$2 AND c.kind='IDENTITY' AND c.status='APPROVED' AND c.adult_identity_confirmed AND c.expires_at>$3 AND e.scan_status='CLEAN' AND (NOT $4 OR NOT e.test_only)",
        [userId, p.revision, at, production],
      )
    ).rowCount! > 0;
  const restricted =
    (
      await c.query(
        "SELECT 1 FROM safety_restrictions WHERE target_type='ACCOUNT' AND target_id=$1 AND lifted_at IS NULL",
        [userId],
      )
    ).rowCount! > 0;
  const activeSubjects =
    !!p &&
    (
      await c.query(
        "SELECT count(*) AS n FROM catalogue_terms WHERE kind='SUBJECT' AND active AND id=ANY($1::text[])",
        [p.subject_ids],
      )
    ).rows[0].n == p.subject_ids.length;
  const textSafe =
    !!p &&
    ![p.display_name, p.biography].some((v) =>
      /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d)/i.test(
        v,
      ),
    );
  const adult =
    !!p &&
    (p.onboarding_version === 2 ||
      isAdult(
        decrypt<{
          birth_date: string;
        }>(p.encrypted_birth_date, config.authSecret).birth_date,
        at,
      ));
  const publicEligible =
    !!p &&
    p.account_status === "ACTIVE" &&
    !!p.email_verified_at &&
    p.roles.includes("TUTOR") &&
    p.status === "APPROVED" &&
    identity &&
    !restricted &&
    p.subject_ids.length > 0 &&
    p.hourly_rate_paise !== null &&
    activeSubjects &&
    textSafe &&
    adult;
  const recommendations = Number(
    (
      await c.query(
        "SELECT count(*) AS n FROM tutor_recommendations r JOIN users a ON a.id=r.author_id WHERE r.tutor_id=$1 AND r.status='PUBLISHED' AND a.status='ACTIVE' AND a.email_verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM safety_restrictions s WHERE s.target_type='ACCOUNT' AND s.target_id=a.id AND s.lifted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM account_blocks b WHERE (b.owner_id=r.author_id AND b.blocked_id=r.tutor_id) OR (b.owner_id=r.tutor_id AND b.blocked_id=r.author_id))",
        [userId],
      )
    ).rows[0].n,
  );
  const reviews = (
    await c.query(
      "SELECT count(*) AS total,count(*) FILTER(WHERE rating>=4) AS positive FROM connection_reviews WHERE tutor_id=$1 AND status='PUBLISHED' AND (NOT $2 OR NOT test_only)",
      [userId, production],
    )
  ).rows[0];
  const photo =
    (
      await c.query(
        "SELECT 1 FROM tutor_photos WHERE user_id=$1 AND status='APPROVED' AND scan_status='CLEAN' AND encrypted_payload IS NOT NULL AND (NOT $2 OR NOT test_only)",
        [userId, production],
      )
    ).rowCount! > 0;
  const diploma =
    !!p &&
    (
      await c.query(
        "SELECT 1 FROM tutor_reputation_documents d JOIN tutor_evidence e ON e.id=d.evidence_id AND e.user_id=d.user_id WHERE d.user_id=$1 AND d.profile_revision=$2 AND e.scan_status='CLEAN' AND e.encrypted_payload IS NOT NULL AND (NOT $3 OR NOT e.test_only)",
        [userId, p.revision, production],
      )
    ).rowCount! > 0;
  const response = (
    await c.query(
      "SELECT count(*) AS decisions,avg(EXTRACT(EPOCH FROM (d.decided_at-r.created_at))) AS mean_seconds FROM contact_request_decisions d JOIN contact_requests r ON r.id=d.request_id WHERE d.tutor_id=$1",
      [userId],
    )
  ).rows[0];
  const words = (value: unknown) =>
    typeof value === "string" && value.trim()
      ? value.trim().split(/\s+/u).length
      : 0;
  const introductionWords = words(p?.biography);
  const currentOffers = (
    await c.query(
      "SELECT payload FROM teaching_listings WHERE user_id=$1 AND profile_revision=$2 AND status<>'SAFETY_SUSPENDED'",
      [userId, p?.revision ?? 0],
    )
  ).rows;
  const classQuality = currentOffers.some(
    (row) =>
      words(row.payload.title) >= 12 && words(row.payload.description) >= 40,
  );
  const profileQuality =
    publicEligible && introductionWords >= 40 && classQuality;
  const qualityReady = photo && profileQuality;
  const level = deriveTutorLevel({
    public_eligible: publicEligible,
    recommendations,
    quality_ready: qualityReady,
  });
  return {
    policy_version: "tutor-reputation-v2",
    level,
    public_eligible: publicEligible,
    counts: {
      recommendations,
      student_reviews: Number(reviews.total),
      positive_student_reviews: null,
      ratings_four_or_five: Number(reviews.positive),
    },
    response_facts: {
      decisions: Number(response.decisions),
      mean_response_seconds:
        response.mean_seconds === null ? null : Number(response.mean_seconds),
      note: "All recorded accept/decline decisions; not a verified Superprof badge calculation.",
    },
    criteria: {
      photo: met(
        photo,
        "Approved clean portrait; no inference about teaching quality.",
      ),
      profile: met(
        profileQuality,
        `Level checklist: about-you section ${introductionWords}/40 words; a saved current-profile teaching offer needs a title of at least 12 words and class description of at least 40 words. These word minima affect this level only, not basic profile publication. Pausing or Tutor Pro expiry alone does not remove this text evidence.`,
      ),
      identity: met(
        identity,
        "Current approved adult identity with clean evidence.",
      ),
      diploma: met(
        diploma,
        "Tutor-labelled diploma upload; uploading does not verify the qualification.",
      ),
      response_time: criterion(
        "UNVERIFIED",
        "Superprof does not specify the aggregation, observation window or handling of unanswered requests.",
      ),
      interview: criterion(
        "UNVERIFIED",
        "The official interview questionnaire and approval method were not accessible.",
      ),
    },
    levels: [
      {
        id: "NEW",
        label: "New",
        awarded: level === "NEW",
        requirements: ["An eligible public Tutor profile."],
        blocked_reason: publicEligible
          ? null
          : "Your profile is not currently eligible for publication.",
      },
      {
        id: "EXPERIENCED",
        label: "Experienced",
        awarded: level === "EXPERIENCED",
        requirements: [
          "At least two published recommendations from distinct verified accounts.",
          "Approved clean profile photo.",
          "About-you section of at least 40 words.",
          "Saved current-profile teaching text: title of at least 12 words and class description of at least 40 words. A restricted offer cannot qualify.",
        ],
        blocked_reason:
          recommendations >= 2 && publicEligible && qualityReady
            ? null
            : "Requires two moderated recommendations and the complete photo, introduction and saved teaching-text checklist.",
      },
      {
        id: "SUPER_TEACHER",
        label: "Super Teacher",
        awarded: false,
        requirements: [
          "Four recommendations.",
          "Student reviews: help says three positive reviews; terms say one review.",
          "Diploma upload and quick responses.",
        ],
        blocked_reason:
          "Official criteria conflict; positive-review definition and response calculation remain unverified. This level cannot be awarded.",
      },
      {
        id: "AMBASSADOR",
        label: "Ambassador",
        awarded: false,
        requirements: [
          "All Super Teacher criteria.",
          "Six student reviews.",
          "Official identity document.",
          "Interview questionnaire.",
        ],
        blocked_reason:
          "Super Teacher policy and official interview criteria are unverified. This level cannot be awarded.",
      },
    ],
    policy_conflicts: [
      {
        code: "EXPERIENCED_RECOMMENDED_LABEL",
        detail:
          "India help names this progression Experienced; the inspected live status page names Recommended Teacher. Their equivalence is unconfirmed. This marketplace uses the conservative intersection of the observed quality checklist and documented recommendation threshold, under the help label.",
      },
      {
        code: "SUPER_TEACHER_REVIEW_THRESHOLD",
        help: "Three positive student reviews.",
        terms: "One student review.",
      },
      {
        code: "POSITIVE_REVIEW_DEFINITION",
        detail:
          "The official definition of a positive review was not verified. Ratings of four or five are reported literally and never treated as proof that this badge criterion is met.",
      },
    ],
    sources: [
      "https://www.superprof.co.in/help/teachers/become-a-superprof/superprof-charter/50/",
      "https://www.superprof.co.in/gtu.html",
    ],
  };
}
export class TutorReputationService {
  constructor(
    private readonly db: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly publicTutors: PublicTutors,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async tutor(c: PoolClient, token?: string) {
    const { user } = await this.auth.authenticated(c, token);
    if (!user.roles.includes("TUTOR"))
      throw new ApiProblem(
        403,
        "TUTOR_ROLE_REQUIRED",
        "Choose the Tutor role first.",
      );
    return user;
  }
  private audit(
    c: PoolClient,
    actor: string,
    event: string,
    target: string,
    correlation: string,
    metadata: Record<string, unknown> = {},
  ) {
    return c.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        actor,
        event,
        correlation,
        { target, ...metadata },
        this.now(),
      ],
    );
  }
  async own(token?: string) {
    return this.db.transaction(async (c) => {
      const user = await this.tutor(c, token);
      return reputationSnapshot(c, user.id, this.config, this.now());
    });
  }
  async publicSnapshot(publicId: string) {
    await this.publicTutors.detail(publicId);
    return this.db.transaction(async (c) => {
      await c.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const p = (
        await c.query("SELECT user_id FROM tutor_profiles WHERE public_id=$1", [
          publicId,
        ])
      ).rows[0];
      if (!p)
        throw new ApiProblem(404, "NOT_FOUND", "Tutor profile unavailable.");
      const progress = await reputationSnapshot(
        c,
        p.user_id,
        this.config,
        this.now(),
      );
      if (!progress.public_eligible)
        throw new ApiProblem(404, "NOT_FOUND", "Tutor profile unavailable.");
      const published = (
        await c.query(
          "SELECT r.id,a.display_name AS author_display_name,r.relationship,r.published_text AS text FROM tutor_recommendations r JOIN users a ON a.id=r.author_id WHERE r.tutor_id=$1 AND r.status='PUBLISHED' AND a.status='ACTIVE' AND a.email_verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM safety_restrictions s WHERE s.target_type='ACCOUNT' AND s.target_id=a.id AND s.lifted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM account_blocks b WHERE (b.owner_id=r.author_id AND b.blocked_id=r.tutor_id) OR (b.owner_id=r.tutor_id AND b.blocked_id=r.author_id)) ORDER BY r.created_at DESC,r.id LIMIT 20",
          [p.user_id],
        )
      ).rows;
      return {
        badge: progress.level,
        label:
          progress.level === "EXPERIENCED"
            ? "Experienced"
            : progress.level === "NEW"
              ? "New"
              : null,
        recommendations: progress.counts.recommendations,
        published_recommendations: published,
        meaning:
          "Network recommendations are moderated endorsements, not verified lessons or proof of teaching quality.",
      };
    });
  }
  async authored(token?: string) {
    return this.db.transaction(async (c) => {
      const { user } = await this.auth.authenticated(c, token);
      return {
        recommendations: (
          await c.query(
            "SELECT r.id,p.public_id AS tutor_public_id,r.relationship,r.encrypted_text,r.status,r.revision,r.created_at,r.updated_at FROM tutor_recommendations r JOIN tutor_profiles p ON p.user_id=r.tutor_id WHERE r.author_id=$1 ORDER BY r.created_at DESC,r.id LIMIT 100",
            [user.id],
          )
        ).rows.map(({ encrypted_text, ...r }) => ({
          ...r,
          text: decrypt<{
            text: string;
          }>(encrypted_text, this.config.authSecret).text,
        })),
      };
    });
  }
  async recommendations(token?: string) {
    return this.db.transaction(async (c) => {
      const user = await this.tutor(c, token);
      return {
        recommendations: (
          await c.query(
            "SELECT id,relationship,status,revision,review_reason,created_at,updated_at FROM tutor_recommendations WHERE tutor_id=$1 ORDER BY created_at DESC,id LIMIT 100",
            [user.id],
          )
        ).rows,
      };
    });
  }
  async diploma(
    token: string | undefined,
    evidenceId: string,
    correlation: string,
  ) {
    return this.db.transaction(async (c) => {
      const user = await this.tutor(c, token);
      await requireSafetyClear(c, "ACCOUNT", user.id);
      const p = (
        await c.query(
          "SELECT revision FROM tutor_profiles WHERE user_id=$1 FOR UPDATE",
          [user.id],
        )
      ).rows[0];
      if (!p)
        throw new ApiProblem(
          409,
          "PROFILE_REQUIRED",
          "Save your Tutor profile first.",
        );
      const evidence = (
        await c.query(
          "SELECT id FROM tutor_evidence WHERE id=$1 AND user_id=$2 AND scan_status='CLEAN' AND encrypted_payload IS NOT NULL AND (NOT $3 OR NOT test_only) FOR SHARE",
          [evidenceId, user.id, this.config.mode === "production"],
        )
      ).rows[0];
      if (!evidence)
        throw new ApiProblem(
          409,
          "EVIDENCE_UNAVAILABLE",
          "Choose your current clean diploma upload.",
        );
      await c.query(
        "INSERT INTO tutor_reputation_documents(user_id,evidence_id,profile_revision,kind,created_at) VALUES($1,$2,$3,'DIPLOMA',$4) ON CONFLICT(user_id) DO UPDATE SET evidence_id=$2,profile_revision=$3,created_at=$4",
        [user.id, evidenceId, p.revision, this.now()],
      );
      await this.audit(
        c,
        user.id,
        "TUTOR_DIPLOMA_LINKED",
        evidenceId,
        correlation,
      );
      return reputationSnapshot(c, user.id, this.config, this.now());
    });
  }
  async submit(
    token: string | undefined,
    publicId: string,
    input: z.infer<typeof recommendationInput>,
    correlation: string,
  ) {
    await this.publicTutors.detail(publicId);
    return this.db.transaction(async (c) => {
      const { user } = await this.auth.authenticated(c, token);
      await requireSafetyClear(c, "ACCOUNT", user.id);
      const p = (
        await c.query(
          "SELECT user_id FROM tutor_profiles WHERE public_id=$1 FOR SHARE",
          [publicId],
        )
      ).rows[0];
      if (!p)
        throw new ApiProblem(404, "NOT_FOUND", "Tutor profile unavailable.");
      if (p.user_id === user.id)
        throw new ApiProblem(
          403,
          "SELF_RECOMMENDATION",
          "You cannot recommend yourself.",
        );
      const blocked = (
        await c.query(
          "SELECT 1 FROM account_blocks WHERE (owner_id=$1 AND blocked_id=$2) OR (owner_id=$2 AND blocked_id=$1)",
          [user.id, p.user_id],
        )
      ).rowCount;
      if (blocked)
        throw new ApiProblem(
          403,
          "INTERACTION_UNAVAILABLE",
          "This interaction is unavailable.",
        );
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
      const old = (
        await c.query(
          "SELECT id,status FROM tutor_recommendations WHERE tutor_id=$1 AND author_id=$2",
          [p.user_id, user.id],
        )
      ).rows[0];
      if (old)
        throw new ApiProblem(
          409,
          "RECOMMENDATION_EXISTS",
          "One recommendation per account and Tutor is allowed.",
        );
      const recent = Number(
        (
          await c.query(
            "SELECT count(*) AS n FROM tutor_recommendations WHERE author_id=$1 AND created_at>$2::timestamptz-interval '1 day'",
            [user.id, this.now()],
          )
        ).rows[0].n,
      );
      if (recent >= 5)
        throw new ApiProblem(
          429,
          "RECOMMENDATION_LIMIT",
          "Try again after the daily recommendation limit resets.",
        );
      const id = randomUUID();
      await c.query(
        "INSERT INTO tutor_recommendations(id,tutor_id,author_id,relationship,encrypted_text,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6)",
        [
          id,
          p.user_id,
          user.id,
          input.relationship,
          encrypt({ text: input.text }, this.config.authSecret),
          this.now(),
        ],
      );
      await this.audit(
        c,
        user.id,
        "TUTOR_RECOMMENDATION_SUBMITTED",
        id,
        correlation,
      );
      return { recommendation: { id, status: "PENDING", revision: 1 } };
    });
  }
  async withdraw(token: string | undefined, id: string, correlation: string) {
    return this.db.transaction(async (c) => {
      const { user } = await this.auth.authenticated(c, token);
      const r = (
        await c.query(
          "SELECT id,status FROM tutor_recommendations WHERE id=$1 AND author_id=$2 FOR UPDATE",
          [id, user.id],
        )
      ).rows[0];
      if (!r)
        throw new ApiProblem(404, "NOT_FOUND", "Recommendation unavailable.");
      await c.query(
        "UPDATE tutor_recommendations SET status='WITHDRAWN',published_text=NULL,revision=revision+1,updated_at=$2 WHERE id=$1",
        [id, this.now()],
      );
      await this.audit(
        c,
        user.id,
        "TUTOR_RECOMMENDATION_WITHDRAWN",
        id,
        correlation,
      );
    });
  }
  async queue(
    account: string | undefined,
    elevated: string | undefined,
    reason: string,
    correlation: string,
  ) {
    return this.db.transaction(async (c) => {
      const actor = await this.staff.authorize(c, account, elevated, "TRUST");
      const rows = (
        await c.query(
          "SELECT r.*,p.display_name AS tutor_display_name,a.display_name AS author_display_name FROM tutor_recommendations r JOIN tutor_profiles p ON p.user_id=r.tutor_id JOIN users a ON a.id=r.author_id ORDER BY CASE WHEN r.status='PENDING' THEN 0 ELSE 1 END,r.created_at DESC,r.id LIMIT 100",
        )
      ).rows;
      await this.audit(
        c,
        actor.id,
        "TUTOR_RECOMMENDATION_QUEUE_READ",
        "recommendation-queue",
        correlation,
        { reason },
      );
      return {
        recommendations: rows.map(
          ({ encrypted_text, published_text, reviewed_by, ...r }) => ({
            ...r,
            text: decrypt<{
              text: string;
            }>(encrypted_text, this.config.authSecret).text,
          }),
        ),
        policy:
          "Check relevance, misleading claims, privacy and abuse. Recommendations are network endorsements, not verified lessons or star reviews.",
      };
    });
  }
  async decide(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    input: z.infer<typeof recommendationDecision>,
    correlation: string,
  ) {
    return this.db.transaction(async (c) => {
      const planned = (
        await c.query(
          "SELECT tutor_id,author_id FROM tutor_recommendations WHERE id=$1",
          [id],
        )
      ).rows[0];
      const actor = await this.staff.authorize(
        c,
        account,
        elevated,
        "TRUST",
        planned ? [planned.tutor_id, planned.author_id] : [],
      );
      const row = (
        await c.query(
          "SELECT * FROM tutor_recommendations WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row)
        throw new ApiProblem(404, "NOT_FOUND", "Recommendation unavailable.");
      if (actor.id === row.tutor_id || actor.id === row.author_id)
        throw new ApiProblem(
          403,
          "SELF_REVIEW",
          "You cannot review your own recommendation or profile endorsement.",
        );
      if (row.revision !== input.revision)
        throw new ApiProblem(
          409,
          "REVISION_CONFLICT",
          "Refresh this recommendation before reviewing.",
        );
      if (row.status === "WITHDRAWN")
        throw new ApiProblem(
          409,
          "RECOMMENDATION_WITHDRAWN",
          "The author withdrew this recommendation.",
        );
      const status =
        input.outcome === "PUBLISH"
          ? "PUBLISHED"
          : input.outcome === "REJECT"
            ? "REJECTED"
            : "WITHDRAWN";
      const text = decrypt<{
        text: string;
      }>(row.encrypted_text, this.config.authSecret).text;
      if (status === "PUBLISHED" && !publicText.safeParse(text).success)
        throw new ApiProblem(
          409,
          "INVALID_RECOMMENDATION",
          "The content does not meet public text requirements.",
        );
      await c.query(
        "UPDATE tutor_recommendations SET status=$2,published_text=$3,revision=revision+1,review_reason=$4,reviewed_by=$5,updated_at=$6 WHERE id=$1",
        [
          id,
          status,
          status === "PUBLISHED" ? text : null,
          input.reason,
          actor.id,
          this.now(),
        ],
      );
      await this.audit(
        c,
        actor.id,
        "TUTOR_RECOMMENDATION_REVIEWED",
        id,
        correlation,
        { outcome: status, reason: input.reason },
      );
      return { recommendation: { id, status, revision: row.revision + 1 } };
    });
  }
}
const parse = <T>(schema: z.ZodType<T>, v: unknown) => {
  const r = schema.safeParse(v);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      r.error.issues[0]?.message || "Check the recommendation fields.",
    );
  return r.data;
};
@Controller("v1")
export class TutorReputationController {
  constructor(
    @Inject(TutorReputationService)
    private readonly service: TutorReputationService,
    @Inject("AUTH_CONFIG")
    private readonly config: Config,
  ) {}
  private cookie(r: Request, name: string) {
    const pairs = (r.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(name + "="));
    return pairs.length === 1 ? pairs[0].slice(name.length + 1) : undefined;
  }
  private token(r: Request) {
    return this.cookie(r, sessionCookieName(this.config));
  }
  @Get("me/tutor/progression")
  own(
    @Req()
    r: Request,
  ) {
    return this.service.own(this.token(r));
  }
  @Get("me/tutor/recommendations")
  recommendations(
    @Req()
    r: Request,
  ) {
    return this.service.recommendations(this.token(r));
  }
  @Get("me/recommendations")
  authored(
    @Req()
    r: Request,
  ) {
    return this.service.authored(this.token(r));
  }
  @Get("tutor-profiles/:id/progression")
  publicSnapshot(
    @Param("id")
    id: string,
  ) {
    return this.service.publicSnapshot(parse(z.uuid(), id));
  }
  @Post("me/tutor/progression/diploma")
  @HttpCode(200)
  diploma(
    @Req()
    r: Request & {
      correlationId: string;
    },
    @Body()
    body: unknown,
  ) {
    const v = parse(z.strictObject({ evidence_id: z.uuid() }), body);
    return this.service.diploma(this.token(r), v.evidence_id, r.correlationId);
  }
  @Post("tutors/:id/recommendations")
  @HttpCode(201)
  submit(
    @Req()
    r: Request & {
      correlationId: string;
    },
    @Param("id")
    id: string,
    @Body()
    body: unknown,
  ) {
    return this.service.submit(
      this.token(r),
      parse(z.uuid(), id),
      parse(recommendationInput, body),
      r.correlationId,
    );
  }
  @Delete("me/recommendations/:id")
  @HttpCode(204)
  withdraw(
    @Req()
    r: Request & {
      correlationId: string;
    },
    @Param("id")
    id: string,
  ) {
    return this.service.withdraw(
      this.token(r),
      parse(z.uuid(), id),
      r.correlationId,
    );
  }
  @Get("staff/tutor-recommendations")
  queue(
    @Req()
    r: Request & {
      correlationId: string;
    },
    @Query()
    query: unknown,
  ) {
    const v = parse(z.strictObject({ reason: reasonInput }), query);
    return this.service.queue(
      this.token(r),
      this.cookie(r, staffCookieName(this.config)),
      v.reason,
      r.correlationId,
    );
  }
  @Post("staff/tutor-recommendations/:id/decisions")
  @HttpCode(200)
  decide(
    @Req()
    r: Request & {
      correlationId: string;
    },
    @Param("id")
    id: string,
    @Body()
    body: unknown,
  ) {
    return this.service.decide(
      this.token(r),
      this.cookie(r, staffCookieName(this.config)),
      parse(z.uuid(), id),
      parse(recommendationDecision, body),
      r.correlationId,
    );
  }
}
