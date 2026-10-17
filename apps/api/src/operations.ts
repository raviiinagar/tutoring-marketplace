import {
  operationJobs,
  completedOperation,
  jobScope,
  type JobKind,
} from "./operations-jobs.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { Database } from "./database.js";
import type { Config } from "./config.js";
import { StaffService } from "./staff.js";
import { ApiProblem } from "./errors.js";
export const operationReason = z.string().trim().min(10).max(240);
export const operationsQuery = z.strictObject({
  scope: z.enum(["SUPPORT", "FINANCE"]),
  reason: operationReason,
});
export const checkoutControl = z.strictObject({
  request_key: z.uuid(),
  revision: z.number().int().positive(),
  paused: z.boolean(),
  reason: operationReason,
});
export const observationInput = z.strictObject({
  request_key: z.uuid(),
  kind: z.enum(["WEBHOOK_DELIVERY", "BACKUP", "SECURITY"]),
  healthy: z.boolean(),
  observed_at: z.iso.datetime(),
  evidence_reference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{7,159}$/),
  reason: operationReason,
});
export const replayInput = z
  .strictObject({
    request_key: z.uuid(),
    kind: z.enum([
      "NOTIFICATION",
      "AUTH_MAIL",
      "PAYMENT_EVENT",
      "REFUND",
      "RECONCILIATION",
    ]),
    id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    reason: operationReason,
  })
  .refine(
    (v) => v.kind === "PAYMENT_EVENT" || z.uuid().safeParse(v.id).success,
    "Choose a valid operation reference",
  );
