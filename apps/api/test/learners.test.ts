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
import {TestGuardianVerifier} from '../src/guardian-verifier.js';
import {totp} from '../src/totp.js';
// @ts-expect-error Local JavaScript helper has no declaration.
import {startDatabase} from '../../../scripts/postgres.mjs';

let app:INestApplication;let database:Database;let config:Config;let cluster:Awaited<ReturnType<typeof startDatabase>>;let clock=new Date();const now=()=>clock;
const origin='http://localhost:3000';const password='Learner-password-321!';
const post=(path:string,body:unknown,cookie?:string)=>{const call=request(app.getHttpServer()).post(path).set('Origin',origin).send(body);return cookie?call.set('Cookie',cookie):call;};
const get=(path:string,cookie?:string)=>{const call=request(app.getHttpServer()).get(path);return cookie?call.set('Cookie',cookie):call;};
const consent={accepted:true,notice_version:'test-notice-v1',consent_version:'test-consent-v1'};
const profile={alias:'Fictional learner',learning_requirements:'Practice school mathematics concepts'};
const application={adult_reference:'test-adult-confirmed',authority_reference:'test-authority-confirmed',adult_confirmed:true,consent};
before(async()=>{
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  const directory=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/learner_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(directory,'mail'),GUARDIAN_VERIFICATION_MODE:'test'});
  cluster=await startDatabase(config.databaseUrl,join(directory,'postgres'));database=new Database(config.databaseUrl);await migrate(database);app=await createApplication(config,database,now);
});
beforeEach(()=>{clock=new Date(clock.getTime()+20*60_000);});
after(async()=>{await app?.close();await database?.close();await cluster?.stop();});
async function account(){const email=randomUUID()+'@example.test';await post('/v1/auth/registrations',{display_name:'Test adult',email,password}).expect(202);const row=(await database.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0];await post('/v1/auth/verifications',{token:new URL(decrypt<{verification_url:string}>(row.encrypted_payload,config.authSecret).verification_url).hash.slice(7)}).expect(200);const login=await post('/v1/auth/sessions',{email,password}).expect(200);return {email,id:login.body.user.id,cookie:login.headers['set-cookie'][0] as string};}
async function reviewer(scopes:StaffScope[]=['TRUST']){const user=await account();await assignStaff(database,user.email,scopes,'Fictional guardian review fixture','test operator');const setup=await post('/v1/staff/mfa/enrollments',{password},user.cookie).expect(200);const confirm=await post('/v1/staff/mfa/confirmations',{code:totp(setup.body.secret,clock)},user.cookie).expect(200);return {...user,baseCookie:user.cookie,cookie:user.cookie.split(';')[0]+'; '+confirm.headers['set-cookie'][0].split(';')[0]};}
const review=(id:string,decision:'APPROVE'|'REJECT'|'REVOKE',cookie:string)=>post('/v1/staff/guardian-verifications/'+id+'/reviews',{decision,identifiable_adult_reviewed:true,authority_reviewed:true,reason:'Review fictional authority evidence'},cookie);
async function approved(owner:Awaited<ReturnType<typeof account>>,staff:Awaited<ReturnType<typeof reviewer>>){const applied=await post('/v1/me/guardian-verifications',application,owner.cookie).expect(201);await review(applied.body.id,'APPROVE',staff.cookie).expect(200);return applied.body.id as string;}
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
test('Guardian approval records versions, identifiable-adult/authority review and private audited inspection',async()=>{
  const owner=await account();const staff=await reviewer();const support=await reviewer(['SUPPORT']);
  const applied=await post('/v1/me/guardian-verifications',application,owner.cookie).expect(201);const id=applied.body.id;
  await post('/v1/me/guardian-verifications',application,owner.cookie).expect(409);
  await get('/v1/staff/guardian-verifications',support.cookie).expect(403);await get('/v1/staff/guardian-verifications',staff.baseCookie).expect(403);
  const queue=await get('/v1/staff/guardian-verifications',staff.cookie).expect(200);assert.ok(!JSON.stringify(queue.body).includes('test-adult-confirmed'));
  await post('/v1/staff/guardian-verifications/'+id+'/inspections',{reason:'Inspect fictional authority records'},owner.cookie).expect(403);
  await post('/v1/staff/guardian-verifications/'+id+'/inspections',{reason:'Inspect fictional authority records'},staff.cookie).expect(200).expect(r=>assert.equal(r.body.verification.evidence.adult_reference,application.adult_reference));
  await post('/v1/staff/guardian-verifications/'+id+'/reviews',{decision:'APPROVE',identifiable_adult_reviewed:false,authority_reviewed:true,reason:'Review fictional authority evidence'},staff.cookie).expect(400);
  await review(id,'APPROVE',staff.cookie).expect(200);await review(id,'APPROVE',staff.cookie).expect(409);
  const row=(await database.pool.query('SELECT * FROM guardian_reviews WHERE verification_id=$1',[id])).rows[0];assert.equal(row.reviewer_id,staff.id);assert.equal(row.identifiable_adult_reviewed,true);assert.equal(row.authority_reviewed,true);assert.equal(row.notice_version,consent.notice_version);assert.equal(row.consent_version,consent.consent_version);
  const stored=(await database.pool.query('SELECT encrypted_evidence FROM guardian_verifications WHERE id=$1',[id])).rows[0];assert.ok(!JSON.stringify(stored).includes(application.adult_reference));
  const audit=(await database.pool.query("SELECT metadata FROM audit_events WHERE event_type='GUARDIAN_EVIDENCE_INSPECTED' AND metadata->>'target'=$1",[id])).rows[0];assert.equal(audit.metadata.reason,'Inspect fictional authority records');
});
test('child profiles have no independent identity; missing/current/withdrawn consent and foreign IDs are enforced',async()=>{
  const owner=await account();const other=await account();const staff=await reviewer();
  await post('/v1/me/learners/children',{...profile,age_band:'UNDER_13',consent},owner.cookie).expect(403);
  await approved(owner,staff);
  await post('/v1/me/learners/children',{...profile,age_band:'UNDER_13'},owner.cookie).expect(400);
  await post('/v1/me/learners/children',{...profile,age_band:'UNDER_13',consent:{...consent,accepted:false}},owner.cookie).expect(400);
  await post('/v1/me/learners/children',{...profile,age_band:'UNDER_13',consent:{...consent,notice_version:'old'}},owner.cookie).expect(400);
  await post('/v1/me/learners/children',{...profile,age_band:'UNDER_13',consent,email:'child@example.test',date_of_birth:'2020-01-01'},owner.cookie).expect(400);
  const created=await post('/v1/me/learners/children',{...profile,age_band:'UNDER_13',consent},owner.cookie).expect(201);const id=created.body.profile.id;
  assert.equal(created.body.profile.usable,true);assert.equal((await database.pool.query('SELECT count(*) FROM users WHERE id=$1',[id])).rows[0].count,'0');
  await get('/v1/me/learners/'+id+'/eligibility',other.cookie).expect(404);
  await post('/v1/me/learners/'+id+'/consent-withdrawals',{},other.cookie).expect(404);
  await post('/v1/me/learners/'+id+'/consents',consent,other.cookie).expect(403);
  await post('/v1/me/learners/'+id+'/consent-withdrawals',{},owner.cookie).expect(200);
  await get('/v1/me/learners/'+id+'/eligibility',owner.cookie).expect(403);await post('/v1/me/learners/'+id,profile,owner.cookie).expect(403);
  await get('/v1/me/learners',owner.cookie).expect(200).expect(r=>assert.equal(r.body.profiles[0].usable,false));
  await post('/v1/me/learners/'+id+'/consents',consent,owner.cookie).expect(200);await get('/v1/me/learners/'+id+'/eligibility',owner.cookie).expect(200);
  const audits=(await database.pool.query('SELECT metadata FROM audit_events WHERE user_id=$1',[owner.id])).rows;for(const payload of [profile.alias,profile.learning_requirements,application.adult_reference])assert.ok(!JSON.stringify(audits).includes(payload));
});
test('insufficient/rejected evidence, self-review and approval revocation prevent child use',async()=>{
  const staff=await reviewer();const owner=await account();
  const rejected=await post('/v1/me/guardian-verifications',{...application,authority_reference:'test-authority-rejected'},owner.cookie).expect(201);
  await review(rejected.body.id,'APPROVE',staff.cookie).expect(400);await review(rejected.body.id,'REJECT',staff.cookie).expect(200);
  await post('/v1/me/learners/children',{...profile,age_band:'13_15',consent},owner.cookie).expect(403);
  const id=await approved(owner,staff);const created=await post('/v1/me/learners/children',{...profile,age_band:'13_15',consent},owner.cookie).expect(201);
  await review(id,'REVOKE',staff.cookie).expect(200);await get('/v1/me/learners/'+created.body.profile.id+'/eligibility',owner.cookie).expect(403);await post('/v1/me/learners/'+created.body.profile.id+'/consents',consent,owner.cookie).expect(403);
  const self=await post('/v1/me/guardian-verifications',application,staff.cookie).expect(201);await review(self.body.id,'APPROVE',staff.cookie).expect(403);
});
test('concurrent revocation cannot leave a child profile eligible after approval is removed',async()=>{
  const owner=await account();const staff=await reviewer();const id=await approved(owner,staff);
  const [created,revoked]=await Promise.all([post('/v1/me/learners/children',{...profile,age_band:'16_17',consent},owner.cookie),review(id,'REVOKE',staff.cookie)]);assert.equal(revoked.status,200);assert.ok([201,403].includes(created.status));
  if(created.status===201)await get('/v1/me/learners/'+created.body.profile.id+'/eligibility',owner.cookie).expect(403);
});
test('production child-data gate refuses missing policy, test mode, test adapter and test evidence',async()=>{
  const base={...productionPrivacyFixture(),NODE_ENV:'production',DATABASE_URL:config.databaseUrl,AUTH_SECRET:config.authSecret,WEB_ORIGIN:'https://tutoring.example',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'test',SMTP_PASSWORD:'not-live',SMTP_FROM:'accounts@example.test'};
  assert.throws(()=>loadConfig({...base,GUARDIAN_VERIFICATION_MODE:'test'}),/forbidden/);assert.throws(()=>loadConfig({...base,GUARDIAN_VERIFICATION_MODE:'approved'}),/Unknown/);
  const prod=loadConfig(base);await assert.rejects(createApplication(prod,database,now,new TestGuardianVerifier()),/approved Guardian/);
  const prodApp=await createApplication(prod,database,now);
  try{
    await request(prodApp.getHttpServer()).get('/v1/learner-policy').expect(200).expect(r=>assert.equal(r.body.child_profiles_enabled,false));
    await request(prodApp.getHttpServer()).post('/v1/me/guardian-verifications').set('Origin',prod.webOrigin).send(application).expect(503);
    await request(prodApp.getHttpServer()).post('/v1/me/learners/children').set('Origin',prod.webOrigin).send({...profile,age_band:'UNDER_13',consent}).expect(503);
  }finally{await prodApp.close();}
  // An independently configured production adapter still cannot accept test references.
  const adapter={policy:{...new TestGuardianVerifier().policy,test_only:false,approved_for_production:true,approval_reference:'TEST-HARNESS-SIMULATED-APPROVAL'},assess:()=>({identifiable_adult:true,lawful_authority:true})};
  const injected=await createApplication(prod,database,now,adapter);
  try{await request(injected.getHttpServer()).post('/v1/me/guardian-verifications').set('Origin',prod.webOrigin).send(application).expect(400).expect(r=>assert.equal(r.body.code,'TEST_EVIDENCE_FORBIDDEN'));}finally{await injected.close();}
});
