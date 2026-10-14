import { createHmac } from "node:crypto";
import type { Database } from "./database.js";
import { ApiProblem } from "./errors.js";
import type {PoolClient} from 'pg';

export class RateLimiter {
  constructor(private readonly database: Database, private readonly secret: string, private readonly now: () => Date) {}
  async consume(action: string, identity: string, limit: number, windowMs: number, client?:PoolClient) {
    const now = this.now();
    const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const key = createHmac("sha256", this.secret).update(action + ":" + identity).digest("hex");
    const result = await (client??this.database.pool).query(
      `INSERT INTO rate_limits(key,window_start,count,expires_at) VALUES($1,$2,1,$3)
       ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN rate_limits.window_start=EXCLUDED.window_start THEN rate_limits.count+1 ELSE 1 END,
       window_start=EXCLUDED.window_start, expires_at=EXCLUDED.expires_at RETURNING count`,
      [key, start, new Date(start.getTime() + windowMs)],
    );
    if (result.rows[0].count > limit) throw new ApiProblem(429, "RATE_LIMITED", "Too many attempts. Please try again later.");
  }
}

