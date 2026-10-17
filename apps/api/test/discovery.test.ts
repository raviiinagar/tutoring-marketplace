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
import {decrypt,encrypt,tokenHash} from '../src/security.js';
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
beforeEach(()=>{clock=new Date(clock.getTime()+8*86400000);});
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
 if(approved){const reviewer=await fixture(['TRUST']);const mfa=await enroll(reviewer.cookie);for(const [kind,subjectId] of [['IDENTITY',''],...subjects.map(subject=>['QUALIFICATION',subject])]){const file=(await post('/v1/me/tutor/evidence',{media_type:'application/pdf',data:Buffer.from('%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n').toString('base64')},user.cookie).expect(201)).body.evidence.id;await post('/v1/me/tutor/claims',{kind,description:'Fictional evidence for '+kind,evidence_id:file,...(kind==='IDENTITY'?{}:{subject_id:subjectId})},user.cookie).expect(201);}await post('/v1/me/tutor/submissions',{},user.cookie).expect(200);const claims=(await get('/v1/me/tutor',user.cookie)).body.claims;for(const claim of claims)await post('/v1/staff/tutor-claims/'+claim.id+'/reviews',{outcome:'APPROVE',checked_item:'Fictional document and claim checked',reason:'Approve fictional Tutor evidence',adult_identity_confirmed:true,expires_at:new Date(clock.getTime()+86400000).toISOString()},mfa.cookie).expect(200);return {...user,reviewer:mfa};}
 return {...user,reviewer:undefined};
}
async function draft(user:{cookie:string}){return (await post('/v1/me/listings',offer,user.cookie).expect(201)).body.listing;}
async function submitted(user:{cookie:string}){const row=await draft(user);return (await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;}
async function publish(user:Awaited<ReturnType<typeof tutor>>){const row=await submitted(user);return (await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Exact school Physics offer checked'},user.reviewer!.cookie).expect(200)).body.listing;}
async function publishOffer(user:Awaited<ReturnType<typeof tutor>>,payload:unknown){let row=(await post('/v1/me/listings',payload,user.cookie).expect(201)).body.listing;row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;return (await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Exact public discovery fixture checked'},user.reviewer!.cookie).expect(200)).body.listing;}
const find=(query:Record<string,string|number>={})=>request(app.getHttpServer()).get('/v1/discovery').query(query);
test('filters match one exact offer rather than mixing CBSE Physics and JEE Mathematics profile claims',async()=>{
 const user=await tutor(true,['subject-physics','subject-mathematics']);const physics=await publishOffer(user,offer);const maths=await publishOffer(user,{...offer,title:'JEE Mathematics exam preparation',domain_id:'entrance',subject_id:'subject-mathematics',level_id:'level-repeater',curriculum_id:undefined,exam_id:'exam-jee',language_ids:['language-hindi'],rate_paise:75000});
 const exact=await find({subject_id:'subject-physics',curriculum_id:'curriculum-cbse',level_id:'level-class-10',language_id:'language-english'}).expect(200);assert.deepEqual(exact.body.offers.map((r:{id:string})=>r.id),[physics.id]);const noCross=await find({subject_id:'subject-physics',exam_id:'exam-jee'}).expect(200);assert.equal(noCross.body.offers.length,0);
 const jee=await find({domain_id:'entrance',exam_id:'exam-jee',subject_id:'subject-mathematics',language_id:'language-hindi',rate_unit:'HOUR',min_rate_paise:75000,max_rate_paise:75000}).expect(200);assert.deepEqual(jee.body.offers.map((r:{id:string})=>r.id),[maths.id]);assert.equal((await find({exam_id:'exam-jee',max_rate_paise:74999,rate_unit:'HOUR'})).body.offers.length,0);
});
test('price units, strict filters and stable bounded keyset pagination do not mix hourly and lesson prices',async()=>{
 const user=await tutor();const ids=[];for(let i=0;i<3;i++)ids.push((await publishOffer(user,{...offer,title:'Paged Physics offer number '+i})).id);const lesson=await publishOffer(user,{...offer,title:'Per lesson Physics instruction',rate_unit:'LESSON',lesson_minutes:90,rate_paise:50000,trial_kind:'PAID',trial_minutes:30,trial_price_paise:10000});
 for(const invalid of [{limit:25},{limit:0},{limit:'1.5'},{cursor:'invalid'},{unknown:'field'},{subject_id:'exam-jee'},{domain_id:'invalid'},{domain_id:'arts',subject_id:'subject-physics'},{max_rate_paise:50000},{rate_unit:'HOUR',min_rate_paise:60000,max_rate_paise:50000},{min_rate_paise:-1,rate_unit:'HOUR'}])await find(invalid).expect(400);
 await request(app.getHttpServer()).get('/v1/discovery?subject_id=subject-physics&subject_id=subject-mathematics').expect(400);
 const first=(await find({rate_unit:'HOUR',subject_id:'subject-physics',limit:1}).expect(200)).body;const repeated=(await find({rate_unit:'HOUR',subject_id:'subject-physics',limit:1})).body;assert.deepEqual(first,repeated);let cursor=first.next_cursor;const found=[first.offers[0].id];while(cursor){const next=(await find({rate_unit:'HOUR',subject_id:'subject-physics',limit:1,cursor})).body;found.push(...next.offers.map((o:{id:string})=>o.id));cursor=next.next_cursor;}assert.deepEqual(found,ids.sort());assert.equal(new Set(found).size,3);
 const lessons=await find({rate_unit:'LESSON',min_rate_paise:50000,max_rate_paise:50000});assert.deepEqual(lessons.body.offers.map((o:{id:string})=>o.id),[lesson.id]);assert.equal(lessons.body.offers[0].offer.lesson_minutes,90);assert.equal(lessons.body.offers[0].offer.trial_price_paise,10000);
});
test('public details expose controlled evidence labels and offer terms while excluding every private identity/evidence field',async()=>{
 const user=await tutor();const row=await publishOffer(user,{...offer,trial_kind:'FREE',trial_minutes:30});const detail=await get('/v1/discovery/'+row.id).expect(200);assert.equal(detail.body.listing.tutor.display_name,profile.display_name);assert.equal(detail.body.listing.evidence_labels.length,2);assert.ok(detail.body.listing.evidence_labels.every((r:{label:string;expires_at:string})=>r.label.includes('evidence reviewed')&&r.expires_at));assert.equal(detail.headers['cache-control'],'no-store');
 const text=JSON.stringify(detail.body);for(const sensitive of ['birth_date','encrypted_birth_date','email','evidence_id','claim_id','reviewed_by','review_reason','safety_reason','encrypted_payload','token_hash','user_id',user.email,profile.birth_date])assert.ok(!text.includes(sensitive));
 await database.pool.query('UPDATE tutor_profiles SET display_name=$2 WHERE user_id=$1',[user.id,'contact@example.test']);assert.equal((await get('/v1/discovery/'+row.id)).body.listing.tutor.display_name,'Tutor');
 await get('/v1/discovery/'+randomUUID()).expect(404);await get('/v1/discovery/invalid').expect(400);
});
test('paused, suspended, expired, revoked, stale-profile, disabled and inactive-taxonomy offers disappear from search and detail',async()=>{
 const user=await tutor();let row=await publishOffer(user,offer);const invisible=async()=>{assert.equal((await find({subject_id:'subject-physics'})).body.offers.length,0);await get('/v1/discovery/'+row.id).expect(404);await get('/v1/listings/'+row.id).expect(404);};
 row=(await post('/v1/me/listings/'+row.id+'/actions/PAUSE',{revision:row.revision},user.cookie)).body.listing;await invisible();row=(await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie)).body.listing;
 row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'SUSPEND',reason:'Suspend search fixture for safety'},user.reviewer!.cookie)).body.listing;await invisible();row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'LIFT',reason:'Lift search fixture safety restriction'},user.reviewer!.cookie)).body.listing;await invisible();row=(await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie)).body.listing;
 clock=new Date(clock.getTime()+86400000);await invisible();clock=new Date(clock.getTime()-86400000);
 await database.pool.query("UPDATE users SET status='DISABLED' WHERE id=$1",[user.id]);await invisible();await database.pool.query("UPDATE users SET status='ACTIVE' WHERE id=$1",[user.id]);
 await database.pool.query("UPDATE catalogue_terms SET active=false WHERE id='curriculum-cbse'");await invisible();await find({curriculum_id:'curriculum-cbse'}).expect(400);await database.pool.query("UPDATE catalogue_terms SET active=true WHERE id='curriculum-cbse'");
 const claims=(await get('/v1/me/tutor',user.cookie)).body.claims;await post('/v1/staff/tutor-claims/'+claims.find((c:{kind:string})=>c.kind==='QUALIFICATION').id+'/reviews',{outcome:'REVOKE',checked_item:'Qualification approval revoked',reason:'Revoke discovery fixture evidence',adult_identity_confirmed:false},user.reviewer!.cookie).expect(200);await invisible();await post('/v1/me/tutor',profile,user.cookie).expect(200);await invisible();
});
test('representative offers across eight families retain independent exact combinations and honest empty results',async()=>{
 const combinations=[{domain_id:'school',subject_id:'subject-physics',level_id:'level-class-10',curriculum_id:'curriculum-cbse'}, {domain_id:'entrance',subject_id:'subject-physics',level_id:'level-repeater',exam_id:'exam-jee'}, {domain_id:'higher',subject_id:'subject-physics',level_id:'level-undergraduate'}, {domain_id:'competitive',subject_id:'subject-mathematics',level_id:'level-exam-preparation',exam_id:'exam-ssc'}, {domain_id:'professional',subject_id:'subject-accounting',level_id:'level-exam-preparation',exam_id:'exam-ca'}, {domain_id:'career',subject_id:'subject-programming',level_id:'level-beginner'}, {domain_id:'languages',subject_id:'subject-french',level_id:'level-beginner'}, {domain_id:'arts',subject_id:'subject-music',level_id:'level-beginner'}];
 const user=await tutor(true,[...new Set(combinations.map(c=>c.subject_id))]);for(const combination of combinations){const row=await publishOffer(user,{...offer,curriculum_id:undefined,...combination});const result=await find(combination).expect(200);assert.deepEqual(result.body.offers.map((o:{id:string})=>o.id),[row.id]);await get('/v1/discovery/'+row.id).expect(200);}
 assert.equal((await find({domain_id:'arts',subject_id:'subject-drawing'})).body.offers.length,0);
});
test('production discovery excludes fictional scanned evidence and invalid adult eligibility never releases a public offer',async()=>{
 const user=await tutor();const row=await publishOffer(user,offer);
 const production=loadConfig({...productionPrivacyFixture(),NODE_ENV:'production',DATABASE_URL:config.databaseUrl,AUTH_SECRET:config.authSecret,WEB_ORIGIN:'https://example.test',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',SMTP_FROM:'fixture@example.test'});const appProduction=await createApplication(production,database,now);
 try{const search=await request(appProduction.getHttpServer()).get('/v1/discovery').expect(200);assert.equal(search.body.offers.length,0);await request(appProduction.getHttpServer()).get('/v1/discovery/'+row.id).expect(404);}finally{await appProduction.close();}
 await database.pool.query('UPDATE tutor_profiles SET encrypted_birth_date=$2 WHERE user_id=$1',[user.id,encrypt({birth_date:'2020-01-01'},config.authSecret)]);assert.equal((await find()).body.offers.length,0);await get('/v1/discovery/'+row.id).expect(404);await get('/v1/listings/'+row.id).expect(404);
});
