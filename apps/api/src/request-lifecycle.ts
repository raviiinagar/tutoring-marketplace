import type { PoolClient } from "pg";
import { Database } from "./database.js";

const reminderWindow = 24 * 3600000;
type TimedRequest = { status: string; expires_at: Date | string };

// Equality is expired everywhere. The worker never chooses a new deadline.
export function requestTiming(row: TimedRequest, at: Date) {
  const expires = new Date(row.expires_at);
  const status =
    row.status === "PENDING" && expires <= at ? "EXPIRED" : row.status;
  return {
    status,
    expires_at: expires.toISOString(),
    server_time: at.toISOString(),
    reminder:
      status === "EXPIRED"
        ? "EXPIRED"
        : status === "PENDING" &&
            expires.getTime() - at.getTime() <= reminderWindow
          ? "DUE_SOON"
          : null,
  };
}

export async function expirePayerRequests(
  client: PoolClient,
  payer: string,
  at: Date,
) {
  await client.query(
    `WITH expired AS (
    UPDATE contact_requests SET status='EXPIRED',updated_at=$2
    WHERE payer_id=$1 AND status='PENDING' AND expires_at<=$2 RETURNING id,expires_at
  ) INSERT INTO contact_request_lifecycle_events(request_id,event_type,occurred_at,recorded_at)
    SELECT id,'EXPIRED',expires_at,$2 FROM expired ON CONFLICT DO NOTHING`,
    [payer, at],
  );
}

export class RequestLifecycle {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async tick(): Promise<{ expired: number; reminded: number }> {
    return this.database.transaction(async (client) => {
      const scanAt = this.now();
      // Only request rows are locked. Never acquire account/purchase/entitlement
      // locks here: synchronous decisions already hold those before the request.
      const rows = (
        await client.query(
          `SELECT r.* FROM contact_requests r
        WHERE r.status='PENDING' AND r.expires_at<=$2
          AND (r.expires_at<=$1 OR NOT EXISTS (
            SELECT 1 FROM contact_request_lifecycle_events e WHERE e.request_id=r.id AND e.event_type='RESPONSE_DUE'))
        ORDER BY r.expires_at,r.id LIMIT 50 FOR UPDATE OF r SKIP LOCKED`,
          [scanAt, new Date(scanAt.getTime() + reminderWindow)],
        )
      ).rows;
      const result = { expired: 0, reminded: 0 };
      for (const row of rows) {
        const at = this.now();
        const expired = requestTiming(row, at).status === "EXPIRED";
        if (expired)
          await client.query(
            "UPDATE contact_requests SET status='EXPIRED',updated_at=$2 WHERE id=$1",
            [row.id, at],
          );
        const recorded = await client.query(
          `INSERT INTO contact_request_lifecycle_events(request_id,event_type,occurred_at,recorded_at)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [
            row.id,
            expired ? "EXPIRED" : "RESPONSE_DUE",
            new Date(
              new Date(row.expires_at).getTime() -
                (expired ? 0 : reminderWindow),
            ),
            at,
          ],
        );
        if (recorded.rowCount) result[expired ? "expired" : "reminded"]++;
      }
      return result;
    });
  }
}
