import { createHmac, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { Database } from "./database.js";
import type { Config } from "./config.js";
import { StaffService } from "./staff.js";
import { RateLimiter } from "./rate-limit.js";
import { ApiProblem } from "./errors.js";
export const trafficInput = z.strictObject({
  event_id: z.uuid(),
  session_id: z.uuid(),
  page: z.enum(["HOME", "BROWSE", "TUTOR", "CATEGORY", "SIGN_IN", "SIGN_UP"]),
});
export const adminInput = z.strictObject({
  days: z.enum(["7", "30", "90"]).default("30"),
});
export const accountSearchInput = z.strictObject({
  query: z.string().trim().max(80).default(""),
  cursor: z.uuid().optional(),
});
const istDay = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
const counts = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
export class AdminService {
  private readonly limits: RateLimiter;
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly staff: StaffService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.limits = new RateLimiter(database, config.authSecret, now);
  }
  private digest(value: string) {
    return createHmac("sha256", this.config.authSecret)
      .update("admin-traffic:" + value)
      .digest("hex");
  }
  async traffic(input: z.infer<typeof trafficInput>, ip: string) {
    await this.limits.consume("public-traffic", ip, 120, 900000);
    return this.database.transaction(async (client) => {
      const at = this.now(),
        day = istDay(at),
        test = this.config.mode !== "production";
      const hash = this.digest(day + ":view:" + input.event_id),
        fingerprint = this.digest(
          day + ":" + input.session_id + ":" + input.page,
        );
      const inserted = await client.query(
        "INSERT INTO admin_traffic_receipts(day,test_only,kind,receipt_hash,fingerprint) VALUES($1,$2,'VIEW',$3,$4) ON CONFLICT DO NOTHING",
        [day, test, hash, fingerprint],
      );
      if (!inserted.rowCount) {
        const prior = (
          await client.query(
            "SELECT fingerprint FROM admin_traffic_receipts WHERE day=$1 AND test_only=$2 AND kind='VIEW' AND receipt_hash=$3",
            [day, test, hash],
          )
        ).rows[0];
        if (prior.fingerprint !== fingerprint)
          throw new ApiProblem(
            409,
            "OBSERVATION_CONFLICT",
            "This observation was already recorded for different details.",
          );
        return { recorded: true, replayed: true };
      }
      const visit = await client.query(
        "INSERT INTO admin_traffic_receipts(day,test_only,kind,receipt_hash,fingerprint) VALUES($1,$2,'VISIT',$3,$3) ON CONFLICT DO NOTHING",
        [day, test, this.digest(day + ":visit:" + input.session_id)],
      );
      if (visit.rowCount)
        await client.query(
          "INSERT INTO admin_visit_daily(day,test_only,visits) VALUES($1,$2,1) ON CONFLICT(day,test_only) DO UPDATE SET visits=admin_visit_daily.visits+1",
          [day, test],
        );
      await client.query(
        "INSERT INTO admin_traffic_daily(day,test_only,page_key,page_views,first_seen_at) VALUES($1,$2,$3,1,$4) ON CONFLICT(day,test_only,page_key) DO UPDATE SET page_views=admin_traffic_daily.page_views+1",
        [day, test, input.page, at],
      );
      await client.query(
        "DELETE FROM admin_traffic_receipts WHERE ctid IN (SELECT ctid FROM admin_traffic_receipts WHERE day<$1::date-2 LIMIT 500)",
        [day],
      );
      return { recorded: true, replayed: false };
    });
  }
  private async audit(
    client: PoolClient,
    actor: string,
    event: string,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), actor, event, randomUUID(), this.now(), metadata],
    );
  }
  async overview(
    account: string | undefined,
    elevated: string | undefined,
    days: number,
  ) {
    return this.database.transaction(async (client) => {
      const { user, scopes } = await this.staff.authorizeOverview(
        client,
        account,
        elevated,
      );
      const at = this.now(),
        today = istDay(at),
        start = new Date(today + "T00:00:00+05:30");
      start.setTime(start.getTime() - (days - 1) * 86400000);
      const test = this.config.mode !== "production";
      await this.audit(client, user.id, "ADMIN_OVERVIEW_VIEWED", {
        days,
        reason: "Aggregate administration overview",
      });
      const query = async (
        sql: string,
        params: unknown[] = [start, at, test],
      ) => (await client.query(sql, params)).rows;
      const audience = counts(
        (
          await query(
            `SELECT count(*) AS accounts_total,count(*) FILTER(WHERE email_verified_at IS NOT NULL) AS verified_accounts,count(*) FILTER(WHERE created_at>=$1 AND created_at<=$2) AS new_accounts FROM users u WHERE NOT EXISTS(SELECT 1 FROM privacy_tombstones t WHERE t.user_id=u.id AND t.kind='DELETE')`,
            [start, at],
          )
        )[0],
      );
      const logins = counts(
        (
          await query(
            `SELECT count(*) AS successful_logins,count(DISTINCT a.user_id) AS signed_in_accounts FROM audit_events a WHERE a.event_type='SESSION_CREATED' AND a.created_at>=$1 AND a.created_at<=$2 AND NOT EXISTS(SELECT 1 FROM privacy_tombstones t WHERE t.user_id=a.user_id AND t.kind='DELETE')`,
            [start, at],
          )
        )[0],
      );
      const sessions = Number(
        (
          await query(
            "SELECT count(*) AS count FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.status='ACTIVE' AND s.revoked_at IS NULL AND s.expires_at>$1",
            [at],
          )
        )[0].count,
      );
      const traffic = (
        await query(
          `SELECT sum(page_views) AS views,min(first_seen_at) AS first FROM admin_traffic_daily WHERE test_only=$3 AND day BETWEEN ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`,
        )
      )[0];
      const tracking = (
        await query(
          "SELECT min(first_seen_at) AS started FROM admin_traffic_daily WHERE test_only=$1",
          [test],
        )
      )[0].started;
      const visits = Number(
        (
          await query(
            `SELECT COALESCE(sum(visits),0) AS count FROM admin_visit_daily WHERE test_only=$3 AND day BETWEEN ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`,
          )
        )[0].count,
      );
      const business = counts(
        (
          await query(
            `SELECT count(*) FILTER(WHERE r.created_at>=$1 AND r.created_at<=$2) AS enquiries,count(*) FILTER(WHERE r.status='PENDING' AND r.expires_at>$2) AS pending_enquiries,count(*) FILTER(WHERE r.status='ACCEPTED' AND r.created_at>=$1 AND r.created_at<=$2) AS accepted_enquiries FROM contact_requests r JOIN access_entitlements e ON e.id=r.entitlement_id JOIN learner_profiles l ON l.id=r.learner_id WHERE e.test_only=$3 AND l.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM privacy_tombstones t WHERE t.kind='DELETE' AND t.user_id IN (r.payer_id,r.tutor_id)) AND NOT EXISTS(SELECT 1 FROM privacy_requests p WHERE p.kind='WITHDRAW' AND p.user_id=r.payer_id AND p.withdraw_scope->'request_ids' ? r.id::text)`,
          )
        )[0],
      );
      const trend = await query(
        `WITH days AS (SELECT generate_series(($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,'1 day')::date AS day),signups AS(SELECT (u.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,count(*) AS count FROM users u WHERE u.created_at BETWEEN $1 AND $2 AND NOT EXISTS(SELECT 1 FROM privacy_tombstones t WHERE t.user_id=u.id AND t.kind='DELETE') GROUP BY 1),logins AS(SELECT(a.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,count(*) AS count FROM audit_events a WHERE a.event_type='SESSION_CREATED' AND a.created_at BETWEEN $1 AND $2 AND NOT EXISTS(SELECT 1 FROM privacy_tombstones t WHERE t.user_id=a.user_id AND t.kind='DELETE') GROUP BY 1) SELECT to_char(d.day,'YYYY-MM-DD') AS day,COALESCE(s.count,0)::int AS signups,COALESCE(l.count,0)::int AS logins,COALESCE(v.visits,0)::int AS visits FROM days d LEFT JOIN signups s USING(day) LEFT JOIN logins l USING(day) LEFT JOIN admin_visit_daily v ON v.day=d.day AND v.test_only=$3 ORDER BY d.day`,
      );
      const queues: Array<{
        key: string;
        label: string;
        count: number;
        href: string;
      }> = [];
      if (scopes.includes("TRUST")) {
        const trust = (
          await query(
            `SELECT (SELECT count(*) FROM tutor_claims c JOIN tutor_evidence e ON e.id=c.evidence_id JOIN tutor_profiles p ON p.user_id=c.user_id AND p.revision=c.profile_revision WHERE c.status='PENDING' AND p.status='SUBMITTED' AND e.scan_status='CLEAN' AND e.test_only=$1) AS claims,(SELECT count(*) FROM teaching_listings WHERE status='REVIEW') AS listings,(SELECT count(*) FROM tutor_photos WHERE status='PENDING' AND scan_status='CLEAN' AND test_only=$1) AS photos,(SELECT count(*) FROM guardian_verifications WHERE status='PENDING') AS guardians`,
            [test],
          )
        )[0];
        for (const [key, label, href] of [
          ["claims", "Tutor evidence", "/staff/tutors"],
          ["listings", "Teaching offers", "/staff/listings"],
          ["photos", "Tutor photos", "/staff/photos"],
          ["guardians", "Guardian reviews", "/staff/guardians"],
        ])
          queues.push({ key, label, count: Number(trust[key]), href });
      }
      const support = await query(
        "SELECT required_scope,count(*) AS count FROM support_cases WHERE status<>'RESOLVED' AND test_only=$1 AND required_scope=ANY($2::text[]) GROUP BY required_scope",
        [test, scopes],
      );
      for (const scope of scopes)
        queues.push({
          key: "support-" + scope,
          label:
            scope === "SUPPORT"
              ? "Support cases"
              : scope === "TRUST"
                ? "Trust appeals"
                : "Finance cases",
          count: Number(
            support.find((r) => r.required_scope === scope)?.count || 0,
          ),
          href: "/staff/support",
        });
      const alerts = (
        await query(
          "SELECT code,scope,count,opened_at FROM operations_alerts WHERE status='OPEN' AND scope=ANY($1::text[]) ORDER BY opened_at DESC LIMIT 8",
          [scopes],
        )
      ).map((r) => ({ ...r, count: Number(r.count) }));
      let finance: null | Record<string, number> = null;
      if (scopes.includes("FINANCE")) {
        const captured = counts(
          (
            await query(
              "SELECT COALESCE(sum(j.amount_paise) FILTER(WHERE j.kind='CAPTURE'),0) AS captured_paise,count(*) FILTER(WHERE j.kind='CAPTURE') AS captures,COALESCE(sum(j.amount_paise) FILTER(WHERE j.kind='UNEXPECTED_CAPTURE'),0) AS unexpected_paise FROM payment_journal j JOIN purchase_cycles p ON p.id=j.cycle_id WHERE j.captured_at BETWEEN $1 AND $2 AND p.test_only=$3",
            )
          )[0],
        );
        const coupons = counts(
          (
            await query(
              "SELECT count(*) AS coupon_redemptions,count(*) FILTER(WHERE total_paise=0) AS free_passes,COALESCE(sum(discount_paise),0) AS coupon_discount_paise FROM coupon_redemptions WHERE created_at BETWEEN $1 AND $2 AND test_only=$3",
            )
          )[0],
        );
        const reversals = counts(
          (
            await query(
              "SELECT COALESCE(sum(r.amount_paise) FILTER(WHERE r.kind='REFUND'),0) AS refunded_paise FROM reversal_journal r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE r.recorded_at BETWEEN $1 AND $2 AND p.test_only=$3",
            )
          )[0],
        );
        finance = { ...captured, ...coupons, ...reversals };
      }
      const events = [
        "ACCOUNT_REGISTERED",
        "EMAIL_VERIFIED",
        "CONTACT_REQUEST_SUBMITTED",
        "CONTACT_REQUEST_ACCEPT",
        "CONNECTION_ESTABLISHED",
      ];
      if (scopes.includes("TRUST"))
        events.push(
          "TUTOR_CLAIM_APPROVE",
          "TUTOR_CLAIM_REJECT",
          "LISTING_APPROVE",
          "LISTING_CHANGES_REQUESTED",
          "LISTING_REJECT",
        );
      if (scopes.includes("FINANCE"))
        events.push(
          "ACCESS_COUPON_REDEEMED",
          "ACCESS_COUPON_CREATED",
          "ACCESS_PASS_ACTIVATED",
        );
      const activity = await query(
        "SELECT id,event_type,created_at FROM audit_events WHERE event_type=ANY($1::text[]) ORDER BY created_at DESC,id DESC LIMIT 8",
        [events],
      );
      const workers = await query(
        "SELECT name,last_success_at,consecutive_errors FROM operations_worker_health ORDER BY name",
        [],
      );
      return {
        as_of: at.toISOString(),
        days,
        timezone: "Asia/Kolkata",
        environment: this.config.deploymentEnvironment || this.config.mode,
        test_only: test,
        scopes,
        audience: {
          ...audience,
          ...logins,
          valid_sessions: sessions,
          visits: tracking ? visits : null,
          page_views: tracking ? Number(traffic.views || 0) : null,
          tracking_started_at: tracking
            ? new Date(tracking).toISOString()
            : null,
        },
        business,
        finance,
        trend: trend.map((r) => ({
          ...r,
          visits:
            !tracking || r.day < istDay(new Date(tracking)) ? null : r.visits,
        })),
        queues,
        alerts,
        workers,
        activity,
      };
    });
  }
  async accounts(
    account: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof accountSearchInput>,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "SUPPORT",
      );
      await this.audit(client, user.id, "ADMIN_ACCOUNTS_INSPECTED", {
        reason: "Staff account directory",
        search: !!input.query,
      });
      const rows = (
        await client.query(
          `SELECT u.id,u.display_name,u.email,u.status,u.roles,u.created_at,u.email_verified_at,(SELECT max(a.created_at) FROM audit_events a WHERE a.user_id=u.id AND a.event_type='SESSION_CREATED') AS last_sign_in_at FROM users u WHERE NOT EXISTS(SELECT 1 FROM privacy_tombstones t WHERE t.user_id=u.id AND t.kind='DELETE') AND ($1='' OR strpos(lower(u.email),lower($1))>0 OR strpos(lower(u.display_name),lower($1))>0) AND ($2::uuid IS NULL OR (u.created_at,u.id)<(SELECT created_at,id FROM users WHERE id=$2::uuid)) ORDER BY u.created_at DESC,u.id DESC LIMIT 26`,
          [input.query, input.cursor || null],
        )
      ).rows;
      return {
        accounts: rows.slice(0, 25),
        next_cursor: rows.length > 25 ? rows[24].id : null,
      };
    });
  }
}
