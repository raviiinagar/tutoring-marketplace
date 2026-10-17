import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";

export class Database {
  readonly pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    this.pool.on("error", () => console.error("Database connection interrupted"));
  }
  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}
export async function migrate(database: Database, options: { directory?: string; verifyOnly?: boolean } = {}) {
  const directory = resolve(options.directory ?? "apps/api/migrations");
  return database.transaction(async client => {
    const result = { applied: [] as string[], verified: [] as { version: string; recorded_checksum: string; newline_compatible: boolean }[] };
    if(options.verifyOnly)await client.query('SET TRANSACTION READ ONLY');
    await client.query("SELECT pg_advisory_xact_lock(73501901)");
    if(!options.verifyOnly)await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    const files=(await readdir(directory)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
    for (const file of files) {
      const sql = await readFile(resolve(directory, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("SELECT checksum FROM schema_migrations WHERE version=$1", [file]);
      if (previous.rows.length) {
        const recorded = previous.rows[0].checksum;
        // Git may check the same immutable SQL out with Windows or Unix line
        // endings. Accept only these two deterministic representations; never
        // replace an already recorded checksum or ignore other edits.
        const lf = sql.replace(/\r\n/g, "\n");
        const equivalent = [lf, lf.replace(/\n/g, "\r\n")].some(value => createHash("sha256").update(value).digest("hex") === recorded);
        if (recorded !== checksum && !equivalent) throw new Error("An applied migration was modified");
        result.verified.push({ version: file, recorded_checksum: recorded, newline_compatible: recorded !== checksum });
        continue;
      }
      if(options.verifyOnly)throw new Error('A required migration is not applied; candidate cannot serve this database');
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)", [file, checksum]);
      result.applied.push(file);
    }
    if(options.verifyOnly&&(await client.query('SELECT version FROM schema_migrations')).rows.some(row=>!files.includes(row.version)))throw new Error('Candidate does not support every applied migration');
    return result;
  });
}

