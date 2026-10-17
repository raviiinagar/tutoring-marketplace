import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { Database } from "./database.js";
import type { Config } from "./config.js";
import { DiscoveryService, discoveryInput } from "./discovery.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import { ApiProblem } from "./errors.js";
export const searchObservation = z.strictObject({
  request_key: z.uuid(),
  filters: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});
export const metricsInput = z.strictObject({
  reason: z.string().trim().min(10).max(240),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
type Filters = z.infer<typeof discoveryInput>;
const rate = (n: number, d: number) => (d ? n / d : null);
export class MarketplaceMetrics {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly discovery: DiscoveryService,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async search(input: z.infer<typeof searchObservation>, ip: string) {
    const parsed = discoveryInput.safeParse(
      Object.fromEntries(
        Object.entries(input.filters).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    );
    if (!parsed.success)
      throw new ApiProblem(
        400,
        "INVALID_FILTER",
        "Choose valid structured search filters.",
      );
    await this.auth.limits.consume("observed-search-ip", ip, 600, 900000);
    const filters = parsed.data,
      page = await this.discovery.search(filters);
    // Pagination and internal GET probes are not new user search executions.
    if (filters.cursor) return page;
    const key = createHmac("sha256", this.config.authSecret)
        .update("search:" + input.request_key)
        .digest("hex"),
      fingerprint = createHash("sha256")
        .update(JSON.stringify(Object.entries(filters).sort()))
        .digest("hex");
    await this.database.transaction(async (client) => {
      await client.query(
        "DELETE FROM marketplace_search_receipts WHERE key_hash IN (SELECT key_hash FROM marketplace_search_receipts WHERE expires_at<=$1 ORDER BY expires_at LIMIT 1000)",
        [this.now()],
      );
      const inserted = await client.query(
        "INSERT INTO marketplace_search_receipts(key_hash,fingerprint,expires_at) VALUES($1,$2,$3) ON CONFLICT(key_hash) DO NOTHING",
        [key, fingerprint, new Date(this.now().getTime() + 7 * 86400000)],
      );
      if (!inserted.rowCount) {
        if (
          !(
            await client.query(
              "SELECT 1 FROM marketplace_search_receipts WHERE key_hash=$1 AND fingerprint=$2",
              [key, fingerprint],
            )
          ).rowCount
        )
          throw new ApiProblem(
            409,
            "SEARCH_KEY_CONFLICT",
            "Use a fresh request key for a different search.",
          );
        return;
      }
      const matched = page.offers.length ? 1 : 0,
        partial = !matched && page.next_cursor ? 1 : 0,
        empty = !matched && !partial ? 1 : 0;
      await client.query(
        `INSERT INTO marketplace_search_daily(day,domain_key,test_only,searches,matched,empty,partial) VALUES($1,$2,$3,1,$4,$5,$6)
    ON CONFLICT(day,domain_key,test_only) DO UPDATE SET searches=marketplace_search_daily.searches+1,matched=marketplace_search_daily.matched+EXCLUDED.matched,empty=marketplace_search_daily.empty+EXCLUDED.empty,partial=marketplace_search_daily.partial+EXCLUDED.partial`,
        [
          this.now().toISOString().slice(0, 10),
          filters.domain_id || "unclassified",
          this.config.mode !== "production",
          matched,
          empty,
          partial,
        ],
      );
    });
    return page;
  }
  async dashboard(
    account: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof metricsInput>,
  ) {
    const at = this.now(),
      today = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
      from =
        input.from ||
        new Date(today - 29 * 86400000).toISOString().slice(0, 10),
      to = input.to || new Date(today + 86400000).toISOString().slice(0, 10),
      start = new Date(from + "T00:00:00Z"),
      end = new Date(to + "T00:00:00Z");
    if (
      end <= start ||
      end.getTime() - start.getTime() > 90 * 86400000 ||
      end.getTime() > today + 86400000
    )
      throw new ApiProblem(
        400,
        "INVALID_COHORT",
        "Choose a UTC interval of 1 to 90 days ending no later than tomorrow.",
      );
    const testOnly = this.config.mode !== "production";
    return this.database.transaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const actor = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      await client.query(
        "INSERT INTO audit_events(id,user_id,event_type,correlation_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          actor.id,
          "MARKETPLACE_METRICS_INSPECTED",
          randomUUID(),
          { reason: input.reason, from, to },
          at,
        ],
      );
      const rows = (
        await client.query(
          "SELECT id,label FROM learning_domains ORDER BY position",
        )
      ).rows.map((row) => ({
        ...row,
        available_offers: 0,
        available_tutors: 0,
        covered_subjects: 0,
        searches: 0,
        matched_searches: 0,
        empty_searches: 0,
        partial_searches: 0,
        requests: 0,
        responses: 0,
        acceptances: 0,
        declines: 0,
        cancelled: 0,
        connections: 0,
        mature_requests: 0,
        mature_responses: 0,
        mature_connections: 0,
        average_response_ms: null,
        captured_purchases: 0,
        captured_paise: 0,
        unexpected_capture_paise: 0,
        refund_intents: 0,
        confirmed_refunds: 0,
        refunded_paise: 0,
        chargeback_paise: 0,
        mature_paid_purchases: 0,
        mature_matched_purchases: 0,
        mature_refunded_purchases: 0,
      }));
      rows.push({
        ...rows[0],
        id: "unclassified",
        label: "Unclassified / historical attribution unavailable",
      });
      const byId = new Map<string, Record<string, any>>(
        rows.map((r) => [r.id, r]),
      );
      const searches = (
        await client.query(
          "SELECT domain_key,sum(searches) AS searches,sum(matched) AS matched_searches,sum(empty) AS empty_searches,sum(partial) AS partial_searches FROM marketplace_search_daily WHERE day>=$1::date AND day<$2::date AND test_only=$3 GROUP BY domain_key",
          [from, to, testOnly],
        )
      ).rows;
      for (const s of searches) {
        const r = byId.get(s.domain_key) || byId.get("unclassified")!;
        for (const key of [
          "searches",
          "matched_searches",
          "empty_searches",
          "partial_searches",
        ])
          r[key] += Number(s[key]);
      }
      const requests = (
        await client.query(
          `SELECT r.offer_snapshot->>'domain_id' AS domain_id,count(*) AS requests,
    count(*) FILTER(WHERE d.decided_at<r.expires_at) AS responses,count(*) FILTER(WHERE d.decision='ACCEPT') AS acceptances,count(*) FILTER(WHERE d.decision='DECLINE') AS declines,count(*) FILTER(WHERE r.status='CANCELLED') AS cancelled,
    count(*) FILTER(WHERE g.connection_id IS NOT NULL AND c.status='ACTIVE') AS connections,
    count(*) FILTER(WHERE r.expires_at<=$3) AS mature_requests,count(*) FILTER(WHERE r.expires_at<=$3 AND d.decided_at<r.expires_at) AS mature_responses,
    count(*) FILTER(WHERE r.expires_at<=$3 AND g.connection_id IS NOT NULL AND c.status='ACTIVE') AS mature_connections,
    avg(extract(epoch from(d.decided_at-r.created_at))*1000) FILTER(WHERE d.decided_at<r.expires_at) AS average_response_ms
    FROM contact_requests r JOIN access_entitlements e ON e.id=r.entitlement_id JOIN learner_profiles learner ON learner.id=r.learner_id
    LEFT JOIN contact_request_decisions d ON d.request_id=r.id LEFT JOIN connections c ON c.request_id=r.id LEFT JOIN connection_access_grants g ON g.connection_id=c.id
    WHERE r.created_at>=$1 AND r.created_at<$2 AND r.created_at<=$3 AND e.test_only=$4 AND learner.status='ACTIVE'
    AND NOT EXISTS(SELECT 1 FROM privacy_tombstones t WHERE t.kind='DELETE' AND t.user_id IN (r.payer_id,r.tutor_id))
    AND NOT EXISTS(SELECT 1 FROM privacy_requests p WHERE p.kind='WITHDRAW' AND p.user_id=r.payer_id AND p.withdraw_scope->'request_ids' ? r.id::text)
    GROUP BY r.offer_snapshot->>'domain_id'`,
          [start, end, at, testOnly],
        )
      ).rows;
      for (const source of requests) {
        const r = byId.get(source.domain_id) || byId.get("unclassified")!;
        for (const [key, value] of Object.entries(source))
          if (key !== "domain_id")
            r[key] = value === null ? null : Number(value);
      }
      const purchases = (
        await client.query(
          `WITH cohort AS (
    SELECT p.* FROM purchase_cycles p WHERE p.test_only=$4 AND EXISTS(SELECT 1 FROM payment_journal j WHERE j.cycle_id=p.id AND j.kind='CAPTURE' AND j.captured_at>=$1 AND j.captured_at<$2 AND j.captured_at<=$3)
   ) SELECT f.domain_id,count(*) AS captured_purchases,sum(m.captured_paise) AS captured_paise,sum(m.unexpected_capture_paise) AS unexpected_capture_paise,
    sum(o.intents) AS refund_intents,sum(v.refunds) AS confirmed_refunds,sum(v.refunded_paise) AS refunded_paise,sum(v.chargeback_paise) AS chargeback_paise,
    count(*) FILTER(WHERE p.matching_deadline<=$3) AS mature_paid_purchases,
    count(*) FILTER(WHERE p.matching_deadline<=$3 AND e.starts_at<p.matching_deadline) AS mature_matched_purchases,
    count(*) FILTER(WHERE p.matching_deadline<=$3 AND v.refunded_paise>0) AS mature_refunded_purchases
    FROM cohort p LEFT JOIN purchase_domain_facts f ON f.cycle_id=p.id LEFT JOIN access_entitlements e ON e.cycle_id=p.id
    CROSS JOIN LATERAL(SELECT COALESCE(sum(j.amount_paise) FILTER(WHERE j.currency='INR'),0) AS captured_paise,COALESCE(sum(j.amount_paise) FILTER(WHERE j.kind='UNEXPECTED_CAPTURE' AND j.currency='INR'),0) AS unexpected_capture_paise FROM payment_journal j WHERE j.cycle_id=p.id AND j.captured_at<=$3) m
    CROSS JOIN LATERAL(SELECT count(*) AS intents FROM refund_operations r WHERE r.cycle_id=p.id AND r.created_at<=$3) o
    CROSS JOIN LATERAL(SELECT count(*) FILTER(WHERE r.kind='REFUND') AS refunds,COALESCE(sum(r.amount_paise) FILTER(WHERE r.kind='REFUND' AND r.currency='INR'),0) AS refunded_paise,COALESCE(sum(r.amount_paise) FILTER(WHERE r.kind='CHARGEBACK' AND r.currency='INR'),0) AS chargeback_paise FROM reversal_journal r WHERE r.cycle_id=p.id AND r.recorded_at<=$3) v
    GROUP BY f.domain_id`,
          [start, end, at, testOnly],
        )
      ).rows;
      for (const source of purchases) {
        const r = byId.get(source.domain_id) || byId.get("unclassified")!;
        for (const [key, value] of Object.entries(source))
          if (key !== "domain_id") r[key] += Number(value || 0);
      }
      const offers = await this.discovery.publicIndex(client);
      for (const row of rows) {
        const available = offers.filter((o) => o.offer.domain_id === row.id);
        row.available_offers = available.length;
        row.covered_subjects = new Set(
          available.map((o) => o.offer.subject_id),
        ).size;
        // Public offers deliberately omit account IDs; count Tutors through Listing
        // ownership internally without returning those identities in the dashboard.
        row.available_tutors = available.length
          ? Number(
              (
                await client.query(
                  "SELECT count(DISTINCT user_id) AS n FROM teaching_listings WHERE id=ANY($1::uuid[])",
                  [available.map((o) => o.id)],
                )
              ).rows[0].n,
            )
          : 0;
      }
      const domains = rows.map((row) => ({
        ...row,
        search_result_rate: rate(row.matched_searches, row.searches),
        mature_response_rate: rate(row.mature_responses, row.mature_requests),
        mature_connection_rate: rate(
          row.mature_connections,
          row.mature_requests,
        ),
        mature_paid_match_rate: rate(
          row.mature_matched_purchases,
          row.mature_paid_purchases,
        ),
        mature_paid_refund_rate: rate(
          row.mature_refunded_purchases,
          row.mature_paid_purchases,
        ),
      }));
      return {
        as_of: at.toISOString(),
        from,
        to,
        test_only: testOnly,
        currency: "INR",
        domains,
        estimated_teaching_outcomes: null,
        unique_customers: null,
        definitions: {
          searches:
            "Explicit first-page browser searches, not users; retries deduplicate for seven days. Cursor pages, bots using GET and internal probes are excluded. Unselected domains stay unclassified.",
          search_result_rate:
            "First-page searches with returned offers / all observed first-page searches. Partial pages remain explicit.",
          request_cohort:
            "Created in the UTC interval. Erased accounts and withdrawn Learner contexts are excluded. Connections mean an issued relationship, not attendance or current permission.",
          mature_response_rate:
            "On-time responses / all request-cohort requests whose recorded expiry has elapsed, including cancelled requests.",
          mature_connection_rate:
            "Issued Connections / matured request-cohort requests.",
          paid_cohort:
            "Distinct purchases with expected capture in the UTC interval, attributed once to the checkout Listing revision. Financial facts remain after erasure; unprovable historical attribution stays unclassified.",
          mature_paid_match_rate:
            "Purchases activated before their original matching deadline / captured-cohort purchases whose matching deadline elapsed.",
          mature_paid_refund_rate:
            "Mature captured-cohort purchases with a confirmed provider refund / mature captured-cohort purchases.",
          money:
            "INR gross captures, confirmed refunds and chargebacks are separate facts; refund intents are not returned money. Bank arrival, direct tuition, net profit and teaching outcomes are not measured.",
          supply:
            "Current eligible offers, distinct Tutors within each domain and covered Subjects. Tutor counts across domains must not be added as unique customers.",
        },
      };
    });
  }
}