export async function checkoutOpen(
  client: Pick<PoolClient, "query">,
  lock = false,
) {
  const row = (
    await client.query(
      "SELECT paused FROM operations_checkout WHERE singleton" +
        (lock ? " FOR SHARE" : ""),
    )
  ).rows[0];
  return !!row && !row.paused;
}
export class Operations {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly staff: StaffService,
    private readonly now: () => Date = () => new Date(),
    private readonly recovery: Partial<
      Record<
        JobKind,
        (
          account: string | undefined,
          elevated: string | undefined,
          id: string,
          reason: string,
        ) => Promise<unknown>
      >
    > = {},
  ) {}
  async report(
    account: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof operationsQuery>,
  ) {
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(
        client,
        account,
        elevated,
        input.scope,
      );
      const correlation = randomUUID();
      await this.audit(client, actor.id, "OPERATIONS_INSPECTED", correlation, {
        scope: input.scope,
        reason: input.reason,
      });
      return {
        as_of: this.now().toISOString(),
        scope: input.scope,
        test_only: this.config.mode !== "production",
        correlation_id: correlation,
        checkout: (
          await client.query(
            "SELECT paused,revision,updated_at FROM operations_checkout WHERE singleton",
          )
        ).rows[0],
        routing: {
          email:
            this.config.operations?.ownerId &&
            (
              await client.query(
                "SELECT 1 FROM users u JOIN staff_accounts s ON s.user_id=u.id WHERE u.id=$1 AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL AND s.enabled AND $2=ANY(s.scopes)",
                [this.config.operations.ownerId, input.scope],
              )
            ).rowCount
              ? "CONFIGURED"
              : "CONFIG_REQUIRED",
          sms: !!this.config.sms?.operationsContentSid,
          outside_support_hours: true,
        },
        alerts: (
          await client.query(
            "SELECT id,code,scope,status,count,opened_at,last_seen_at,resolved_at FROM operations_alerts WHERE scope=$1 ORDER BY (status='OPEN') DESC,last_seen_at DESC LIMIT 100",
            [input.scope],
          )
        ).rows,
        jobs: await operationJobs(client, this.config, input.scope, this.now()),
        observations: (
          await client.query(
            "SELECT DISTINCT ON(kind) kind,healthy,observed_at,valid_until,(valid_until<=$2) AS stale FROM operations_observations WHERE ($1='FINANCE' AND kind='WEBHOOK_DELIVERY') OR ($1='SUPPORT' AND kind IN ('BACKUP','SECURITY')) ORDER BY kind,observed_at DESC,created_at DESC",
            [input.scope, this.now()],
          )
        ).rows,
        replays: (
          await client.query(
            "SELECT kind,target_id,status,correlation_id,created_at FROM operations_replays WHERE CASE WHEN kind IN ('NOTIFICATION','AUTH_MAIL') THEN 'SUPPORT' ELSE 'FINANCE' END=$1 ORDER BY created_at DESC LIMIT 20",
            [input.scope],
          )
        ).rows,
        job_limit: 100,
        monitor: (
          await client.query(
            "SELECT checked_at FROM operations_monitor_checkpoint WHERE singleton",
          )
        ).rows[0],
      };
    });
  }
  private async audit(
    client: PoolClient,
    actor: string,
    event: string,
    correlation: string,
    metadata: unknown,
  ) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), actor, event, correlation, metadata, this.now()],
    );
  }
  async checkout(
    account: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof checkoutControl>,
  ) {
    return this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      await client.query(
        "SELECT 1 FROM operations_checkout WHERE singleton FOR UPDATE",
      );
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      const previous = (
        await client.query(
          "SELECT * FROM operations_commands WHERE request_key=$1",
          [input.request_key],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.actor_id !== actor.id ||
          previous.fingerprint !== fingerprint
        )
          throw new ApiProblem(
            409,
            "COMMAND_KEY_CONFLICT",
            "Use a fresh command key for different fields.",
          );
        return previous.result;
      }
      const updated = (
        await client.query(
          "UPDATE operations_checkout SET paused=$1,revision=revision+1,updated_at=$2 WHERE singleton AND revision=$3 RETURNING paused,revision,updated_at",
          [input.paused, this.now(), input.revision],
        )
      ).rows[0];
      if (!updated)
        throw new ApiProblem(
          409,
          "CONTROL_CHANGED",
          "Reload the current checkout control before changing it.",
        );
      const correlation = randomUUID(),
        result = { checkout: updated, correlation_id: correlation };
      await client.query(
        "INSERT INTO operations_commands VALUES($1,$2,$3,$4,$5,$6)",
        [
          input.request_key,
          actor.id,
          fingerprint,
          correlation,
          result,
          this.now(),
        ],
      );
      await this.audit(
        client,
        actor.id,
        input.paused ? "CHECKOUT_PAUSED" : "CHECKOUT_RESUMED",
        correlation,
        { reason: input.reason, revision: updated.revision },
      );
      return result;
    });
  }
  async replay(
    account: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof replayInput>,
  ) {
    const scope = jobScope(input.kind),
      fingerprint = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex"),
      lease = randomUUID();
    const reservation = await this.database.transaction(async (client) => {
      const actor = await this.staff.authorize(
        client,
        account,
        elevated,
        scope,
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["operation-replay:" + input.request_key],
      );
      const old = (
        await client.query(
          "SELECT * FROM operations_replays WHERE request_key=$1 FOR UPDATE",
          [input.request_key],
        )
      ).rows[0];
      if (old) {
        if (old.actor_id !== actor.id || old.fingerprint !== fingerprint)
          throw new ApiProblem(
            409,
            "COMMAND_KEY_CONFLICT",
            "Use a fresh command key for different recovery fields.",
          );
        if (old.status === "SCHEDULED") return { done: old.result };
        if (
          old.status === "REQUESTED" &&
          new Date(old.lease_until) > this.now()
        )
          throw new ApiProblem(
            409,
            "REPLAY_IN_PROGRESS",
            "The original recovery command is still being scheduled.",
          );
      }
      const job = (
        await operationJobs(client, this.config, scope, this.now(), input)
      )[0];
      if (
        !job &&
        old &&
        (await completedOperation(client, this.config, input.kind, input.id))
      ) {
        const result = { scheduled: false, correlation_id: old.correlation_id };
        await client.query(
          "UPDATE operations_replays SET status='SCHEDULED',result=$2,lease_token=NULL,lease_until=NULL,updated_at=$3 WHERE request_key=$1",
          [input.request_key, result, this.now()],
        );
        return { done: result };
      }
      if (!job)
        throw new ApiProblem(
          404,
          "OPERATION_NOT_FOUND",
          "This unfinished operation is not available.",
        );
      if (job.recovery !== "REPLAY")
        throw new ApiProblem(
          409,
          "RECOVERY_REVIEW_REQUIRED",
          "This operation needs provider reconciliation, an existing lease, or a fresh unexpired request.",
        );
      const correlation = old?.correlation_id || randomUUID();
      await client.query(
        "INSERT INTO operations_replays(request_key,actor_id,kind,target_id,fingerprint,correlation_id,status,lease_token,lease_until,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'REQUESTED',$7,$8,$9,$9) ON CONFLICT(request_key) DO UPDATE SET status='REQUESTED',lease_token=$7,lease_until=$8,updated_at=$9",
        [
          input.request_key,
          actor.id,
          input.kind,
          input.id,
          fingerprint,
          correlation,
          lease,
          new Date(this.now().getTime() + 60000),
          this.now(),
        ],
      );
      await this.audit(
        client,
        actor.id,
        "OPERATION_REPLAY_REQUESTED",
        correlation,
        {
          kind: input.kind,
          target: input.id,
          request_key: input.request_key,
          reason: input.reason,
        },
      );
      return { correlation };
    });
    if (reservation.done) return reservation.done;
    try {
      let scheduled = true;
      if (input.kind === "PAYMENT_EVENT" || input.kind === "AUTH_MAIL")
        await this.database.transaction(async (client) => {
          await this.staff.authorize(client, account, elevated, scope);
          if (input.kind === "PAYMENT_EVENT")
            scheduled = !!(
              await client.query(
                "UPDATE payment_webhook_inbox SET next_attempt_at=$2 WHERE event_id=$1 AND provider_key_id=$3 AND status IN ('PENDING','UNMATCHED')",
                [input.id, this.now(), this.config.payments?.keyId || ""],
              )
            ).rowCount;
          else
            scheduled = !!(
              await client.query(
                "UPDATE mail_outbox SET status='PENDING',available_at=$2,lease_until=NULL WHERE id=$1 AND expires_at>$2 AND (status IN ('PENDING','FAILED') OR (status='PROCESSING' AND lease_until<=$2))",
                [input.id, this.now()],
              )
            ).rowCount;
        });
      else {
        const command = this.recovery[input.kind];
        if (!command)
          throw new ApiProblem(
            503,
            "RECOVERY_UNAVAILABLE",
            "Configure this operation recovery command.",
          );
        const result = await command(account, elevated, input.id, input.reason);
        scheduled = (result as { scheduled?: boolean })?.scheduled !== false;
      }
      const result = { scheduled, correlation_id: reservation.correlation };
      await this.database.pool.query(
        "UPDATE operations_replays SET status='SCHEDULED',result=$3,lease_token=NULL,lease_until=NULL,updated_at=$4 WHERE request_key=$1 AND lease_token=$2",
        [input.request_key, lease, result, this.now()],
      );
      return result;
    } catch (error) {
      await this.database.pool.query(
        "UPDATE operations_replays SET status='FAILED',lease_token=NULL,lease_until=NULL,updated_at=$3 WHERE request_key=$1 AND lease_token=$2",
        [input.request_key, lease, this.now()],
      );
      throw error;
    }
  }

  async observe(
    account: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof observationInput>,
  ) {
    return this.database.transaction(async (client) => {
      const scope = input.kind === "WEBHOOK_DELIVERY" ? "FINANCE" : "SUPPORT",
        actor = await this.staff.authorize(client, account, elevated, scope);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["operation-command:" + input.request_key],
      );
      const fingerprint = createHash("sha256")
          .update(JSON.stringify(input))
          .digest("hex"),
        previous = (
          await client.query(
            "SELECT * FROM operations_commands WHERE request_key=$1",
            [input.request_key],
          )
        ).rows[0];
      if (previous) {
        if (
          previous.actor_id !== actor.id ||
          previous.fingerprint !== fingerprint
        )
          throw new ApiProblem(
            409,
            "COMMAND_KEY_CONFLICT",
            "Use a fresh key for different observation fields.",
          );
        return previous.result;
      }
      const observed = new Date(input.observed_at),
        at = this.now(),
        window = input.kind === "BACKUP" ? 86400000 : 900000;
      if (observed > at || at.getTime() - observed.getTime() >= window)
        throw new ApiProblem(
          400,
          "STALE_OBSERVATION",
          "Record current evidence within the observation window.",
        );
      await client.query(
        "INSERT INTO operations_observations VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          input.request_key,
          input.kind,
          input.healthy,
          observed,
          new Date(observed.getTime() + window),
          input.evidence_reference,
          actor.id,
          at,
        ],
      );
      const correlation = randomUUID(),
        result = { recorded: true, correlation_id: correlation };
      await client.query(
        "INSERT INTO operations_commands VALUES($1,$2,$3,$4,$5,$6)",
        [input.request_key, actor.id, fingerprint, correlation, result, at],
      );
      await this.audit(
        client,
        actor.id,
        "OPERATION_HEALTH_OBSERVED",
        correlation,
        {
          kind: input.kind,
          healthy: input.healthy,
          evidence_reference: input.evidence_reference,
          reason: input.reason,
        },
      );
      return result;
    });
  }
}
