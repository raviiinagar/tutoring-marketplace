import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import { ApiProblem } from "./errors.js";
type Row = Record<string, any>;
export const testCoverage = (snapshot: Row) =>
  snapshot.source === "FIXTURE" || snapshot.test_only === true;
export const coverageAllowed = (config: Config, snapshot: Row) =>
  snapshot.source === "FIXTURE"
    ? config.mode !== "production"
    : ["PAYMENT", "COUPON"].includes(snapshot.source) &&
      snapshot.test_only === (config.mode !== "production");
const denied = (code: string, message: string) =>
  new ApiProblem(403, code, message);

// Callers hold sorted participant locks. Funding/activation always locks the
// purchase before its entitlement; cancellation/refund coordination uses this
// same purchase row. No provider calls occur inside these transactions.
export class PaidAccess {
  constructor(
    private readonly config: Config,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async funded(client: PoolClient, cycle: Row) {
    return (
      cycle.status === "CAPTURED" &&
      !cycle.resolution_required &&
      cycle.captured_at &&
      cycle.matching_deadline &&
      cycle.test_only === (this.config.mode !== "production") &&
      !!(
        await client.query(
          "SELECT 1 FROM payment_journal WHERE cycle_id=$1 AND kind='CAPTURE' AND provider_order_id=$2 AND amount_paise=$3 AND currency=$4 AND captured_at=$5",
          [
            cycle.id,
            cycle.provider_order_id,
            cycle.amount_paise,
            cycle.currency,
            cycle.captured_at,
          ],
        )
      ).rowCount
    );
  }
  async forPayer(client: PoolClient, payer: string, at: Date) {
    const cycle = (
      await client.query(
        "SELECT * FROM purchase_cycles WHERE payer_id=$1 AND open FOR UPDATE",
        [payer],
      )
    ).rows[0];
    at = this.now();
    if (cycle && (await this.funded(client, cycle))) {
      let grant = (
        await client.query(
          "SELECT * FROM access_entitlements WHERE cycle_id=$1 FOR UPDATE",
          [cycle.id],
        )
      ).rows[0];
      if (
        !grant &&
        new Date(cycle.captured_at) <= at &&
        new Date(cycle.matching_deadline) > at
      ) {
        grant = (
          await client.query(
            "INSERT INTO access_entitlements(id,payer_id,source,cycle_id,test_only,policy_version,status,captured_at,matching_deadline,created_at) VALUES($1,$2,'PAYMENT',$3,$4,$5,'MATCHING',$6,$7,$8) RETURNING *",
            [
              randomUUID(),
              payer,
              cycle.id,
              cycle.test_only,
              cycle.policy_version,
              cycle.captured_at,
              cycle.matching_deadline,
              at,
            ],
          )
        ).rows[0];
      }
      if (
        grant &&
        ((grant.status === "ACTIVE" &&
          new Date(grant.starts_at) <= at &&
          new Date(grant.ends_at) > at) ||
          (grant.status === "MATCHING" &&
            new Date(grant.captured_at) <= at &&
            new Date(grant.matching_deadline) > at))
      )
        return grant;
    }
    const coupon = (await client.query("SELECT e.* FROM access_entitlements e JOIN coupon_redemptions r ON r.id=e.coupon_redemption_id AND r.payer_id=e.payer_id WHERE e.payer_id=$1 AND e.source='COUPON' AND r.total_paise=0 AND e.test_only=$3 AND r.test_only=e.test_only AND ((e.status='ACTIVE' AND e.starts_at<=$2 AND e.ends_at>$2) OR (e.status='MATCHING' AND e.issued_at<=$2 AND e.matching_deadline>$2)) ORDER BY e.created_at DESC,e.id DESC LIMIT 1 FOR UPDATE OF e",[payer,at,this.config.mode!=='production'])).rows[0];
    if(coupon)return coupon;
    if (this.config.mode === "production") return undefined;
    return (
      await client.query(
        "SELECT * FROM access_entitlements WHERE payer_id=$1 AND source='FIXTURE' AND ((status='ACTIVE' AND starts_at<=$2 AND ends_at>$2) OR (status='MATCHING' AND captured_at<=$2 AND matching_deadline>$2)) ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE",
        [payer, at],
      )
    ).rows[0];
  }
  async forRequest(client: PoolClient, row: Row) {
    const snapshot = row.coverage_snapshot;
    if (!coverageAllowed(this.config, snapshot))
      throw denied(
        "COVERAGE_UNAVAILABLE",
        "This coverage cannot authorize a Connection.",
      );
    let cycle: Row | undefined;
    if (snapshot.source === "PAYMENT") {
      cycle = (
        await client.query(
          "SELECT * FROM purchase_cycles WHERE id=$1 AND payer_id=$2 FOR UPDATE",
          [snapshot.cycle_id, row.payer_id],
        )
      ).rows[0];
      if (!cycle || !(await this.funded(client, cycle)))
        throw denied(
          "ACCESS_REVOKED",
          "This purchase cannot authorize another Connection.",
        );
    }
    const grant = (
      await client.query(
        "SELECT * FROM access_entitlements WHERE id=$1 AND payer_id=$2 FOR UPDATE",
        [row.entitlement_id, row.payer_id],
      )
    ).rows[0];
    if (
      !grant ||
      grant.source !== snapshot.source ||
      (grant.test_only !== snapshot.test_only && grant.source !== 'FIXTURE') ||
      grant.policy_version !== snapshot.policy_version ||
      grant.status === "REVOKED" ||
      (cycle &&
        (grant.cycle_id !== cycle.id ||
          grant.test_only !== cycle.test_only ||
          grant.policy_version !== cycle.policy_version))
    )
      throw denied(
        "ACCESS_REVOKED",
        "The request coverage is unavailable or revoked.",
      );
    if(grant.source==='COUPON'&&!(await client.query('SELECT 1 FROM coupon_redemptions WHERE id=$1 AND payer_id=$2 AND total_paise=0 AND test_only=$3',[grant.coupon_redemption_id,row.payer_id,grant.test_only])).rowCount)
      throw denied('ACCESS_REVOKED','Coupon coverage is unavailable.');
    const submitted = new Date(row.created_at).getTime();
    const active =
      snapshot.status === "ACTIVE" &&
      new Date(snapshot.starts_at).getTime() <= submitted &&
      new Date(snapshot.ends_at).getTime() > submitted;
    const matching =
      snapshot.status === "MATCHING" &&
      new Date(snapshot.captured_at || snapshot.issued_at).getTime() <= submitted &&
      new Date(snapshot.matching_deadline).getTime() > submitted &&
      new Date(row.expires_at) <= new Date(snapshot.matching_deadline);
    if (!active && !matching)
      throw denied(
        "INVALID_COVERAGE",
        "The request was not covered at submission.",
      );
    return grant;
  }
  async activate(
    client: PoolClient,
    grant: Row,
    at: Date,
    decision: { actor_id: string; request_id: string; correlation: string },
  ) {
    if (!["PAYMENT", "COUPON"].includes(grant.source)) return grant.status === "ACTIVE";
    if (grant.status === "ACTIVE") return true;
    if (grant.status !== "MATCHING" || new Date(grant.matching_deadline) <= at)
      throw new ApiProblem(
        409,
        "REQUEST_EXPIRED",
        "The first matching deadline has passed.",
      );
    const policy = (
      await client.query(
        "SELECT access_days FROM payment_policies WHERE version=$1",
        [grant.policy_version],
      )
    ).rows[0];
    await client.query(
      "UPDATE access_entitlements SET status='ACTIVE',starts_at=$2,ends_at=$3 WHERE id=$1 AND status='MATCHING'",
      [grant.id, at, new Date(at.getTime() + policy.access_days * 86400000)],
    );
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,'ACCESS_PASS_ACTIVATED',$3,$4,$5)",
      [
        randomUUID(),
        decision.actor_id,
        decision.correlation,
        at,
        {
          target: grant.cycle_id,
          entitlement_id: grant.id,
          payer_id: grant.payer_id,
          request_id: decision.request_id,
        },
      ],
    );
    return true;
  }
  async summary(client: PoolClient, cycle: Row) {
    const grant = (
      await client.query(
        "SELECT status,starts_at,ends_at FROM access_entitlements WHERE cycle_id=$1",
        [cycle.id],
      )
    ).rows[0];
    const at = this.now();
    const usable = await this.funded(client, cycle);
    const status =
      !usable || grant?.status === "REVOKED"
        ? "UNAVAILABLE"
        : grant?.status === "ACTIVE"
          ? new Date(grant.ends_at) > at
            ? "ACTIVE"
            : "EXPIRED"
          : new Date(cycle.matching_deadline) > at
            ? "MATCHING"
            : "EXPIRED";
    return {
      status,
      starts_at: grant?.starts_at
        ? new Date(grant.starts_at).toISOString()
        : null,
      ends_at: grant?.ends_at ? new Date(grant.ends_at).toISOString() : null,
      test_only: cycle.test_only,
    };
  }
  async canRepurchase(client: PoolClient, cycle: Row) {
    if (!(await this.funded(client, cycle))) return false;
    const grant = (
      await client.query(
        "SELECT status,ends_at FROM access_entitlements WHERE cycle_id=$1 FOR UPDATE",
        [cycle.id],
      )
    ).rows[0];
    return grant?.status === "ACTIVE" && new Date(grant.ends_at) <= this.now();
  }
}
