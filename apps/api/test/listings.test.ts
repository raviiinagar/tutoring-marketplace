import {grantTutorProFixture} from '../../../scripts/tutor-pro-fixture.js';
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
import {ClamAvScanner,TestEvidenceScanner} from '../src/evidence-scanner.js';
import {TutorsService,isAdult} from '../src/tutors.js';
import {AuthService} from '../src/auth.js';
import {StaffService} from '../src/staff.js';
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
  const directory=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/staff_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(directory,'mail'),EVIDENCE_SCANNER:'test'});
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
const profile={display_name:'Fictional Tutor',biography:'I explain school physics and mathematics using worked examples.',birth_date:'1990-01-01',adult_confirmed:true};
const offer={title:'Physics with worked examples',description:'School physics explained patiently with examples and structured practice.',domain_id:'school',subject_id:'subject-physics',level_id:'level-class-10',curriculum_id:'curriculum-cbse',language_ids:['language-english'],currency:'INR',teaching_mode:'ONLINE',rate_paise:50000,rate_unit:'HOUR',trial_kind:'NONE'};
async function tutor(approved=true,subjects=['subject-physics']){
 const user=await fixture(null);await post('/v1/me/roles',{roles:['TUTOR']},user.cookie).expect(200);await post('/v1/me/tutor',profile,user.cookie).expect(200);
 if(approved){const reviewer=await fixture(['TRUST']);const mfa=await enroll(reviewer.cookie);for(const [kind,subjectId] of [['IDENTITY',''],...subjects.map(subject=>['QUALIFICATION',subject])]){const file=(await post('/v1/me/tutor/evidence',{media_type:'application/pdf',data:Buffer.from('%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n').toString('base64')},user.cookie).expect(201)).body.evidence.id;await post('/v1/me/tutor/claims',{kind,description:'Fictional evidence for '+kind,evidence_id:file,...(kind==='IDENTITY'?{}:{subject_id:subjectId})},user.cookie).expect(201);}await post('/v1/me/tutor/submissions',{},user.cookie).expect(200);const claims=(await get('/v1/me/tutor',user.cookie)).body.claims;for(const claim of claims)await post('/v1/staff/tutor-claims/'+claim.id+'/reviews',{outcome:'APPROVE',checked_item:'Fictional document and claim checked',reason:'Approve fictional Tutor evidence',adult_identity_confirmed:true,expires_at:new Date(clock.getTime()+86400000).toISOString()},mfa.cookie).expect(200);await grantTutorProFixture(database,config,user.email,clock);return {...user,reviewer:mfa};}
 return {...user,reviewer:undefined};
}
async function draft(user:{cookie:string}){return (await post('/v1/me/listings',offer,user.cookie).expect(201)).body.listing;}
async function submitted(user:{cookie:string}){const row=await draft(user);return (await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;}
async function publish(user:Awaited<ReturnType<typeof tutor>>){const row=await submitted(user);return (await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Exact school Physics offer checked'},user.reviewer!.cookie).expect(200)).body.listing;}
test('new offer eligibility names only current approved Subjects, including a Commerce-only Tutor',async()=>{
 const user=await tutor(true,['subject-commerce']);
 assert.equal((await get('/v1/me/tutor',user.cookie)).body.profile.eligible,true);
 const state=(await get('/v1/me/listings',user.cookie).expect(200)).body;
 assert.deepEqual(state.eligible_subject_ids,['subject-commerce']);assert.deepEqual(state.listings,[]);
 await post('/v1/me/listings',offer,user.cookie).expect(403);
 await post('/v1/me/listings',{...offer,title:'Commerce explained through examples',subject_id:'subject-commerce'},user.cookie).expect(201);
 await database.pool.query("UPDATE tutor_claims SET expires_at=$2 WHERE user_id=$1 AND subject_id='subject-commerce'",[user.id,clock]);
 assert.deepEqual((await get('/v1/me/listings',user.cookie).expect(200)).body.eligible_subject_ids,[]);
 await database.pool.query("UPDATE tutor_claims SET expires_at=$2 WHERE user_id=$1 AND subject_id='subject-commerce'",[user.id,new Date(clock.getTime()+86400000)]);
 assert.deepEqual((await get('/v1/me/listings',user.cookie)).body.eligible_subject_ids,['subject-commerce']);
 await post('/v1/me/tutor',profile,user.cookie).expect(200);
 const revised=(await get('/v1/me/listings',user.cookie).expect(200)).body;assert.deepEqual(revised.eligible_subject_ids,[]);assert.equal(revised.listings.length,1);
});
test('offers require approved Subject evidence and strict taxonomy, rates, durations and contact-free text',async()=>{
 const user=await tutor();const pending=await tutor(false);await post('/v1/me/listings',offer).expect(401);await post('/v1/me/listings',offer,pending.cookie).expect(403);
 for(const change of [{owner_id:user.id},{currency:'USD'},{rate_paise:1},{rate_paise:100.1},{teaching_mode:'IN_PERSON'},{language_ids:['language-english','language-english']},{curriculum_id:undefined},{domain_id:'career'},{subject_id:'exam-jee'},{rate_unit:'LESSON'},{trial_kind:'FREE'},{trial_price_paise:500},{title:'Contact tutor@example.test'},{description:'Contact me at https://example.test for private tutoring lessons.'},{curriculum_id:'curriculum-isc',level_id:'level-class-10'}])await post('/v1/me/listings',{...offer,...change},user.cookie).expect(change.subject_id==='exam-jee'?403:400);
 await post('/v1/me/listings',{...offer,domain_id:'entrance',subject_id:'subject-mathematics',level_id:'level-repeater',curriculum_id:undefined,exam_id:'exam-neet'},user.cookie).expect(400);
 await post('/v1/me/listings',{...offer,subject_id:'subject-mathematics'},user.cookie).expect(403);
 await post('/v1/me/listings',{...offer,rate_unit:'LESSON',lesson_minutes:60,trial_kind:'PAID',trial_minutes:30,trial_price_paise:10000},user.cookie).expect(201);
});
test('correction, optimistic edits, approval, public privacy and pause/resume transitions are enforced',async()=>{
 const user=await tutor();let row=await submitted(user);await get('/v1/listings/'+row.id).expect(404);await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(409);
 row=(await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'CHANGES_REQUESTED',reason:'Clarify the tuition unit and teaching approach'},user.reviewer!.cookie).expect(200)).body.listing;assert.equal(row.status,'CHANGES_REQUESTED');
 const previous=row.revision;row=(await post('/v1/me/listings/'+row.id,{revision:row.revision,offer:{...offer,title:'Corrected Physics teaching offer'}},user.cookie).expect(200)).body.listing;assert.equal(row.status,'DRAFT');await post('/v1/me/listings/'+row.id,{revision:previous,offer},user.cookie).expect(409);
 row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;row=(await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Corrected exact Physics combination checked'},user.reviewer!.cookie).expect(200)).body.listing;assert.equal(row.eligible,true);
 const response=await get('/v1/listings/'+row.id).expect(200);assert.equal(response.body.listing.rate_paise,50000);for(const key of ['user_id','birth_date','evidence','reviewed_by','safety_reason','email'])assert.equal(response.body.listing[key],undefined);
 row=(await post('/v1/me/listings/'+row.id+'/actions/PAUSE',{revision:row.revision},user.cookie).expect(200)).body.listing;await get('/v1/listings/'+row.id).expect(404);row=(await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(200)).body.listing;await get('/v1/listings/'+row.id).expect(200);
 const old=row.revision;row=(await post('/v1/me/listings/'+row.id,{revision:old,offer:{...offer,rate_paise:60000}},user.cookie).expect(200)).body.listing;assert.equal(row.status,'DRAFT');await get('/v1/listings/'+row.id).expect(404);await post('/v1/staff/listings/'+row.id+'/reviews',{revision:old,outcome:'APPROVE',reason:'Stale previous approval attempt'},user.reviewer!.cookie).expect(409);
 const history=(await database.pool.query('SELECT * FROM listing_decisions WHERE listing_id=$1',[row.id])).rows;assert.equal(history.length,2);assert.ok(history.every(r=>r.actor_id));
});
test('foreign owners, missing/scoped MFA and self review cannot change offers',async()=>{
 const user=await tutor();const row=await submitted(user);const other=await tutor(false);await post('/v1/me/listings/'+row.id,{revision:row.revision,offer},other.cookie).expect(404);await post('/v1/me/listings/'+row.id+'/actions/PAUSE',{revision:row.revision},other.cookie).expect(404);
 const support=await fixture(['SUPPORT']);const supportMfa=await enroll(support.cookie);await get('/v1/staff/listings',supportMfa.cookie).expect(403);await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Unauthorized staff review attempt'},supportMfa.cookie).expect(403);
 await post('/v1/staff/listings/'+row.id+'/inspections',{reason:'Missing staff session attempt'},user.cookie).expect(403);await assignStaff(database,user.email,['TRUST'],'Check self review restrictions','test operator');const self=await enroll(user.cookie);await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Self publication attempt forbidden'},self.cookie).expect(403);
});
test('safety suspension survives owner edits and only Trust staff can lift it without auto publication',async()=>{
 const user=await tutor();let row=await publish(user);row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'SUSPEND',reason:'Restrict fictional offer for safety review'},user.reviewer!.cookie).expect(200)).body.listing;assert.equal(row.status,'SAFETY_SUSPENDED');await get('/v1/listings/'+row.id).expect(404);await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(409);
 row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'LIFT',reason:'Safety investigation allows availability decision'},user.reviewer!.cookie).expect(200)).body.listing;assert.equal(row.status,'PAUSED');await get('/v1/listings/'+row.id).expect(404);row=(await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(200)).body.listing;
 row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'SUSPEND',reason:'Repeat fictional safety restriction'},user.reviewer!.cookie).expect(200)).body.listing;row=(await post('/v1/me/listings/'+row.id,{revision:row.revision,offer:{...offer,title:'Edited while safety suspended'}},user.cookie).expect(200)).body.listing;assert.equal(row.status,'SAFETY_SUSPENDED');await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(409);
 row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'LIFT',reason:'Allow corrected draft to be reviewed'},user.reviewer!.cookie).expect(200)).body.listing;assert.equal(row.status,'DRAFT');await get('/v1/listings/'+row.id).expect(404);
});
test('profile revision, approval expiry/revocation, inactive taxonomy and disabled accounts block public availability',async()=>{
 const user=await tutor();const row=await publish(user);await database.pool.query("UPDATE catalogue_terms SET active=false WHERE id='curriculum-cbse'");await get('/v1/listings/'+row.id).expect(404);await database.pool.query("UPDATE catalogue_terms SET active=true WHERE id='curriculum-cbse'");await get('/v1/listings/'+row.id).expect(200);
 clock=new Date(clock.getTime()+86400000);await get('/v1/listings/'+row.id).expect(404);clock=new Date(clock.getTime()-86400000);
 await database.pool.query("UPDATE users SET status='DISABLED' WHERE id=$1",[user.id]);await get('/v1/listings/'+row.id).expect(404);await database.pool.query("UPDATE users SET status='ACTIVE' WHERE id=$1",[user.id]);
 const claims=(await get('/v1/me/tutor',user.cookie)).body.claims;await post('/v1/staff/tutor-claims/'+claims.find((c:{kind:string})=>c.kind==='QUALIFICATION').id+'/reviews',{outcome:'REVOKE',checked_item:'Qualification approval revoked',reason:'Revoke fictional Physics evidence',adult_identity_confirmed:false},user.reviewer!.cookie).expect(200);await get('/v1/listings/'+row.id).expect(404);
 await post('/v1/me/tutor',profile,user.cookie).expect(200);const own=await get('/v1/me/listings',user.cookie).expect(200);assert.equal(own.body.listings[0].status,'CHANGES_REQUESTED');assert.equal(own.body.listings[0].requires_profile_review,true);await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(409);
});
test('concurrent content edit and staff approval permit one revision transition and never stale publication',async()=>{
 const user=await tutor();const row=await submitted(user);const results=await Promise.all([post('/v1/me/listings/'+row.id,{revision:row.revision,offer:{...offer,title:'Concurrently revised Physics offer'}},user.cookie),post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Concurrent original offer approval'},user.reviewer!.cookie)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const own=(await get('/v1/me/listings',user.cookie)).body.listings[0];const publicResponse=await get('/v1/listings/'+row.id);assert.equal(publicResponse.status,own.status==='PUBLISHED'?200:404);
});


test('all eight Learning Domains can publish explicit offers without crossing subject and exam claims',async()=>{
 const combinations=[{domain_id:'school',subject_id:'subject-physics',level_id:'level-class-10',curriculum_id:'curriculum-cbse'}, {domain_id:'entrance',subject_id:'subject-physics',level_id:'level-repeater',exam_id:'exam-jee'}, {domain_id:'higher',subject_id:'subject-physics',level_id:'level-undergraduate'}, {domain_id:'competitive',subject_id:'subject-mathematics',level_id:'level-exam-preparation',exam_id:'exam-ssc'}, {domain_id:'professional',subject_id:'subject-accounting',level_id:'level-exam-preparation',exam_id:'exam-ca'}, {domain_id:'career',subject_id:'subject-programming',level_id:'level-beginner'}, {domain_id:'languages',subject_id:'subject-french',level_id:'level-beginner'}, {domain_id:'arts',subject_id:'subject-music',level_id:'level-beginner'}];
 const user=await tutor(true,[...new Set(combinations.map(c=>c.subject_id))]);
 for(const combination of combinations){let row=(await post('/v1/me/listings',{...offer,curriculum_id:undefined,...combination},user.cookie).expect(201)).body.listing;row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Exact domain offer combination reviewed'},user.reviewer!.cookie).expect(200);const publicOffer=await get('/v1/listings/'+row.id).expect(200);assert.equal(publicOffer.body.listing.subject_id,combination.subject_id);assert.equal(publicOffer.body.listing.exam_id,combination.exam_id);}
});
