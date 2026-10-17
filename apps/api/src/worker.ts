import {OperationsMonitor,type WorkerName} from './operations-monitor.js';
import { notificationWorker } from "./notifications.js";
import { SettlementReconciliation } from "./settlement-reconciliation.js";
import { FinancialEvents } from "./financial-events.js";
import { RefundsService } from "./refunds.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "./config.js";
import { Database } from "./database.js";
import { MailWorker } from "./mail.js";
import { PaymentEvents } from "./payment-events.js";
import { RazorpayProvider } from "./payment-provider.js";
import { availabilityWorker } from "./availability.js";
import { RequestLifecycle } from "./request-lifecycle.js";
import { PrivacyWorker } from "./privacy-worker.js";
import {privacyTombstones} from './privacy-ledger.js';

async function main() {
  const config = loadConfig();
  if(config.mode==='production')await privacyTombstones(config);
  const database = new Database(config.databaseUrl);
  const worker = new MailWorker(database, config);
  const payments = new PaymentEvents(
    database,
    config,
    config.payments ? new RazorpayProvider(config.payments) : undefined,
  );
  const availability = availabilityWorker(database, config);
  const requests = new RequestLifecycle(database);
  const privacy = new PrivacyWorker(database, config);
  const auth = new AuthService(database, config);
  const staff = new StaffService(database, config, auth);
  const refunds = new RefundsService(
    database,
    config,
    auth,
    staff,
    config.payments ? new RazorpayProvider(config.payments) : undefined,
  );
  const financialEvents = new FinancialEvents(
    database,
    config,
    config.payments ? new RazorpayProvider(config.payments) : undefined,
    refunds,
  );
  const settlements = new SettlementReconciliation(
    database,
    config,
    auth,
    staff,
    config.payments ? new RazorpayProvider(config.payments) : undefined,
  );
  await database.pool.query("SELECT 1 FROM mail_outbox LIMIT 1");
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  console.log(
    "Background worker ready; email transport " + config.mailTransport,
  );
  const notifications = notificationWorker(database, config);
  const monitor=new OperationsMonitor(database,config);
  const loops: [WorkerName, () => Promise<unknown>][] = [
    ["verification-email", () => worker.tick()],
    ["availability", () => availability.tick()],
    ["payments", () => payments.tick()],
    [
      "request-deadlines",
      async () => {
        const result = await requests.tick();
        return result.expired || result.reminded;
      },
    ],
    ["refunds", () => refunds.tick()],
    ["financial-events", () => financialEvents.tick()],
    ["settlements", () => settlements.tick()],
    ["notifications", () => notifications.tick()],
    ["privacy", () => privacy.tick()],
    ["operations",()=>monitor.tick()],
  ];
  // Independent loops keep slow provider reconciliation from delaying committed notices.
  try {
    await Promise.all(
      loops.map(async ([name, tick]) => {
        while (!stopping) {
          try {
            const worked=await tick();
            await monitor.workerResult(name,true);
            if(!worked)await sleep(1000);
          } catch {
            console.error("Background job temporarily unavailable: " + name);
            await monitor.workerResult(name,false).catch(()=>console.error("Worker health recording unavailable"));
            await sleep(2000);
          }
        }
      }),
    );
  } finally {
    await database.close();
  }
}
main().catch(() => {
  console.error("Worker startup failed. Check configuration and migrations.");
  process.exitCode = 1;
});
