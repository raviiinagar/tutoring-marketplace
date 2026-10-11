import { spawn } from 'node:child_process';
import concurrently from 'concurrently';
import { startDatabase } from './postgres.mjs';
import { resolve } from 'node:path';

if(process.env.NODE_ENV==='production')throw new Error('The local dev stack must not run in production.');

const build = spawn(process.execPath,['node_modules/typescript/bin/tsc','-p','packages/contracts/tsconfig.json'],{stdio:'inherit'});
await new Promise((resolve,reject)=>build.on('exit',code=>code===0?resolve():reject(new Error('Contract build failed'))));
const cluster=await startDatabase(process.env.DATABASE_URL,process.env.DEV_DATABASE_DIR||'.local/postgres');
const webPort=new URL(process.env.WEB_ORIGIN||'http://localhost:3000').port||'3000';
const {result}=concurrently([
  {name:'api',command:'node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json apps/api/src/main.ts'},
  {name:'worker',command:'node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json apps/api/src/worker.ts'},
  {name:'web',command:`node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port ${Number(webPort)} --strictPort`,cwd:resolve('lovable-ui'),env:{VITE_API_BASE_URL:'',VITE_DEV_MAIL_CAPTURE:process.env.MAIL_TRANSPORT==='capture'?'true':'false',API_INTERNAL_URL:'http://127.0.0.1:'+(process.env.PORT||'4000')}},
],{killOthersOn:['failure','success'],prefix:'name'});
try { await result; } catch { process.exitCode=1; } finally { await cluster.stop(); }
