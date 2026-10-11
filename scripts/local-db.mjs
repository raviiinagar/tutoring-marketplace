import { startDatabase } from './postgres.mjs';
const cluster = await startDatabase(process.env.DATABASE_URL);
console.log('Local PostgreSQL ready. Stop with Ctrl+C.');
let stopping=false;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{
  if(stopping)return;stopping=true;await cluster.stop();process.exit(0);
});
setInterval(()=>{},60_000);
