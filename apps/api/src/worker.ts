import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "./config.js";
import { Database } from "./database.js";
import { MailWorker } from "./mail.js";
import {PaymentEvents} from './payment-events.js';
import {RazorpayProvider} from './payment-provider.js';
import {availabilityWorker} from './availability.js';
import {RequestLifecycle} from './request-lifecycle.js';

async function main(){
  const config=loadConfig();const database=new Database(config.databaseUrl);const worker=new MailWorker(database,config);
  const payments=new PaymentEvents(database,config,config.payments?new RazorpayProvider(config.payments):undefined);
  const availability=availabilityWorker(database,config);
  const requests=new RequestLifecycle(database);
  await database.pool.query("SELECT 1 FROM mail_outbox LIMIT 1");
  let stopping=false;process.on("SIGINT",()=>{stopping=true;});process.on("SIGTERM",()=>{stopping=true;});
  console.log("Verification worker ready; transport "+config.mailTransport);
  try{while(!stopping){try{const mailWork=await worker.tick();const matchWork=await availability.tick();const paymentWork=await payments.tick();const requestWork=await requests.tick();if(!mailWork&&!matchWork&&!paymentWork&&!requestWork.expired&&!requestWork.reminded)await sleep(1000);}catch{console.error("Background worker temporarily unavailable.");await sleep(2000);}}}
  finally{await database.close();}
}
main().catch(()=>{console.error("Worker startup failed. Check configuration and migrations.");process.exitCode=1;});

