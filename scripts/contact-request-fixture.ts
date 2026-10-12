import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/src/database.js';
import {loadConfig,type Config} from '../apps/api/src/config.js';
export async function grantContactFixture(database:Database,config:Config,email:string,state:'ACTIVE'|'MATCHING'='ACTIVE',at=new Date()){
 const url=new URL(config.databaseUrl);
 if(config.mode==='production'||!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/[a-z][a-z0-9_]*_test$/.test(url.pathname)||!email.endsWith('@example.test'))throw new Error('Fixture grants require an isolated loopback *_test database and fictional example.test identity; production is forbidden.');
 return database.transaction(async client=>{const user=(await client.query("SELECT id FROM users WHERE email=$1 AND status='ACTIVE' AND email_verified_at IS NOT NULL FOR UPDATE",[email])).rows[0];if(!user)throw new Error('Verified fictional account required.');const id=randomUUID();await client.query('INSERT INTO access_entitlements(id,payer_id,source,policy_version,status,captured_at,matching_deadline,starts_at,ends_at,created_at) VALUES($1,$2,\'FIXTURE\',\'fixture-access-v1\',$3,$4,$5,$6,$7,$4)',[id,user.id,state,at,new Date(at.getTime()+72*3600000),state==='ACTIVE'?at:null,state==='ACTIVE'?new Date(at.getTime()+30*86400000):null]);await client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),user.id,'TEST_REQUEST_COVERAGE_GRANTED',randomUUID(),at,{target:id,test_only:true}]);return id;});
}
// CLI is deliberately outside the API and is never registered as an HTTP endpoint.
async function main(){
 const [, ,email,state='ACTIVE']=process.argv;const config=loadConfig();const database=new Database(config.databaseUrl);
 try{if(!email||!['ACTIVE','MATCHING'].includes(state))throw new Error('Use a fictional email and ACTIVE or MATCHING.');await grantContactFixture(database,config,email,state as 'ACTIVE'|'MATCHING');console.log('Isolated test request coverage granted; no payment or production access created.');}catch(error){console.error(error instanceof Error?error.message:'Fixture grant failed.');process.exitCode=1;}finally{await database.close();}
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/contact-request-fixture.ts'))void main();
