import { loadConfig } from "./config.js";
import { Database,migrate } from "./database.js";

async function main(){const database=new Database(loadConfig().databaseUrl);try{await migrate(database);console.log("Database migrations applied.");}finally{await database.close();}}
main().catch(()=>{console.error("Migration failed. Check database configuration and migration compatibility.");process.exitCode=1;});

