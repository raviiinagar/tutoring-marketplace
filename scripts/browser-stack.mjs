import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {startDatabase} from './postgres.mjs';

const origin=new URL(process.env.PLAYWRIGHT_BASE_URL||'http://localhost:3100');
if(origin.protocol!=='http:'||!['localhost','127.0.0.1'].includes(origin.hostname))throw new Error('Browser fixtures require a loopback HTTP origin.');
const directory=resolve('.local/browser-tests',randomUUID());await mkdir(directory,{recursive:true});
const settings={NODE_ENV:'development',DATABASE_URL:`postgres://browser_user:${randomBytes(24).toString('hex')}@127.0.0.1:5434/browser_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin.origin,ALLOWED_ORIGINS:origin.origin,PORT:'4100',MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:resolve(directory,'mail'),DEV_DATABASE_DIR:resolve(directory,'postgres'),GUARDIAN_VERIFICATION_MODE:'test',EVIDENCE_SCANNER:'test'};
// Explicit fictional privacy schedule, isolated from the owner's configuration.
const privacyRule={days:1,purpose:'Fictional browser retention purpose for isolated tests only.'};
const privacyPolicy={id:'fictional-browser-policy-v1',test_only:true,approved_by:'Fictional browser operator',approval_reference:'ISOLATED-BROWSER-TEST-ONLY',classes:{ACCOUNT:privacyRule,PHOTO:{...privacyRule,days:0},EVIDENCE:privacyRule,SAFETY:privacyRule,SUPPORT:privacyRule,FINANCE:privacyRule}};
settings.PRIVACY_RETENTION_POLICY_FILE=resolve(directory,'privacy-policy.json');
settings.PRIVACY_TOMBSTONE_DIR=resolve(directory,'privacy-ledger');
await writeFile(settings.PRIVACY_RETENTION_POLICY_FILE,JSON.stringify(privacyPolicy),{mode:0o600});
// Shared only with the test runner's explicit operator fixture commands.
// Never use the owner's database, mail directory, encryption key or identity.
await writeFile(resolve('.local/browser-tests.env'),Object.entries(settings).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{mode:0o600});
Object.assign(process.env,settings);
const cluster=await startDatabase(settings.DATABASE_URL,settings.DEV_DATABASE_DIR);
try{
  const migration=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','--tsconfig','apps/api/tsconfig.json','apps/api/src/migrate.ts'],{stdio:'inherit',windowsHide:true});
  await new Promise((resolve,reject)=>{migration.on('error',reject);migration.on('exit',code=>code===0?resolve():reject(new Error('Browser fixture migration failed')));});
}finally{await cluster.stop();}
if(process.env.PLAYWRIGHT_BUILT_UI==='true') {
  const {default:concurrently}=await import('concurrently');
  const cluster=await startDatabase(settings.DATABASE_URL,settings.DEV_DATABASE_DIR);
  const uiPort=Number(origin.port)+1;
  const {result}=concurrently([
    {name:'api',command:'node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json apps/api/src/main.ts'},
    {name:'worker',command:'node node_modules/tsx/dist/cli.mjs --tsconfig apps/api/tsconfig.json apps/api/src/worker.ts'},
    {name:'ui',command:'node .output/server/index.mjs',cwd:resolve('lovable-ui'),env:{NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(uiPort),API_INTERNAL_URL:'http://127.0.0.1:4100'}},
    {name:'proxy',command:'node scripts/browser-ui-proxy.mjs',env:{BROWSER_FRONT_PORT:origin.port,BROWSER_UI_PORT:String(uiPort)}},
  ],{killOthersOn:['failure','success']});
  try {await result;}catch {process.exitCode=1;}finally {await cluster.stop();}
} else await import('./dev.mjs');
