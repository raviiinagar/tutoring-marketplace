import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {join,resolve} from 'node:path';
import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {createApplication} from '../src/app.js';
import {loadConfig,type Config} from '../src/config.js';
import {Database,migrate} from '../src/database.js';
import {decrypt} from '../src/security.js';
import {assignStaff} from '../src/staff.js';
import {totp} from '../src/totp.js';
// @ts-expect-error Local JavaScript helper has no declaration.
import {startDatabase} from '../../../scripts/postgres.mjs';
let app:INestApplication,db:Database,config:Config,cluster:Awaited<ReturnType<typeof startDatabase>>;
let clock=new Date();const origin='http://localhost:3000',password='Staff-password-321!',now=()=>clock;
const post=(path:string,body:unknown,cookie?:string)=>{const r=request(app.getHttpServer()).post(path).set('Origin',origin).send(body);return cookie?r.set('Cookie',cookie):r;};
const get=(path:string,cookie?:string)=>{const r=request(app.getHttpServer()).get(path);return cookie?r.set('Cookie',cookie):r;};
const combine=(a:string,b:string)=>a.split(';')[0]+'; '+b.split(';')[0];
before(async()=>{
 const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()));
 const directory=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',APP_ENVIRONMENT:'staging',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/governance_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(directory,'mail')});
 cluster=await startDatabase(config.databaseUrl,join(directory,'postgres'));db=new Database(config.databaseUrl);await migrate(db);app=await createApplication(config,db,now);
});
beforeEach(()=>{clock=new Date(clock.getTime()+20*60_000);config.staffPolicy=undefined;});
after(async()=>{await app?.close();await db?.close();await cluster?.stop();});
async function account(verified=true){
 const email=randomUUID()+'@example.test';await post('/v1/auth/registrations',{display_name:'Fixture reviewer',email,password}).expect(202);
 const user=(await db.pool.query('SELECT id FROM users WHERE email=$1',[email])).rows[0];
 if(!verified)return {id:user.id as string,email,cookie:''};
 const mail=(await db.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=$1',[user.id])).rows[0];
 await post('/v1/auth/verifications',{token:new URL(decrypt<{verification_url:string}>(mail.encrypted_payload,config.authSecret).verification_url).hash.slice(7)}).expect(200);
 const login=await post('/v1/auth/sessions',{email,password}).expect(200);return {id:user.id as string,email,cookie:login.headers['set-cookie'][0] as string};
}
async function owner(){
 const a=await account();await assignStaff(db,a.email,['SUPPORT','TRUST','FINANCE'],'Fixture owner bootstrap','test');
 config.staffPolicy={superAdminId:a.id,testMfaBypassUntil:new Date(clock.getTime()+10*60_000).toISOString()};
 const login=await post('/v1/staff/sessions',{password},a.cookie).expect(200);return {...a,staff:combine(a.cookie,login.headers['set-cookie'][0])};
}
test('only the configured Super Admin can delegate verified accounts, revoke access, and retain the sole owner',async()=>{
 const root=await owner(),reviewer=await account(),publicUser=await account(),unverified=await account(false);
 await get('/v1/staff/admins').expect(401);await get('/v1/staff/admins',publicUser.cookie).expect(403);
 await post('/v1/staff/admins/grants',{email:reviewer.email,reason:'Assign daily review work'},publicUser.cookie).expect(403);
 await post('/v1/staff/admins/grants',{email:unverified.email,reason:'Assign daily review work'},root.staff).expect(400);
 await post('/v1/staff/admins/grants',{email:reviewer.email,reason:'Assign daily review work',role:'SUPER_ADMIN'},root.staff).expect(400);
 await post('/v1/staff/admins/grants',{email:root.email,reason:'Try changing the owner'},root.staff).expect(400);
 await post('/v1/staff/admins/'+root.id+'/revocations',{reason:'Try revoking the owner'},root.staff).expect(400);
 await post('/v1/staff/admins/'+root.id.toUpperCase()+'/revocations',{reason:'Try uppercase owner identifier'},root.staff).expect(400);
 await post('/v1/staff/admins/grants',{email:reviewer.email,reason:'Assign daily review work'},root.staff).expect(200);
 const signIn=await post('/v1/staff/sessions',{password},reviewer.cookie).expect(200),staff=combine(reviewer.cookie,signIn.headers['set-cookie'][0]);
 const access=await get('/v1/staff/access',staff).expect(200);assert.equal(access.body.role,'ADMIN');assert.equal(access.body.mfa_required,false);assert.deepEqual(access.body.scopes,['SUPPORT','TRUST']);
 const team=await get('/v1/staff/admins',root.staff).expect(200);assert.equal(team.body.admins.filter((a:{role:string})=>a.role==='SUPER_ADMIN').length,1);
 assert.ok(team.body.admins.some((a:{id:string})=>a.id===reviewer.id));assert.ok(!JSON.stringify(team.body).includes('password_hash'));
 await get('/v1/staff/tutors',staff).expect(200);await get('/v1/staff/workspaces/SUPPORT',staff).expect(200);
 for(const path of ['/v1/staff/admins','/v1/staff/admin/overview','/v1/staff/catalogue','/v1/staff/workspaces/FINANCE','/v1/staff/operations?scope=SUPPORT&reason=Inspect%20review%20assignment','/v1/staff/notifications?reason=Inspect%20review%20assignment'])await get(path,staff).expect(403);
 await post('/v1/staff/admin/accounts/search',{},staff).expect(403);
 await post('/v1/staff/admins/grants',{email:publicUser.email,reason:'Unauthorized delegation'},staff).expect(403);
 await post('/v1/staff/admins/'+reviewer.id+'/revocations',{reason:'Daily review assignment ended'},root.staff).expect(200);
 await get('/v1/staff/access',staff).expect(403);await get('/v1/staff/tutors',staff).expect(403);
 const facts=(await db.pool.query("SELECT event_type,metadata,user_id FROM audit_events WHERE event_type IN ('ADMIN_ACCESS_GRANTED','ADMIN_ACCESS_REVOKED') AND metadata->>'target'=$1",[reviewer.id])).rows;
 assert.equal(facts.length,2);assert.ok(facts.every(r=>r.user_id===root.id&&r.metadata.reason));
 await post('/v1/staff/admins/grants',{email:reviewer.email,reason:'Reinstate review assignment'},root.staff).expect(200);
 assert.equal((await get('/v1/staff/access',staff).expect(200)).body.authenticated,false);
});
test('legacy FINANCE assignment cannot bypass delegated role boundaries',async()=>{
 const root=await owner(),a=await account();await assignStaff(db,a.email,['TRUST','SUPPORT','FINANCE'],'Legacy operator assignment','test');
 const login=await post('/v1/staff/sessions',{password},a.cookie).expect(200),cookie=combine(a.cookie,login.headers['set-cookie'][0]);
 assert.ok(!(await get('/v1/staff/access',cookie)).body.scopes.includes('FINANCE'));
 await get('/v1/staff/admin/overview',cookie).expect(403);await get('/v1/staff/catalogue',cookie).expect(403);
 await get('/v1/staff/admin/overview',root.staff).expect(200);
});
test('testing sessions require passwords, bind to the account session and end at the cutoff',async()=>{
 const root=await owner();await post('/v1/staff/sessions',{password:'incorrect'},root.cookie).expect(401);
 const other=await post('/v1/auth/sessions',{email:root.email,password}).expect(200);
 const elevated=root.staff.split('; ')[1];await get('/v1/staff/admins',combine(other.headers['set-cookie'][0],elevated)).expect(403);
 const row=(await db.pool.query('SELECT authentication_method,expires_at FROM staff_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[root.id])).rows[0];
 assert.equal(row.authentication_method,'TEST_PASSWORD');assert.equal(new Date(row.expires_at).toISOString(),config.staffPolicy!.testMfaBypassUntil);
 clock=new Date(config.staffPolicy!.testMfaBypassUntil!);
 const access=await get('/v1/staff/access',root.staff).expect(200);assert.equal(access.body.authenticated,false);assert.equal(access.body.mfa_required,true);
 await get('/v1/staff/admins',root.staff).expect(403);await post('/v1/staff/sessions',{password},root.cookie).expect(403);
});
test('disabling the exception invalidates test sessions while normal MFA still works',async()=>{
 const root=await owner();config.staffPolicy={superAdminId:root.id};await get('/v1/staff/admins',root.staff).expect(403);
 const setup=await post('/v1/staff/mfa/enrollments',{password},root.cookie).expect(200);
 const confirmed=await post('/v1/staff/mfa/confirmations',{code:totp(setup.body.secret,clock)},root.cookie).expect(200);
 const mfa=combine(root.cookie,confirmed.headers['set-cookie'][0]);await get('/v1/staff/admins',mfa).expect(200);
 assert.equal((await get('/v1/staff/access',mfa)).body.mfa_required,true);
 const enrolled=(await db.pool.query('SELECT encrypted_secret FROM staff_accounts WHERE user_id=$1',[root.id])).rows[0].encrypted_secret;
 config.staffPolicy={superAdminId:root.id,testMfaBypassUntil:new Date(clock.getTime()+60_000).toISOString()};
 await post('/v1/staff/sessions',{password},root.cookie).expect(200);
 assert.deepEqual((await db.pool.query('SELECT encrypted_secret FROM staff_accounts WHERE user_id=$1',[root.id])).rows[0].encrypted_secret,enrolled);
 clock=new Date(clock.getTime()+60_000);
 const restored=await post('/v1/staff/sessions',{password,code:totp(setup.body.secret,clock)},root.cookie).expect(200);
 await get('/v1/staff/admins',combine(root.cookie,restored.headers['set-cookie'][0])).expect(200);
});
test('configured owner must already be an active verified staff identity at startup',async()=>{
 await assert.rejects(createApplication({...config,staffPolicy:{superAdminId:randomUUID()}},db,now),/active verified staff/);
});
test('unsafe config cannot enable the testing exception in real production or indefinitely',()=>{
 const env={NODE_ENV:'test',DATABASE_URL:'postgres://local/test',AUTH_SECRET:'x'.repeat(48),STAFF_SUPER_ADMIN_USER_ID:randomUUID(),STAFF_TEST_MFA_BYPASS_UNTIL:new Date(Date.now()+3600_000).toISOString().replace(/\.\d{3}Z$/,'Z')};
 assert.throws(()=>loadConfig({...env,APP_ENVIRONMENT:'production'}));
 assert.throws(()=>loadConfig({...env,APP_ENVIRONMENT:'staging',STAFF_SUPER_ADMIN_USER_ID:''}));
 assert.throws(()=>loadConfig({...env,APP_ENVIRONMENT:'staging',STAFF_TEST_MFA_BYPASS_UNTIL:'2099-01-01T00:00:00Z'}));
 assert.throws(()=>loadConfig({...env,APP_ENVIRONMENT:'staging',OPERATIONS_OWNER_USER_ID:randomUUID()}));
 assert.ok(loadConfig({...env,APP_ENVIRONMENT:'staging'}).staffPolicy);
});
