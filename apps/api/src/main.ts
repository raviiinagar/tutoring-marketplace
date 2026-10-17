import { loadConfig } from "./config.js";
import { Database } from "./database.js";
import { createApplication } from "./app.js";
import {privacyTombstones} from './privacy-ledger.js';

async function main() {
  const config=loadConfig();
  if(config.mode==='production')await privacyTombstones(config);
  const database=new Database(config.databaseUrl);
  await database.pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
  const app=await createApplication(config,database);
  await app.listen(config.port,config.mode==="production"?"0.0.0.0":"127.0.0.1");
  console.log("Authentication API ready on port "+config.port);
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await app.close();await database.close();};
  process.on("SIGINT",()=>void stop());process.on("SIGTERM",()=>void stop());
}
main().catch(()=>{console.error("API startup failed. Check configuration, database availability and migrations.");process.exitCode=1;});

