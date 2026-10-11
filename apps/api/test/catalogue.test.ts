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
const selection={domain_id:'entrance',subject_id:'subject-physics',level_id:'level-repeater',exam_id:'exam-jee',language_id:'language-hindi'};
const term={id:'subject-test-topic',kind:'SUBJECT',label:'Test topic',aliases:['Fixture subject'],domain_ids:['career'],active:true,reason:'Maintain catalogue fixture terms'};
test('public catalogue has all eight domains and separate seeded taxonomy with stable aliases',async()=>{
  const first=await get('/v1/catalogue').expect(200);assert.equal(first.body.domains.length,8);
  assert.deepEqual(first.body.domains.map((domain:{id:string})=>domain.id),['school','entrance','higher','competitive','professional','career','languages','arts']);
  for(const domain of first.body.domains){for(const kind of ['SUBJECT','LEVEL','LANGUAGE'])assert.ok(first.body.terms.some((t:{kind:string;domain_ids:string[]})=>t.kind===kind&&t.domain_ids.includes(domain.id)));}
  for(const id of ['exam-jee','exam-jee-main','exam-jee-advanced','exam-neet','exam-cuet','curriculum-cbse','curriculum-icse','curriculum-isc','curriculum-state-board'])assert.ok(first.body.terms.some((t:{id:string})=>t.id===id));
  for(const name of ['IIT JEE','iit-jee','ＩＩＴ ＪＥＥ'])await get('/v1/catalogue/resolve/EXAM/'+encodeURIComponent(name)).expect(200).expect(r=>assert.equal(r.body.term.id,'exam-jee'));
  await get('/v1/catalogue/resolve/SUBJECT/Maths').expect(200).expect(r=>assert.equal(r.body.term.id,'subject-mathematics'));
  await get('/v1/catalogue/resolve/LANGUAGE/English').expect(200).expect(r=>assert.equal(r.body.term.id,'language-english'));
  await get('/v1/catalogue/resolve/SUBJECT/English').expect(200).expect(r=>assert.equal(r.body.term.id,'subject-english'));
  await migrate(database);assert.deepEqual((await get('/v1/catalogue')).body,first.body);
});
test('selection validation rejects unknown, mistyped and unrelated fields while allowing a repeater',async()=>{
  await post('/v1/catalogue/validations',selection).expect(200);
  await post('/v1/catalogue/validations',{...selection,subject_id:'exam-jee'}).expect(400);
  await post('/v1/catalogue/validations',{...selection,domain_id:'career'}).expect(400);
  await post('/v1/catalogue/validations',{...selection,curriculum_id:'curriculum-cbse'}).expect(400);
  await post('/v1/catalogue/validations',{...selection,subject_id:'unknown-subject'}).expect(400);
  await post('/v1/catalogue/validations',{...selection,owner_id:randomUUID()}).expect(400);
  await post('/v1/catalogue/validations',{domain_id:'school',subject_id:'subject-physics',level_id:'level-class-10',curriculum_id:'curriculum-cbse',language_id:'language-english'}).expect(200);
});
test('catalogue maintenance denies anonymous, public, non-Trust, missing and revoked MFA sessions',async()=>{
  await get('/v1/staff/catalogue').expect(401);await post('/v1/staff/catalogue/terms',term).expect(401);
  const publicUser=await fixture(null);await post('/v1/staff/catalogue/terms',term,publicUser.cookie).expect(403);
  const support=await fixture(['SUPPORT']);const supportMfa=await enroll(support.cookie);await get('/v1/staff/catalogue',supportMfa.cookie).expect(403);await post('/v1/staff/catalogue/terms',term,supportMfa.cookie).expect(403);
  const trust=await fixture(['TRUST']);await post('/v1/staff/catalogue/terms',term,trust.cookie).expect(403);
  const mfa=await enroll(trust.cookie);await get('/v1/staff/catalogue',mfa.cookie).expect(200);
  await del('/v1/staff/sessions/current',mfa.cookie).expect(204);await post('/v1/staff/catalogue/terms',term,mfa.cookie).expect(403);
});
test('Trust edits are durable and audited; inactive terms disappear publicly and fail selection validation',async()=>{
  const operator=await fixture(['TRUST']);const mfa=await enroll(operator.cookie);
  await post('/v1/staff/catalogue/terms',term,mfa.cookie).expect(200);
  await get('/v1/catalogue/resolve/SUBJECT/fixture-subject').expect(200).expect(r=>assert.equal(r.body.term.id,term.id));
  const publicTerms=(await get('/v1/catalogue')).body.terms;assert.deepEqual((await get('/v1/staff/catalogue',mfa.cookie)).body.terms,publicTerms);
  const selected={domain_id:'career',subject_id:term.id,level_id:'level-beginner',language_id:'language-hindi'};await post('/v1/catalogue/validations',selected).expect(200);
  await post('/v1/staff/catalogue/terms',{...term,active:false},mfa.cookie).expect(200);
  assert.ok(!(await get('/v1/catalogue')).body.terms.some((row:{id:string})=>row.id===term.id));
  assert.ok((await get('/v1/staff/catalogue',mfa.cookie)).body.terms.some((row:{id:string;active:boolean})=>row.id===term.id&&!row.active));
  await get('/v1/catalogue/resolve/SUBJECT/Fixture%20subject').expect(404);await post('/v1/catalogue/validations',selected).expect(400);
  await post('/v1/staff/catalogue/terms',{...term,active:true,label:'Updated test topic',aliases:['New fixture name']},mfa.cookie).expect(200);
  await get('/v1/catalogue/resolve/SUBJECT/Fixture%20subject').expect(404);await get('/v1/catalogue/resolve/SUBJECT/New%20fixture%20name').expect(200);
  const audit=(await database.pool.query("SELECT * FROM audit_events WHERE event_type='CATALOGUE_TERM_SAVED' AND metadata->>'target'=$1 ORDER BY created_at DESC",[term.id])).rows;
  assert.equal(audit.length,3);assert.ok(audit.every(row=>row.user_id===operator.id&&row.metadata.reason===term.reason));
});
test('invalid taxonomy, reused aliases, immutable types and concurrent duplicate names are rejected atomically',async()=>{
  const operator=await fixture(['TRUST']);const mfa=await enroll(operator.cookie);
  for(const change of [{kind:'BOARD'},{domain_ids:['unknown']},{domain_ids:['school','school']},{label:'Physics',aliases:[]},{aliases:['Test topic']},{aliases:['!!!']},{reason:'short'},{id:'bad id'}])await post('/v1/staff/catalogue/terms',{...term,...change},mfa.cookie).expect(change.label==='Physics'?409:400);
  await post('/v1/staff/catalogue/terms',{...term,id:'exam-jee',kind:'SUBJECT'},mfa.cookie).expect(409);
  const responses=await Promise.all(['subject-race-one','subject-race-two'].map(id=>post('/v1/staff/catalogue/terms',{...term,id,label:'Concurrent topic',aliases:[]},mfa.cookie)));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const winner=responses.find(r=>r.status===200)!.body.term;
  await post('/v1/staff/catalogue/terms',{...winner,active:false,reason:term.reason},mfa.cookie).expect(200);
  await post('/v1/staff/catalogue/terms',{...term,id:'subject-third',label:'Concurrent topic',aliases:[]},mfa.cookie).expect(409);
});
