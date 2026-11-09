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
import {decrypt} from '../src/security.js';
import {assignStaff,type StaffScope} from '../src/staff.js';
import {totp} from '../src/totp.js';
import {historicalChild} from './helpers/historical-child.js';
// @ts-expect-error Local JavaScript helper has no declaration.
import {startDatabase} from '../../../scripts/postgres.mjs';

let app:INestApplication;let database:Database;let config:Config;let cluster:Awaited<ReturnType<typeof startDatabase>>;let clock=new Date();const now=()=>clock;
const origin='http://localhost:3000';const password='Learner-password-321!';
const post=(path:string,body:unknown,cookie?:string)=>{const call=request(app.getHttpServer()).post(path).set('Origin',origin).send(body);return cookie?call.set('Cookie',cookie):call;};
const get=(path:string,cookie?:string)=>{const call=request(app.getHttpServer()).get(path);return cookie?call.set('Cookie',cookie):call;};
const profile={alias:'Fictional learner',learning_requirements:'Practice school mathematics concepts'};
before(async()=>{
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  const directory=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/learner_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(directory,'mail'),GUARDIAN_VERIFICATION_MODE:'test'});
  cluster=await startDatabase(config.databaseUrl,join(directory,'postgres'));database=new Database(config.databaseUrl);await migrate(database);app=await createApplication(config,database,now);
});
beforeEach(()=>{clock=new Date(clock.getTime()+20*60_000);});
after(async()=>{await app?.close();await database?.close();await cluster?.stop();});
async function account(){const email=randomUUID()+'@example.test';await post('/v1/auth/registrations',{display_name:'Test adult',email,password}).expect(202);const row=(await database.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0];await post('/v1/auth/verifications',{token:new URL(decrypt<{verification_url:string}>(row.encrypted_payload,config.authSecret).verification_url).hash.slice(7)}).expect(200);const login=await post('/v1/auth/sessions',{email,password}).expect(200);return {email,id:login.body.user.id,cookie:login.headers['set-cookie'][0] as string};}
async function reviewer(scopes:StaffScope[]=['TRUST']){const user=await account();await assignStaff(database,user.email,scopes,'Fictional guardian review fixture','test operator');const setup=await post('/v1/staff/mfa/enrollments',{password},user.cookie).expect(200);const confirm=await post('/v1/staff/mfa/confirmations',{code:totp(setup.body.secret,clock)},user.cookie).expect(200);return {...user,baseCookie:user.cookie,cookie:user.cookie.split(';')[0]+'; '+confirm.headers['set-cookie'][0].split(';')[0]};}
test('adult profiles are private, unique, editable by owner and require adult attestation and Learner role',async()=>{
  const owner=await account();const unrelated=await account();
  await post('/v1/me/learners/adult',profile,owner.cookie).expect(400);
  const created=await post('/v1/me/learners/adult',{...profile,adult_confirmed:true},owner.cookie).expect(201);const id=created.body.profile.id;assert.equal(created.body.profile.usable,true);
  await post('/v1/me/learners/adult',{...profile,adult_confirmed:true},owner.cookie).expect(409);
  await get('/v1/me/learners',unrelated.cookie).expect(200).expect(r=>assert.equal(r.body.profiles.length,0));
  await get('/v1/me/learners/'+id+'/eligibility',unrelated.cookie).expect(404);
  await post('/v1/me/learners/'+id,{...profile,alias:'Other guardian'},unrelated.cookie).expect(404);
  await post('/v1/me/learners/'+id,{...profile,alias:'Updated alias'},owner.cookie).expect(200).expect(r=>assert.equal(r.body.profile.alias,'Updated alias'));
  await post('/v1/me/learners/'+id,{...profile,owner_id:unrelated.id},owner.cookie).expect(400);
  await post('/v1/me/roles',{roles:['TUTOR']},owner.cookie).expect(200);await get('/v1/me/learners/'+id+'/eligibility',owner.cookie).expect(403);
  await get('/v1/me/learners').expect(401);
});

// ADR 0015 retired child profiles and Guardian verification: a parent books for
// their child from their own adult Learner profile.
const retiredRoutes:[string,string][]=[['POST','/v1/me/learners/children'],['GET','/v1/me/guardian-verifications'],['POST','/v1/me/guardian-verifications'],['GET','/v1/staff/guardian-verifications'],['POST','/v1/staff/guardian-verifications/'+randomUUID()+'/inspections'],['POST','/v1/staff/guardian-verifications/'+randomUUID()+'/reviews']];
const call=(method:string,path:string,cookie:string)=>method==='GET'?get(path,cookie):post(path,{},cookie);

