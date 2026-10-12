import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "./config.js";
import { Database } from "./database.js";
import { MailWorker } from "./mail.js";
import {availabilityWorker} from './availability.js';

async function main(){
  const config=loadConfig();const database=new Database(config.databaseUrl);const worker=new MailWorker(database,config);
  const availability=availabilityWorker(database,config);
  await database.pool.query("SELECT 1 FROM mail_outbox LIMIT 1");
  let stopping=false;process.on("SIGINT",()=>{stopping=true;});process.on("SIGTERM",()=>{stopping=true;});
  console.log("Verification worker ready; transport "+config.mailTransport);
  try{while(!stopping){try{const mailWork=await worker.tick();const matchWork=await availability.tick();if(!mailWork&&!matchWork)await sleep(1000);}catch{console.error("Notification worker temporarily unavailable.");await sleep(2000);}}}
  finally{await database.close();}
}
main().catch(()=>{console.error("Worker startup failed. Check configuration and migrations.");process.exitCode=1;});

