import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {startDatabase} from './postgres.mjs';

const origin=new URL(process.env.PLAYWRIGHT_BASE_URL||'http://localhost:3100');
if(origin.protocol!=='http:'||!['localhost','127.0.0.1'].includes(origin.hostname))throw new Error('Browser fixtures require a loopback HTTP origin.');
const directory=resolve('.local/browser-tests',randomUUID());await mkdir(directory,{recursive:true});
const settings={NODE_ENV:'development',DATABASE_URL:`postgres://browser_user:${randomBytes(24).toString('hex')}@127.0.0.1:5434/browser_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin.origin,ALLOWED_ORIGINS:origin.origin,PORT:'4100',MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:resolve(directory,'mail'),DEV_DATABASE_DIR:resolve(directory,'postgres'),GUARDIAN_VERIFICATION_MODE:'test',EVIDENCE_SCANNER:'test'};
// Shared only with the test runner's explicit operator fixture commands.
// Never use the owner's database, mail directory, encryption key or identity.
await writeFile(resolve('.local/browser-tests.env'),Object.entries(settings).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{mode:0o600});
Object.assign(process.env,settings);
const cluster=await startDatabase(settings.DATABASE_URL,settings.DEV_DATABASE_DIR);
try{
  const migration=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','--tsconfig','apps/api/tsconfig.json','apps/api/src/migrate.ts'],{stdio:'inherit',windowsHide:true});
  await new Promise((resolve,reject)=>{migration.on('error',reject);migration.on('exit',code=>code===0?resolve():reject(new Error('Browser fixture migration failed')));});
}finally{await cluster.stop();}
await import('./dev.mjs');