test('child profiles and Guardian verification are retired: every former route answers 410 and creates nothing',async()=>{
  const owner=await account();const staff=await reviewer();
  await get('/v1/learner-policy').expect(200).expect(r=>assert.deepEqual(r.body,{child_profiles_enabled:false,test_only:false,policy:null}));
  for(const [method,path] of retiredRoutes)for(const who of [owner,staff])await call(method,path,who.cookie).expect(410).expect(r=>assert.equal(r.body.code,'CHILD_PROFILES_RETIRED'));
  const adult=(await post('/v1/me/learners/adult',{...profile,adult_confirmed:true},owner.cookie).expect(201)).body.profile;
  await post('/v1/me/learners/'+adult.id+'/consents',{},owner.cookie).expect(410);
  assert.equal(Number((await database.pool.query("SELECT count(*) FROM learner_profiles WHERE owner_id=$1 AND kind='CHILD'",[owner.id])).rows[0].count),0);
  assert.equal(Number((await database.pool.query('SELECT count(*) FROM guardian_verifications WHERE user_id=$1',[owner.id])).rows[0].count),0);
});

test('a historical child profile stays unusable despite approval and consent; only its owner can still withdraw that consent',async()=>{
  const owner=await account();const unrelated=await account();const child=await historicalChild(database,owner.id,clock);
  const listed=(await get('/v1/me/learners',owner.cookie).expect(200)).body.profiles.find((p:{id:string})=>p.id===child.profileId);
  assert.equal(listed.kind,'CHILD');assert.equal(listed.usable,false);
  await get('/v1/me/learners/'+child.profileId+'/eligibility',owner.cookie).expect(403).expect(r=>assert.equal(r.body.code,'LEARNER_UNAVAILABLE'));
  await post('/v1/me/learners/'+child.profileId,profile,owner.cookie).expect(403);
  assert.equal((await database.pool.query('SELECT alias FROM learner_profiles WHERE id=$1',[child.profileId])).rows[0].alias,child.alias);
  await post('/v1/me/learners/'+child.profileId+'/consent-withdrawals',{},unrelated.cookie).expect(404);
  await post('/v1/me/learners/'+child.profileId+'/consent-withdrawals',{},owner.cookie).expect(200).expect(r=>assert.equal(r.body.code,'CONSENT_WITHDRAWN'));
  assert.equal((await database.pool.query('SELECT status FROM learner_profiles WHERE id=$1',[child.profileId])).rows[0].status,'WITHDRAWN');
  assert.equal(Number((await database.pool.query('SELECT count(*) FROM learner_consents WHERE profile_id=$1 AND withdrawn_at IS NULL',[child.profileId])).rows[0].count),0);
});

test('no configuration or injected adapter can make a historical child usable again',async()=>{
  const base={...productionPrivacyFixture(),NODE_ENV:'production',DATABASE_URL:config.databaseUrl,AUTH_SECRET:config.authSecret,WEB_ORIGIN:'https://tutoring.example',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'test',SMTP_PASSWORD:'not-live',SMTP_FROM:'accounts@example.test'};
  assert.throws(()=>loadConfig({...base,GUARDIAN_VERIFICATION_MODE:'test'}),/forbidden/);assert.throws(()=>loadConfig({...base,GUARDIAN_VERIFICATION_MODE:'approved'}),/Unknown/);
  const owner=await account();const child=await historicalChild(database,owner.id,clock);
  const adapter={policy:{id:'test-guardian-v1',notice_version:'test-notice-v1',consent_version:'test-consent-v1',notice:'Fictional',consent:'Fictional',test_only:true,approved_for_production:false,approval_reference:'NONPRODUCTION'},assess:()=>({identifiable_adult:true,lawful_authority:true})};
  const injected=await createApplication(config,database,now,adapter);
  try{
    const listed=(await request(injected.getHttpServer()).get('/v1/me/learners').set('Cookie',owner.cookie).expect(200)).body.profiles.find((p:{id:string})=>p.id===child.profileId);
    assert.equal(listed.usable,false);
    await request(injected.getHttpServer()).get('/v1/me/learners/'+child.profileId+'/eligibility').set('Cookie',owner.cookie).expect(403);
    await request(injected.getHttpServer()).post('/v1/me/learners/children').set('Origin',origin).set('Cookie',owner.cookie).send({}).expect(410);
  }finally{await injected.close();}
});
