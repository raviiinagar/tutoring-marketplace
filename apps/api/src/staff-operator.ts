import {userInfo} from 'node:os';
import {z} from 'zod';
import {loadConfig} from './config.js';
import {Database} from './database.js';
import {assignStaff} from './staff.js';

async function main(){
  const [command,...args]=process.argv.slice(2);if(!['grant','revoke'].includes(command))throw new Error('Expected grant or revoke.');
  const values:Record<string,string>={};
  for(let index=0;index<args.length;index+=2){const key=args[index];if(!key?.startsWith('--')||!args[index+1]||values[key.slice(2)]!==undefined)throw new Error('Expected distinct --name value arguments.');values[key.slice(2)]=args[index+1];}
  const input=z.strictObject({email:z.string().trim().toLowerCase().pipe(z.email()),environment:z.enum(['development','test','production']),reason:z.string().trim().min(10).max(240),scopes:z.string().optional()}).parse(values);
  const config=loadConfig();if(input.environment!==config.mode)throw new Error('Explicit environment must match NODE_ENV.');
  const scopes=command==='grant'?z.array(z.enum(['SUPPORT','TRUST','FINANCE'])).min(1).max(3).refine(items=>new Set(items).size===items.length).parse(input.scopes?.split(',')):null;
  if(command==='revoke'&&input.scopes)throw new Error('Revoke does not accept scopes.');
  const database=new Database(config.databaseUrl);
  try{await assignStaff(database,input.email,scopes,input.reason,userInfo().username);console.log('Staff '+command+' recorded; existing staff sessions revoked.');}finally{await database.close();}
}
main().catch(()=>{console.error('Staff operator command failed. Check arguments, environment, migrations and verified account.');process.exitCode=1;});
