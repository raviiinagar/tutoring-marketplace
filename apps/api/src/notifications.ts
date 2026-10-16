import { randomUUID, createHmac } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import { ConnectionsService } from "./connections.js";
import { DiscoveryService } from "./discovery.js";
import { ApiProblem } from "./errors.js";
import { CatalogueService } from "./catalogue.js";
import { TutorsService } from "./tutors.js";
import { ListingsService } from "./listings.js";
import { LearnersService } from "./learners.js";
import { PaidAccess } from "./paid-access.js";
import { evidenceScanner } from "./evidence-scanner.js";
import { guardianVerifier } from "./guardian-verifier.js";
import { decrypt, tokenHash } from "./security.js";
import {
  ConfiguredNotificationDelivery,
  DeliveryConfigurationError,
  DeliveryUnknownError,
  type NotificationDelivery,
} from "./notification-delivery.js";
type Row = Record<string, any>;
export const notificationPreferencesInput = z.strictObject({
  enquiry_email: z.boolean(),
  chat_email: z.boolean(),
  availability_email: z.boolean(),
  marketing_email: z.boolean(),
  notice_version: z.literal("notification-preferences-v1"),
});
const defaults = {
  enquiry_email: true,
  chat_email: true,
  availability_email: true,
  marketing_email: false,
  notice_version: "notification-preferences-v1",
};
export class NotificationsService {
  readonly delivery: NotificationDelivery;
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly connections: ConnectionsService,
    private readonly discovery: DiscoveryService,
    private readonly now: () => Date = () => new Date(),
    delivery?: NotificationDelivery,
  ) {
    this.delivery = delivery || new ConfiguredNotificationDelivery(config);
    if (config.mode === "production" && this.delivery.testOnly)
      throw new Error("Test notification delivery is forbidden in production");
  }
  private project(row: Row) {
    return {
      id: row.id,
      target_id: row.target_id,
      template: row.template,
      template_version: row.template_version,
      category: row.category,
      channel: row.channel,
      mandatory: row.mandatory,
      status: row.status,
      attempts: row.attempts,
      last_error: row.last_error,
      provider_reference: row.provider_reference,
      created_at: new Date(row.created_at).toISOString(),
      sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
      test_only: row.test_only,
    };
  }
  async list(token: string | undefined) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      return {
        notifications: (
          await client.query(
            "SELECT * FROM notification_outbox WHERE recipient_id=$1 AND (NOT $2::boolean OR NOT test_only) ORDER BY created_at DESC,id DESC LIMIT 50",
            [user.id, this.config.mode === "production"],
          )
        ).rows.map((row) => this.project(row)),
        delivery_mode: this.delivery.testOnly ? "LOCAL_CAPTURE" : "PROVIDER",
      };
    });
  }
  async preferences(token: string | undefined) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const row = (
        await client.query(
          "SELECT * FROM notification_preferences WHERE user_id=$1",
          [user.id],
        )
      ).rows[0];
      return {
        preferences: row
          ? {
              enquiry_email: row.enquiry_email,
              chat_email: row.chat_email,
              availability_email: row.availability_email,
              marketing_email: row.marketing_email,
              notice_version: row.notice_version,
            }
          : defaults,
        service_email: true,
        policy: {
          notice_version: defaults.notice_version,
          notice:
            "Financial and account-security service notices remain enabled. Availability alerts require a separate verified subscription. Marketing is optional and off by default.",
          critical_sms_audience: "VERIFIED_OPERATIONS_OWNER_ONLY",
        },
      };
    });
  }
  async updatePreferences(
    token: string | undefined,
    input: z.infer<typeof notificationPreferencesInput>,
  ) {
    await this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      await client.query(
        "INSERT INTO notification_preferences(user_id,enquiry_email,chat_email,availability_email,marketing_email,notice_version,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET enquiry_email=EXCLUDED.enquiry_email,chat_email=EXCLUDED.chat_email,availability_email=EXCLUDED.availability_email,marketing_email=EXCLUDED.marketing_email,notice_version=EXCLUDED.notice_version,updated_at=EXCLUDED.updated_at",
        [
          user.id,
          input.enquiry_email,
          input.chat_email,
          input.availability_email,
          input.marketing_email,
          input.notice_version,
          this.now(),
        ],
      );
      if (!input.availability_email) {
        const hash = createHmac("sha256", this.config.authSecret)
          .update("availability:" + user.email)
          .digest("hex");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [hash],
        );
        const withdrawn = (
          await client.query(
            "UPDATE availability_subscriptions SET status='WITHDRAWN',encrypted_contact=NULL,verification_hash=NULL,verification_expires_at=NULL,updated_at=$2 WHERE email_hash=$1 AND status IN ('PENDING','ACTIVE','MATCH_FOUND') RETURNING id",
            [hash, this.now()],
          )
        ).rows;
        if (withdrawn.length) {
          await client.query(
            "UPDATE availability_notification_intents SET status='CANCELLED' WHERE subscription_id=ANY($1::uuid[]) AND status='PENDING'",
            [withdrawn.map((row) => row.id)],
          );
          await client.query(
            "UPDATE mail_outbox SET status='EXPIRED' WHERE availability_subscription_id=ANY($1::uuid[]) AND status IN ('PENDING','PROCESSING')",
            [withdrawn.map((row) => row.id)],
          );
        }
      }
      await client.query(
        "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,'NOTIFICATION_PREFERENCES_CHANGED',$3,$4,$5)",
        [
          randomUUID(),
          user.id,
          randomUUID(),
          this.now(),
          { target: user.id, ...input },
        ],
      );
    });
    return this.preferences(token);
  }
  private async bridgeAvailability() {
    return this.database.transaction(async (client) => {
      const row = (
        await client.query(
          "SELECT i.*,s.test_only FROM availability_notification_intents i JOIN availability_subscriptions s ON s.id=i.subscription_id WHERE i.status='PENDING' AND i.delivered_at IS NULL AND s.status='MATCH_FOUND' AND i.generation=s.generation AND s.expires_at>$1 AND (NOT $2::boolean OR NOT s.test_only) AND NOT EXISTS(SELECT 1 FROM notification_outbox n WHERE n.source_key='availability:'||i.id::text) ORDER BY i.matched_at,i.id LIMIT 1 FOR UPDATE OF i SKIP LOCKED",
          [this.now(), this.config.mode === "production"],
        )
      ).rows[0];
      if (!row) return false;
      await client.query(
        "SELECT queue_notification($1,NULL,'AVAILABILITY_MATCH',$2,NULL,$3,$4,$2)",
        ["availability:" + row.id, row.id, row.test_only, this.now()],
      );
      return true;
    });
  }
  private async availabilityPermission(job: Row) {
    return this.database.transaction(async (client) => {
      const row = (
        await client.query(
          "SELECT i.status AS intent_status,i.generation AS intent_generation,i.delivered_at,s.* FROM availability_notification_intents i JOIN availability_subscriptions s ON s.id=i.subscription_id WHERE i.id=$1 FOR UPDATE OF s",
          [job.availability_intent_id],
        )
      ).rows[0];
      if (
        !row ||
        row.intent_status !== "PENDING" ||
        row.status !== "MATCH_FOUND" ||
        row.delivered_at ||
        row.generation !== row.intent_generation ||
        new Date(row.expires_at) <= this.now() ||
        (this.config.mode === "production" && row.test_only)
      )
        return { suppressed: "AVAILABILITY_CONSENT_UNAVAILABLE" };
      const contact = decrypt<{ email: string; unsubscribe_token?: string }>(
        row.encrypted_contact,
        this.config.authSecret,
      );
      const account = (
        await client.query(
          "SELECT p.availability_email FROM users u JOIN notification_preferences p ON p.user_id=u.id WHERE u.email=$1 AND u.email_verified_at IS NOT NULL",
          [contact.email],
        )
      ).rows[0];
      if (account && !account.availability_email)
        return { suppressed: "PREFERENCE_DISABLED" };
      let unsubscribe = contact.unsubscribe_token;
      if (!unsubscribe) {
        const previous = (
          await client.query(
            "SELECT encrypted_payload FROM mail_outbox WHERE availability_subscription_id=$1 ORDER BY created_at DESC LIMIT 1",
            [row.id],
          )
        ).rows[0];
        if (previous) {
          const payload = decrypt<{ availability_unsubscribe_url: string }>(
            previous.encrypted_payload,
            this.config.authSecret,
          );
          unsubscribe = new URL(
            payload.availability_unsubscribe_url,
          ).hash.slice(7);
        }
      }
      if (!unsubscribe || tokenHash(unsubscribe) !== row.unsubscribe_hash)
        return { suppressed: "AVAILABILITY_CONSENT_UNAVAILABLE" };
      let offer;
      try {
        offer = await this.discovery.firstAvailable(row.selection);
      } catch (error) {
        if (!(error instanceof ApiProblem)) throw error;
      }
      if (!offer) return { defer: "AVAILABILITY_NOT_READY" };
      return {
        to: contact.email,
        url: this.config.webOrigin + "/tutors/" + offer.id,
        unsubscribe:
          this.config.webOrigin +
          "/availability/unsubscribe#token=" +
          unsubscribe,
      };
    });
  }
  private async permission(
    job: Row,
  ): Promise<{
    to?: string;
    url?: string;
    unsubscribe?: string;
    suppressed?: string;
    defer?: string;
  }> {
    if (job.channel === "SMS") {
      const row = (
        await this.database.pool.query(
          "SELECT r.status,r.last_error,p.test_only FROM refund_operations r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE r.id=$1",
          [job.target_id],
        )
      ).rows[0];
      if (
        !row ||
        (this.config.mode === "production" && row.test_only) ||
        (!["FAILED", "REVIEW"].includes(row.status) &&
          !(
            row.status === "WAITING_RESERVE" &&
            row.last_error === "INSUFFICIENT_RESERVE"
          ))
      )
        return { suppressed: "OPERATION_ALREADY_RESOLVED" };
      if (!this.delivery.smsConfigured)
        throw new DeliveryConfigurationError("Critical SMS is not configured");
      return { url: this.config.webOrigin + "/staff/notifications" };
    }
    if (job.category === "AVAILABILITY")
      return this.availabilityPermission(job);
    return this.database.transaction(async (client) => {
      const user = (
        await client.query(
          "SELECT id,email FROM users WHERE id=$1 AND status='ACTIVE' AND email_verified_at IS NOT NULL",
          [job.recipient_id],
        )
      ).rows[0];
      if (!user) return { suppressed: "RECIPIENT_UNAVAILABLE" };
      const prefs =
        (
          await client.query(
            "SELECT * FROM notification_preferences WHERE user_id=$1",
            [user.id],
          )
        ).rows[0] || defaults;
      if (
        !job.mandatory &&
        ((job.category === "ENQUIRY" && !prefs.enquiry_email) ||
          (job.category === "CHAT" && !prefs.chat_email) ||
          (job.category === "MARKETING" && !prefs.marketing_email))
      )
        return { suppressed: "PREFERENCE_DISABLED" };
      let path = "/payments/history";
      if (job.category === "ENQUIRY") {
        const expected =
          job.template === "REQUEST_EXPIRED"
            ? "EXPIRED"
            : job.template === "REQUEST_DECISION"
              ? "DECIDED"
              : "PENDING";
        if (
          !(await this.connections.notificationAllowed(
            client,
            "REQUEST",
            job.target_id,
            user.id,
            expected,
          ))
        )
          return { suppressed: "INTERACTION_UNAVAILABLE" };
        path = job.audience === "TUTOR" ? "/tutor/requests" : "/requests";
      } else if (job.category === "CHAT") {
        if (
          !(await this.connections.notificationAllowed(
            client,
            "CONNECTION",
            job.target_id,
            user.id,
          ))
        )
          return { suppressed: "INTERACTION_UNAVAILABLE" };
        path = "/chat/" + job.target_id;
        const read = (
          await client.query(
            "SELECT p.last_read_sequence FROM conversations c JOIN conversation_read_positions p ON p.conversation_id=c.id WHERE c.connection_id=$1 AND p.user_id=$2",
            [job.target_id, user.id],
          )
        ).rows[0];
        if (
          read &&
          Number(read.last_read_sequence) >= Number(job.message_sequence)
        )
          return { suppressed: "MESSAGE_ALREADY_READ" };
      }
      return { to: user.email, url: this.config.webOrigin + path };
    });
  }
  private async smsBudget(job: Row) {
    return this.database.transaction(async (client) => {
      const owned = (
        await client.query(
          "SELECT lease_token FROM notification_outbox WHERE id=$1 FOR UPDATE",
          [job.id],
        )
      ).rows[0];
      if (owned.lease_token !== job.lease_token) return false;
      const day = this.now().toISOString().slice(0, 10);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["notification-sms-budget:" + day],
      );
      const count = Number(
        (
          await client.query(
            "SELECT count(*) FROM notification_sms_budget b JOIN notification_outbox n ON n.id=b.notification_id WHERE b.day=$1::date AND (NOT $2::boolean OR NOT n.test_only)",
            [day, this.config.mode === "production"],
          )
        ).rows[0].count,
      );
      if (count >= (this.config.sms?.dailyLimit ?? 5)) return false;
      await client.query(
        "INSERT INTO notification_sms_budget(notification_id,attempt,day) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [job.id, job.attempts, day],
      );
      return true;
    });
  }
  private async audit(
    client: PoolClient,
    actor: string,
    event: string,
    target: string,
    reason: string,
  ) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        actor,
        event,
        randomUUID(),
        this.now(),
        { target, reason },
      ],
    );
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
        "SUPPORT",
      );
      await this.audit(
        client,
        user.id,
        "NOTIFICATION_QUEUE_READ",
        "notification-outbox",
        reason,
      );
      return {
        notifications: (
          await client.query(
            `SELECT * FROM notification_outbox WHERE NOT $1::boolean OR NOT test_only ORDER BY CASE WHEN status IN ('PENDING','PROCESSING','FAILED','CONFIG_REQUIRED','UNKNOWN') THEN 0 ELSE 1 END,updated_at DESC,id DESC LIMIT 100`,
            [this.config.mode === "production"],
          )
        ).rows.map((row) => this.project(row)),
        sms_configured: this.delivery.smsConfigured,
        sms_daily_limit: this.config.sms?.dailyLimit ?? 5,
        delivery_mode: this.delivery.testOnly ? "LOCAL_CAPTURE" : "PROVIDER",
      };
    });
  }
  async retry(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "SUPPORT",
      );
      const row = (
        await client.query(
          "SELECT * FROM notification_outbox WHERE id=$1 AND (NOT $2::boolean OR NOT test_only) FOR UPDATE",
          [id, this.config.mode === "production"],
        )
      ).rows[0];
      if (!row)
        throw new ApiProblem(404, "NOT_FOUND", "Notification not found.");
      if (["SENT", "SUPPRESSED"].includes(row.status))
        return { scheduled: false, replayed: true };
      if (
        row.channel === "SMS" &&
        ["UNKNOWN", "PROCESSING"].includes(row.status)
      )
        throw new ApiProblem(
          409,
          "PROVIDER_RESULT_UNKNOWN",
          "Reconcile the original SMS provider reference before any resend.",
        );
      if (row.status === "PROCESSING" && new Date(row.lease_until) > this.now())
        throw new ApiProblem(
          409,
          "DELIVERY_IN_PROGRESS",
          "Delivery is already processing.",
        );
      await client.query(
        "UPDATE notification_delivery_attempts SET finished_at=$2,outcome='LEASE_EXPIRED' WHERE notification_id=$1 AND finished_at IS NULL",
        [id, this.now()],
      );
      await client.query(
        "UPDATE notification_outbox SET status='PENDING',lease_token=NULL,lease_until=NULL,available_at=$2,updated_at=$2 WHERE id=$1",
        [id, this.now()],
      );
      await this.audit(
        client,
        user.id,
        "NOTIFICATION_RETRY_REQUESTED",
        id,
        reason,
      );
      return { scheduled: true };
    });
  }
  async reconcileSms(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reference: string,
    reason: string,
  ) {
    const job = await this.database.transaction(async (client) => {
      await this.staff.authorize(client, account, elevated, "SUPPORT");
      const row = (
        await client.query(
          "SELECT * FROM notification_outbox WHERE id=$1 AND (NOT $2::boolean OR NOT test_only)",
          [id, this.config.mode === "production"],
        )
      ).rows[0];
      if (!row || row.channel !== "SMS")
        throw new ApiProblem(404, "NOT_FOUND", "Critical SMS not found.");
      if (
        row.status !== "UNKNOWN" &&
        !(row.status === "SENT" && row.provider_reference === reference)
      )
        throw new ApiProblem(
          409,
          "DELIVERY_STATE_CHANGED",
          "Only an unknown SMS requires provider confirmation.",
        );
      return row;
    });
    if (job.status === "SENT") return { reconciled: true, replayed: true };
    if (!this.delivery.reconcileCriticalSms)
      throw new ApiProblem(
        503,
        "PROVIDER_LOOKUP_UNAVAILABLE",
        "Configure provider lookup before reconciling this SMS.",
      );
    const result = await this.delivery.reconcileCriticalSms(reference, {
      id: job.id,
      reference: job.target_id,
      url: this.config.webOrigin + "/staff/notifications",
    });
    if (result.reference !== reference)
      throw new ApiProblem(
        409,
        "PROVIDER_IDENTITY_CONFLICT",
        "The provider reference does not match.",
      );
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "SUPPORT",
      );
      const row = (
        await client.query(
          "SELECT * FROM notification_outbox WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (row.status !== "UNKNOWN") {
        if (row.status === "SENT" && row.provider_reference === reference)
          return { reconciled: true, replayed: true };
        throw new ApiProblem(
          409,
          "DELIVERY_STATE_CHANGED",
          "The delivery state changed.",
        );
      }
      await client.query(
        "UPDATE notification_outbox SET status=$2,provider_reference=$3,last_error=NULL,updated_at=$4,sent_at=CASE WHEN $2='SENT' THEN $4 ELSE sent_at END WHERE id=$1",
        [
          id,
          result.status === "ACCEPTED" ? "SENT" : "FAILED",
          reference,
          this.now(),
        ],
      );
      await this.audit(
        client,
        user.id,
        "NOTIFICATION_PROVIDER_RECONCILED",
        id,
        reason,
      );
      return { reconciled: true };
    });
  }
  private async finish(
    job: Row,
    status: string,
    error: string | null = null,
    reference: string | null = null,
    delay = 0,
  ) {
    await this.database.transaction(async (client) => {
      const changed = await client.query(
        "UPDATE notification_outbox SET status=$2,last_error=$3,provider_reference=COALESCE($4,provider_reference),lease_token=NULL,lease_until=NULL,available_at=$5,updated_at=$6,sent_at=CASE WHEN $2='SENT' THEN $6 ELSE sent_at END WHERE id=$1 AND lease_token=$7",
        [
          job.id,
          status,
          error,
          reference,
          new Date(this.now().getTime() + delay),
          this.now(),
          job.lease_token,
        ],
      );
      if (changed.rowCount) {
        await client.query(
          "UPDATE notification_delivery_attempts SET finished_at=$3,outcome=$4,error_code=$5,provider_reference=$6 WHERE notification_id=$1 AND attempt=$2 AND finished_at IS NULL",
          [job.id, job.attempts, this.now(), status, error, reference],
        );
        if (status === "SENT" && job.availability_intent_id)
          await client.query(
            "UPDATE availability_notification_intents SET delivered_at=$2 WHERE id=$1 AND delivered_at IS NULL",
            [job.availability_intent_id, this.now()],
          );
      }
    });
  }
  async tick(): Promise<boolean> {
    const bridged = await this.bridgeAvailability();
    const job = await this.database.transaction(async (client) => {
      const found = (
        await client.query(
          "SELECT n.*,t.subject,t.body FROM notification_outbox n JOIN notification_templates t ON t.template=n.template AND t.version=n.template_version WHERE (NOT $1::boolean OR NOT n.test_only) AND ((n.status='PENDING' AND n.available_at<=$2) OR (n.status='PROCESSING' AND n.lease_until<=$2)) ORDER BY n.available_at,n.id LIMIT 1 FOR UPDATE OF n SKIP LOCKED",
          [this.config.mode === "production", this.now()],
        )
      ).rows[0];
      if (!found) return;
      if (found.status === "PROCESSING") {
        await client.query(
          "UPDATE notification_delivery_attempts SET finished_at=$3,outcome=$4,error_code=$5 WHERE notification_id=$1 AND attempt=$2 AND finished_at IS NULL",
          [
            found.id,
            found.attempts,
            this.now(),
            found.channel === "SMS" ? "UNKNOWN" : "LEASE_EXPIRED",
            found.channel === "SMS" ? "SMS_PROVIDER_RESULT_UNKNOWN" : null,
          ],
        );
        if (found.channel === "SMS") {
          await client.query(
            "UPDATE notification_outbox SET status='UNKNOWN',last_error='SMS_PROVIDER_RESULT_UNKNOWN',lease_token=NULL,lease_until=NULL,updated_at=$2 WHERE id=$1",
            [found.id, this.now()],
          );
          return { ...found, noDelivery: true };
        }
      }
      const lease = randomUUID();
      const attempts = found.attempts + 1;
      await client.query(
        "UPDATE notification_outbox SET status='PROCESSING',attempts=$2,lease_token=$3,lease_until=$4,updated_at=$5 WHERE id=$1",
        [
          found.id,
          attempts,
          lease,
          new Date(this.now().getTime() + 60000),
          this.now(),
        ],
      );
      await client.query(
        "INSERT INTO notification_delivery_attempts(notification_id,attempt,started_at) VALUES($1,$2,$3)",
        [found.id, attempts, this.now()],
      );
      return { ...found, lease_token: lease, attempts };
    });
    if (!job) return bridged;
    if (job.noDelivery) return true;
    try {
      const permission = await this.permission(job);
      if (permission.suppressed) {
        await this.finish(job, "SUPPRESSED", permission.suppressed);
        return true;
      }
      if (permission.defer) {
        await this.finish(job, "PENDING", permission.defer, null, 300000);
        return true;
      }
      const owned = await this.database.pool.query(
        "UPDATE notification_outbox SET lease_until=$2 WHERE id=$1 AND lease_token=$3",
        [job.id, new Date(this.now().getTime() + 60000), job.lease_token],
      );
      if (!owned.rowCount) return true;
      if (job.channel === "SMS") {
        if (!(await this.smsBudget(job))) {
          await this.finish(job, "CONFIG_REQUIRED", "SMS_DAILY_LIMIT");
          return true;
        }
        const result = await this.delivery.sendCriticalSms({
          id: job.id,
          reference: job.target_id,
          url: permission.url!,
        });
        await this.finish(job, "SENT", null, result.reference);
      } else {
        const result = await this.delivery.sendEmail({
          id: job.id,
          to: permission.to!,
          subject: (job.test_only ? "[Test] " : "") + job.subject,
          text:
            job.body
              .replaceAll("[[url]]", permission.url!)
              .replaceAll("\\n", "\n") +
            (permission.unsubscribe
              ? "\n\nUnsubscribe this optional availability alert:\n" +
                permission.unsubscribe
              : ""),
          url: permission.url!,
        });
        await this.finish(job, "SENT", null, result.reference);
      }
    } catch (error) {
      if (error instanceof DeliveryConfigurationError)
        await this.finish(job, "CONFIG_REQUIRED", "DELIVERY_NOT_CONFIGURED");
      else if (job.channel === "SMS" && error instanceof DeliveryUnknownError)
        await this.finish(job, "UNKNOWN", "SMS_PROVIDER_RESULT_UNKNOWN");
      else {
        const failures =
          Number(
            (
              await this.database.pool.query(
                "SELECT count(*) FROM notification_delivery_attempts WHERE notification_id=$1 AND error_code='DELIVERY_RETRY'",
                [job.id],
              )
            ).rows[0].count,
          ) + 1;
        await this.finish(
          job,
          failures >= 5 ? "FAILED" : "PENDING",
          "DELIVERY_RETRY",
          null,
          Math.min(3600000, 2 ** failures * 1000),
        );
      }
    }
    return true;
  }
}

export function notificationWorker(
  database: Database,
  config: Config,
  now: () => Date = () => new Date(),
) {
  const auth = new AuthService(database, config, now);
  const staff = new StaffService(database, config, auth, now);
  const catalogue = new CatalogueService(database, staff);
  const tutors = new TutorsService(
    database,
    config,
    auth,
    staff,
    evidenceScanner(config),
    now,
  );
  const listings = new ListingsService(
    database,
    auth,
    staff,
    catalogue,
    tutors,
    now,
  );
  const learners = new LearnersService(
    database,
    config,
    auth,
    staff,
    guardianVerifier(config),
    now,
  );
  const connections = new ConnectionsService(
    database,
    config,
    auth,
    learners,
    listings,
    tutors,
    new PaidAccess(config, now),
    now,
  );
  return new NotificationsService(
    database,
    config,
    auth,
    staff,
    connections,
    new DiscoveryService(database, config, now),
    now,
  );
}
