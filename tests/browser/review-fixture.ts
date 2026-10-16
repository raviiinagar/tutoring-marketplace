import { z } from "zod";
import { loadConfig } from "../../apps/api/src/config.js";
import { Database } from "../../apps/api/src/database.js";
async function main(){
const config = loadConfig();
const url = new URL(config.databaseUrl);
const id = z.uuid().parse(process.argv[2]);
if (
  config.mode === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/browser_test"
)
  throw new Error(
    "Review clock fixture requires the isolated browser_test database.",
  );
const database = new Database(config.databaseUrl);
try {
  const row = await database.pool.query(
    "UPDATE connections c SET created_at=now()-interval '7 days 1 second' FROM contact_requests r JOIN users u ON u.id=r.payer_id WHERE c.id=$1 AND r.id=c.request_id AND r.coverage_snapshot->>'source'='FIXTURE' AND u.email LIKE '%@example.test' RETURNING c.id",
    [id],
  );
  if (row.rowCount !== 1)
    throw new Error("A fictional browser Connection is required.");
  console.log(
    "Isolated fictional Connection advanced past its review waiting period.",
  );
} finally {
  await database.close();
}

}
void main().catch(()=>{console.error("Isolated review fixture failed.");process.exitCode=1;});
