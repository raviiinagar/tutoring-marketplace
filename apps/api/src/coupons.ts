import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Config } from "./config.js";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import { RateLimiter } from "./rate-limit.js";
import { ApiProblem } from "./errors.js";
export const couponCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{3,31}$/);
export const passProduct=z.enum(['LEARNER_ACCESS','TUTOR_PRO']);
export const campaignInput = z.strictObject({
  code: couponCode,
  product: passProduct.default("LEARNER_ACCESS"),
  percent_off: z.number().int().min(1).max(100),
  starts_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }),
  max_uses: z.number().int().min(1).max(100000),
  reason: z.string().trim().min(10).max(240),
});
type Row = Record<string, any>;
const unavailable = () =>
  new ApiProblem(
    409,
    "COUPON_UNAVAILABLE",
    "This coupon is invalid, expired, already used by you or fully redeemed.",
  );
export function couponPrice(base: number, percent: number) {
  const discount = Math.floor((base * percent) / 100);
  return {
    base_paise: base,
    discount_paise: discount,
    total_paise: base - discount,
    percent_off: percent,
  };
}
export class CouponsService {
  private readonly limits: RateLimiter;
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.limits = new RateLimiter(database, config.authSecret, now);
  }
  async eligible(
    client: PoolClient,
    payer: string,
    code: string,
    lock = false,
    product: string = "LEARNER_ACCESS",
  ) {
    const row = (
      await client.query(
        "SELECT * FROM access_coupons WHERE code=$1" +
          (lock ? " FOR UPDATE" : ""),
        [code],
      )
    ).rows[0];
    const at = this.now();
    if (
      !row ||
      !row.enabled || row.product !== product ||
      row.test_only !== (this.config.mode !== "production") ||
      new Date(row.starts_at) > at ||
      new Date(row.expires_at) <= at
    )
      throw unavailable();
    const uses = (
      await client.query(
        "SELECT count(*)::int AS total,COALESCE(bool_or(payer_id=$2),false) AS already_used FROM coupon_redemptions WHERE coupon_id=$1",
        [row.id, payer],
      )
    ).rows[0];
    if (uses.total >= row.max_uses || uses.already_used) throw unavailable();
    return row;
  }
  async quote(token: string | undefined, code: string, product="LEARNER_ACCESS") {
    await this.limits.consume("coupon-quote", token || "anonymous", 30, 900000);
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      const row = await this.eligible(client, user.id, code, false, product);
      const policy = (
        await client.query(
          "SELECT * FROM payment_policies WHERE product=$1", [product],
        )
      ).rows[0];
      return {
        quote: {
          code: row.code,
          ...couponPrice(policy.amount_paise, row.percent_off),
          currency: policy.currency,
          expires_at: new Date(row.expires_at).toISOString(),
          payment_required: row.percent_off !== 100,
        },
      };
    });
  }
  async record(
    client: PoolClient,
    campaign: Row,
    payer: string,
    key: string,
    hash: string,
    policy: Row,
    cycle: string | null,
    id = randomUUID(),
  ) {
    const price = couponPrice(policy.amount_paise, campaign.percent_off);
    const at = this.now();
    const row = (
      await client.query(
        "INSERT INTO coupon_redemptions(id,coupon_id,payer_id,request_key,payload_hash,policy_version,code,percent_off,base_paise,discount_paise,total_paise,test_only,cycle_id,created_at,product) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *",
        [
          id,
          campaign.id,
          payer,
          key,
          hash,
          policy.version,
          campaign.code,
          campaign.percent_off,
          price.base_paise,
          price.discount_paise,
          price.total_paise,
          campaign.test_only,
          cycle,
          at, policy.product,
        ],
      )
    ).rows[0];
    if (price.total_paise === 0 && policy.product === 'TUTOR_PRO') {
      await client.query("INSERT INTO tutor_pro_grants(id,payer_id,source,coupon_redemption_id,test_only,starts_at,ends_at,created_at) VALUES($1,$2,'COUPON',$3,$4,$5,$6,$5)",[randomUUID(),payer,id,campaign.test_only,at,new Date(at.getTime()+30*86400000)]);
    }
    if (price.total_paise === 0 && policy.product === 'LEARNER_ACCESS')
      await client.query(
        "INSERT INTO access_entitlements(id,payer_id,source,policy_version,status,test_only,coupon_redemption_id,issued_at,matching_deadline,created_at) VALUES($1,$2,'COUPON',$3,'MATCHING',$4,$5,$6,$7,$6)",
        [
          randomUUID(),
          payer,
          policy.version,
          campaign.test_only,
          id,
          at,
          new Date(at.getTime() + 72 * 3600000),
        ],
      );
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,'ACCESS_COUPON_REDEEMED',$3,$4,$5)",
      [
        randomUUID(),
        payer,
        randomUUID(),
        at,
        {
          target: id,
          coupon_id: campaign.id,
          cycle_id: cycle,
          discount_paise: price.discount_paise,
          total_paise: price.total_paise,
        },
      ],
    );
    return row;
  }
  async view(client: PoolClient, row: Row) {
    const grant = (
      await client.query(
        (row.product==='TUTOR_PRO'?"SELECT * FROM tutor_pro_grants WHERE coupon_redemption_id=$1":"SELECT * FROM access_entitlements WHERE coupon_redemption_id=$1"),
        [row.id],
      )
    ).rows[0];
    const at = this.now();
    return {
      id: row.id, product: row.product,
      code: row.code,
      base_paise: row.base_paise,
      discount_paise: row.discount_paise,
      total_paise: row.total_paise,
      percent_off: row.percent_off,
      created_at: new Date(row.created_at).toISOString(),
      purchase_id: row.cycle_id,
      access: grant
        ? {
            status:
              grant.status === "REVOKED"
                ? "REVOKED"
                : new Date(grant.ends_at || grant.matching_deadline) <= at
                  ? "EXPIRED"
                  : grant.status,
            matching_deadline: grant.matching_deadline?new Date(grant.matching_deadline).toISOString():null,
            starts_at: grant.starts_at
              ? new Date(grant.starts_at).toISOString()
              : null,
            ends_at: grant.ends_at
              ? new Date(grant.ends_at).toISOString()
              : null,
          }
        : null,
    };
  }
  async history(token?: string, product="LEARNER_ACCESS") {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const rows = (
        await client.query(
          "SELECT * FROM coupon_redemptions WHERE payer_id=$1 AND test_only=$2 AND product=$3 ORDER BY created_at DESC,id DESC LIMIT 50",
          [user.id, this.config.mode !== "production", product],
        )
      ).rows;
      const redemptions = [];
      for (const row of rows) redemptions.push(await this.view(client, row));
      return { redemptions };
    });
  }
  async cancel(token: string | undefined, id: string) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.authenticated(client, token);
      const redemption = (
        await client.query(
          "SELECT * FROM coupon_redemptions WHERE id=$1 AND payer_id=$2 AND total_paise=0 AND product='LEARNER_ACCESS' AND test_only=$3",
          [id, user.id, this.config.mode !== "production"],
        )
      ).rows[0];
      if (!redemption)
        throw new ApiProblem(404, "NOT_FOUND", "Coupon Redemption not found.");
      const grant = (
        await client.query(
          "SELECT * FROM access_entitlements WHERE coupon_redemption_id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (grant.starts_at)
        throw new ApiProblem(
          409,
          "PASS_ALREADY_ACTIVE",
          "This pass has already started.",
        );
      await client.query(
        "UPDATE access_entitlements SET status='REVOKED' WHERE id=$1",
        [grant.id],
      );
      await client.query(
        "UPDATE contact_requests SET status='CANCELLED',updated_at=$2 WHERE entitlement_id=$1 AND status='PENDING'",
        [grant.id, this.now()],
      );
      await client.query(
        "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,'COUPON_PASS_CANCELLED',$3,$4,$5)",
        [randomUUID(), user.id, randomUUID(), this.now(), { target: id }],
      );
      return { redemption: await this.view(client, redemption) };
    });
  }
  async campaigns(token: string | undefined, elevated: string | undefined) {
    return this.database.transaction(async (client) => {
      await this.staff.authorize(client, token, elevated, "FINANCE");
      return {
        coupons: (
          await client.query(
            "SELECT c.*, (SELECT count(*)::int FROM coupon_redemptions r WHERE r.coupon_id=c.id) AS uses FROM access_coupons c WHERE test_only=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
            [this.config.mode !== "production"],
          )
        ).rows,
      };
    });
  }
  async createCampaign(
    token: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof campaignInput>,
  ) {
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(
        client,
        token,
        elevated,
        "FINANCE",
      );
      const at = this.now();
      if (
        new Date(input.expires_at) <= new Date(input.starts_at) ||
        new Date(input.expires_at) <= at ||
        new Date(input.expires_at).getTime() > at.getTime() + 366 * 86400000
      )
        throw new ApiProblem(
          400,
          "INVALID_COUPON_DATES",
          "Choose an expiry after the start, within the next year.",
        );
      const row = (
        await client.query(
          "INSERT INTO access_coupons(id,code,percent_off,starts_at,expires_at,max_uses,test_only,created_by,created_at,product) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(code) DO NOTHING RETURNING *",
          [
            randomUUID(),
            input.code,
            input.percent_off,
            input.starts_at,
            input.expires_at,
            input.max_uses,
            this.config.mode !== "production",
            actor.id,
            at, input.product,
          ],
        )
      ).rows[0];
      if (!row)
        throw new ApiProblem(
          409,
          "COUPON_CODE_EXISTS",
          "Choose a new coupon code. Existing terms cannot be changed.",
        );
      await client.query(
        "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,'ACCESS_COUPON_CREATED',$3,$4,$5)",
        [
          randomUUID(),
          actor.id,
          randomUUID(),
          at,
          { target: row.id, reason: input.reason },
        ],
      );
      return { coupon: row };
    });
  }
  async disable(
    token: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(
        client,
        token,
        elevated,
        "FINANCE",
      );
      const row = (
        await client.query(
          "UPDATE access_coupons SET enabled=false WHERE id=$1 AND test_only=$2 RETURNING *",
          [id, this.config.mode !== "production"],
        )
      ).rows[0];
      if (!row) throw new ApiProblem(404, "NOT_FOUND", "Coupon not found.");
      await client.query(
        "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,'ACCESS_COUPON_DISABLED',$3,$4,$5)",
        [
          randomUUID(),
          actor.id,
          randomUUID(),
          this.now(),
          { target: id, reason },
        ],
      );
      return { coupon: row };
    });
  }
}
