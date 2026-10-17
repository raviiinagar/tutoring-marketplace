import {productionPrivacyFixture} from './privacy-fixture.js';
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
import {decrypt,tokenHash} from '../src/security.js';
import {assignStaff,type StaffScope} from '../src/staff.js';
import {base32,totp} from '../src/totp.js';
import {AuthService} from '../src/auth.js';
// @ts-expect-error Local JavaScript helper has no declaration.
import {startDatabase} from '../../../scripts/postgres.mjs';

let app:INestApplication;let database:Database;let config:Config;let cluster:Awaited<ReturnType<typeof startDatabase>>;
let clock=new Date();const now=()=>clock;const origin='http://localhost:3000';const password='Staff-password-321!';
const post=(path:string,body:unknown,cookie?:string)=>{const call=request(app.getHttpServer()).post(path).set('Origin',origin).send(body);return cookie?call.set('Cookie',cookie):call;};
const get=(path:string,cookie?:string)=>{const call=request(app.getHttpServer()).get(path);return cookie?call.set('Cookie',cookie):call;};
const del=(path:string,cookie:string)=>request(app.getHttpServer()).delete(path).set('Origin',origin).set('Cookie',cookie).send({});
const combine=(base:string,staff:string)=>base.split(';')[0]+'; '+staff.split(';')[0];
before(async()=>{
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  const directory=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/staff_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(directory,'mail')});
  cluster=await startDatabase(config.databaseUrl,join(directory,'postgres'));database=new Database(config.databaseUrl);await migrate(database);app=await createApplication(config,database,now);
});
beforeEach(()=>{clock=new Date(clock.getTime()+20*60_000);});
after(async()=>{await app?.close();await database?.close();await cluster?.stop();});
async function fixture(scopes:StaffScope[]|null=['SUPPORT']){
  const email=randomUUID()+'@example.test';await post('/v1/auth/registrations',{display_name:'Test operator',email,password}).expect(202);
  const row=(await database.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0];
  await post('/v1/auth/verifications',{token:new URL(decrypt<{verification_url:string}>(row.encrypted_payload,config.authSecret).verification_url).hash.slice(7)}).expect(200);
  const login=await post('/v1/auth/sessions',{email,password}).expect(200);if(scopes)await assignStaff(database,email,scopes,'Fixture staff bootstrap','test operator');
  return {email,id:login.body.user.id,cookie:login.headers['set-cookie'][0] as string};
}
async function enroll(cookie:string){
  const setup=await post('/v1/staff/mfa/enrollments',{password},cookie).expect(200);const secret=setup.body.secret;
  const confirmed=await post('/v1/staff/mfa/confirmations',{code:totp(secret,clock)},cookie).expect(200);
  return {secret,codes:confirmed.body.recovery_codes as string[],staffCookie:confirmed.headers['set-cookie'][0] as string,cookie:combine(cookie,confirmed.headers['set-cookie'][0])};
}
test('logout and an overlapping authenticated read use a consistent lock order',async()=>{
  const user=await fixture(null);const token=user.cookie.split(';')[0].slice('tm_session='.length);const blocker=await database.pool.connect();
  let released=false;
  try{
    await blocker.query('BEGIN');await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
    const logout=del('/v1/auth/sessions/current',user.cookie).then(response=>response);
    const deadline=Date.now()+5000;let waiting=false;
    while(Date.now()<deadline){const result=await database.pool.query("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>$1",[blocker.processID]);if(Number(result.rows[0].count)>0){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
    assert.ok(waiting,'Logout must overlap the held identity lock');
    const read=new AuthService(database,config,now).authenticated(blocker,token).finally(async()=>{await blocker.query('ROLLBACK');blocker.release();released=true;});
    const results=await Promise.allSettled([logout,read]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'fulfilled');if(results[0].status==='fulfilled')assert.equal(results[0].value.status,204);
    await get('/v1/me',user.cookie).expect(401);
  }finally{if(!released){await blocker.query('ROLLBACK');blocker.release();}}
});
test('TOTP matches RFC 6238 SHA1 vectors including dates beyond 2038',()=>{
  const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';assert.equal(base32(Buffer.from('12345678901234567890')),secret);
  for(const [time,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']] as const)assert.equal(totp(secret,new Date(time*1000),8),expected);
});
test('public accounts cannot assign staff; bootstrap requires a verified account',async()=>{
  const user=await fixture(null);await get('/v1/staff/access',user.cookie).expect(403);await get('/v1/staff/access').expect(401);
  await post('/v1/me/roles',{roles:['SUPPORT']},user.cookie).expect(400);
  await post('/v1/auth/registrations',{display_name:'Fake admin',email:'fake@example.test',password,scopes:['FINANCE']}).expect(400);
  await assert.rejects(assignStaff(database,'missing@example.test',['SUPPORT'],'No eligible identity','test operator'));
  await get('/v1/staff/workspaces/SUPPORT',user.cookie).expect(403);
});
test('MFA requires password, same enrollment session, unexpired setup and unreplayed code',async()=>{
  const user=await fixture();await get('/v1/staff/workspaces/SUPPORT',user.cookie).expect(403);
  await post('/v1/staff/mfa/enrollments',{password:'incorrect'},user.cookie).expect(401);
  const setup=await post('/v1/staff/mfa/enrollments',{password},user.cookie).expect(200);
  const other=(await post('/v1/auth/sessions',{email:user.email,password}).expect(200)).headers['set-cookie'][0];
  await post('/v1/staff/mfa/confirmations',{code:totp(setup.body.secret,clock)},other).expect(400);
  clock=new Date(clock.getTime()+10*60_000);
  await post('/v1/staff/mfa/confirmations',{code:totp(setup.body.secret,clock)},user.cookie).expect(400);
  const mfa=await enroll(user.cookie);
  assert.match(mfa.staffCookie,/HttpOnly/);assert.match(mfa.staffCookie,/SameSite=Lax/);
  await post('/v1/staff/sessions',{password,code:totp(mfa.secret,clock)},user.cookie).expect(400);
  await post('/v1/staff/mfa/enrollments',{password},user.cookie).expect(409);
  clock=new Date(clock.getTime()+30_000);
  const raced=await Promise.all([post('/v1/staff/sessions',{password,code:totp(mfa.secret,clock)},user.cookie),post('/v1/staff/sessions',{password,code:totp(mfa.secret,clock)},user.cookie)]);
  assert.deepEqual(raced.map(response=>response.status).sort(),[200,400]);
  const row=(await database.pool.query('SELECT * FROM staff_accounts WHERE user_id=$1',[user.id])).rows[0];
  assert.ok(!JSON.stringify(row).includes(mfa.secret));assert.ok(!JSON.stringify(row).includes(mfa.codes[0]));assert.equal(row.recovery_hashes[0],tokenHash(mfa.codes[0]));
});
test('scope boundaries, MFA cookie binding and audit actor/target/reason are enforced',async()=>{
  const user=await fixture();const mfa=await enroll(user.cookie);
  await get('/v1/staff/workspaces/SUPPORT',mfa.cookie).expect(200);
  await get('/v1/staff/workspaces/TRUST',mfa.cookie).expect(403);await get('/v1/staff/workspaces/FINANCE',mfa.cookie).expect(403);
  const fresh=(await post('/v1/auth/sessions',{email:user.email,password}).expect(200)).headers['set-cookie'][0];
  await get('/v1/staff/workspaces/SUPPORT',combine(fresh,mfa.staffCookie)).expect(403);
  await post('/v1/staff/workspaces/SUPPORT/access-checks',{reason:'Review support access log'},mfa.cookie).expect(200).expect(r=>{assert.equal(r.body.events[0].actor_id,user.id);assert.equal(r.body.events[0].target,'workspace:SUPPORT');assert.equal(r.body.events[0].reason,'Review support access log');});
  await post('/v1/staff/workspaces/FINANCE/access-checks',{reason:'Review finance access log'},mfa.cookie).expect(403);
  await post('/v1/staff/workspaces/SUPPORT/access-checks',{reason:'short',target:'someone'},mfa.cookie).expect(400);
  const audits=(await database.pool.query('SELECT * FROM audit_events WHERE user_id=$1',[user.id])).rows;
  for(const secret of [password,mfa.secret,mfa.codes[0],mfa.staffCookie.split(';')[0].split('=')[1]])assert.ok(!JSON.stringify(audits).includes(secret));
  const owner=await fixture(['SUPPORT','TRUST','FINANCE']);const ownerMfa=await enroll(owner.cookie);
  for(const scope of ['SUPPORT','TRUST','FINANCE'])await get('/v1/staff/workspaces/'+scope,ownerMfa.cookie).expect(200);
});
test('staff sign-out, session expiry, scope changes and account revocation invalidate privileged access',async()=>{
  const user=await fixture();let mfa=await enroll(user.cookie);
  await del('/v1/staff/sessions/current',mfa.cookie).expect(204);await get('/v1/staff/workspaces/SUPPORT',mfa.cookie).expect(403);
  clock=new Date(clock.getTime()+30_000);
  const first=await post('/v1/staff/sessions',{password,code:totp(mfa.secret,clock)},user.cookie).expect(200);mfa={...mfa,staffCookie:first.headers['set-cookie'][0],cookie:combine(user.cookie,first.headers['set-cookie'][0])};
  clock=new Date(clock.getTime()+30*60_000);await get('/v1/staff/workspaces/SUPPORT',mfa.cookie).expect(403);
  const second=await post('/v1/staff/sessions',{password,code:totp(mfa.secret,clock)},user.cookie).expect(200);const privileged=combine(user.cookie,second.headers['set-cookie'][0]);
  await assignStaff(database,user.email,['TRUST'],'Change operator responsibilities','test operator');await get('/v1/staff/workspaces/TRUST',privileged).expect(403);
  clock=new Date(clock.getTime()+30_000);const third=await post('/v1/staff/sessions',{password,code:totp(mfa.secret,clock)},user.cookie).expect(200);
  const trusted=combine(user.cookie,third.headers['set-cookie'][0]);await get('/v1/staff/workspaces/TRUST',trusted).expect(200);
  await del('/v1/auth/sessions/current',user.cookie).expect(204);await get('/v1/staff/workspaces/TRUST',trusted).expect(401);
});
test('recovery consumes all backup codes, revokes staff access and requires a new authenticator',async()=>{
  const user=await fixture();const mfa=await enroll(user.cookie);
  const responses=await Promise.all([post('/v1/staff/mfa/recoveries',{password,recovery_code:mfa.codes[0]},user.cookie),post('/v1/staff/mfa/recoveries',{password,recovery_code:mfa.codes[0]},user.cookie)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);await get('/v1/staff/workspaces/SUPPORT',mfa.cookie).expect(403);
  await post('/v1/staff/mfa/recoveries',{password,recovery_code:mfa.codes[1]},user.cookie).expect(400);
  const fresh=await enroll(user.cookie);assert.notEqual(fresh.secret,mfa.secret);await get('/v1/staff/workspaces/SUPPORT',fresh.cookie).expect(200);
  await post('/v1/staff/mfa/recoveries',{password,recovery_code:mfa.codes[0]},user.cookie).expect(400);
});
test('password recovery revokes staff access without bypassing the existing authenticator',async()=>{
  const user=await fixture();const mfa=await enroll(user.cookie);
  await post('/v1/auth/recovery-emails',{email:user.email}).expect(202);
  const row=(await database.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=$1 ORDER BY created_at DESC,id DESC',[user.id])).rows.map(row=>decrypt<{reset_url?:string}>(row.encrypted_payload,config.authSecret)).find(row=>row.reset_url);
  const replacement='Replacement-password-456!';await post('/v1/auth/password-resets',{token:new URL(row!.reset_url!).hash.slice(7),password:replacement}).expect(200);
  await get('/v1/staff/workspaces/SUPPORT',mfa.cookie).expect(401);
  const fresh=(await post('/v1/auth/sessions',{email:user.email,password:replacement}).expect(200)).headers['set-cookie'][0];
  await get('/v1/staff/access',fresh).expect(200).expect(r=>{assert.equal(r.body.mfa_enrolled,true);assert.equal(r.body.authenticated,false);});
  await get('/v1/staff/workspaces/SUPPORT',combine(fresh,mfa.staffCookie)).expect(403);
  clock=new Date(clock.getTime()+30_000);
  const step=await post('/v1/staff/sessions',{password:replacement,code:totp(mfa.secret,clock)},fresh).expect(200);
  await get('/v1/staff/workspaces/SUPPORT',combine(fresh,step.headers['set-cookie'][0])).expect(200);
});
test('MFA brute-force limits persist across failed attempts; disabled and operator-revoked accounts lose access',async()=>{
  const user=await fixture();const mfa=await enroll(user.cookie);
  for(let i=0;i<8;i++)await post('/v1/staff/sessions',{password:'incorrect',code:totp(mfa.secret,clock)},user.cookie).expect(401);
  await post('/v1/staff/sessions',{password,code:totp(mfa.secret,clock)},user.cookie).expect(429);
  await database.pool.query("UPDATE users SET status='DISABLED' WHERE id=$1",[user.id]);await get('/v1/staff/workspaces/SUPPORT',mfa.cookie).expect(401);
  await assignStaff(database,user.email,null,'Remove operator permissions','test operator');
  assert.equal((await database.pool.query('SELECT enabled FROM staff_accounts WHERE user_id=$1',[user.id])).rows[0].enabled,false);
  await database.pool.query("UPDATE users SET status='ACTIVE' WHERE id=$1",[user.id]);
  await get('/v1/staff/workspaces/SUPPORT',mfa.cookie).expect(403);
});
test('production staff sessions use Secure host cookies and keep raw tokens out of JSON and storage',async()=>{
  const user=await fixture();const production=loadConfig({...productionPrivacyFixture(),NODE_ENV:'production',DATABASE_URL:config.databaseUrl,AUTH_SECRET:config.authSecret,WEB_ORIGIN:'https://tutoring.example',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'test',SMTP_PASSWORD:'not-live',SMTP_FROM:'accounts@example.test'});
  const productionApp=await createApplication(production,database,now);const cookie=user.cookie.split(';')[0].replace('tm_session=','__Host-tm_session=');
  const call=(path:string,body:unknown)=>request(productionApp.getHttpServer()).post(path).set('Origin',production.webOrigin).set('Cookie',cookie).send(body);
  try{
    const setup=await call('/v1/staff/mfa/enrollments',{password}).expect(200);
    const confirmed=await call('/v1/staff/mfa/confirmations',{code:totp(setup.body.secret,clock)}).expect(200);const elevated=confirmed.headers['set-cookie'][0];
    assert.match(elevated,/__Host-tm_staff=/);assert.match(elevated,/Secure/);assert.match(elevated,/HttpOnly/);assert.match(elevated,/SameSite=Lax/);assert.match(elevated,/Path=\//);
    const token=elevated.split(';')[0].split('=')[1];assert.ok(!JSON.stringify(confirmed.body).includes(token));
    assert.equal((await database.pool.query('SELECT token_hash FROM staff_sessions WHERE user_id=$1',[user.id])).rows[0].token_hash,tokenHash(token));
  }finally{await productionApp.close();}
});
