import { completeFixtureOffer, publishProfileFixture, isolatePublicationFixture, fixtureBiography, fixtureTitle, fixtureDescription, saveTutorIntroduction, fixtureClaims, publicationFixtures, ensurePublicationPhoto } from "./helpers/publication.js";
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
beforeEach(async () => {clock=new Date(clock.getTime()+20*60_000);
 await isolatePublicationFixture(database);
});
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
const profile={display_name:'Fictional Tutor',biography:fixtureBiography,birth_date:'1990-01-01',adult_confirmed:true};
const offer={title:fixtureTitle,description:fixtureDescription,domain_id:'school',subject_id:'subject-physics',level_id:'level-class-10',curriculum_id:'curriculum-cbse',language_ids:['language-english'],currency:'INR',teaching_mode:'ONLINE',rate_paise:50000,rate_unit:'HOUR',trial_kind:'NONE'};
async function tutor(approved=true,subjects=['subject-physics'],withPortrait=true){
 const user=await fixture(null);await post('/v1/me/roles',{roles:['TUTOR']},user.cookie).expect(200);await saveTutorIntroduction(post, user, profile, subjects);if(withPortrait)await ensurePublicationPhoto(post,get,user);
 if(approved){const reviewer=await fixture(['TRUST']);const mfa=await enroll(reviewer.cookie);for(const [kind,subjectId] of [['IDENTITY',''],...subjects.map(subject=>['QUALIFICATION',subject])]){const file=(await post('/v1/me/tutor/evidence',{media_type:'application/pdf',data:Buffer.from('%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n').toString('base64')},user.cookie).expect(201)).body.evidence.id;await post('/v1/me/tutor/claims',{kind,description:'Fictional evidence for '+kind,evidence_id:file,...(kind==='IDENTITY'?{}:{subject_id:subjectId})},user.cookie).expect(201);}await post('/v1/me/tutor/submissions',{},user.cookie).expect(200);const claims = await fixtureClaims(get, user.cookie);for(const claim of claims)await post('/v1/staff/tutor-claims/'+claim.id+'/reviews',{outcome:'APPROVE',checked_item:'Fictional document and claim checked',reason:'Approve fictional Tutor evidence',adult_identity_confirmed:true,expires_at:new Date(clock.getTime()+86400000).toISOString()},mfa.cookie).expect(200);await grantTutorProFixture(database,config,user.email,clock);await publishProfileFixture(post, get, user); return { ...user, reviewer: mfa };}
 return {...user,reviewer:undefined};
}
const { draft, submitted, publish, publishOffer } = publicationFixtures(post, offer, () => database, get);


test('new offer eligibility follows active declared Subjects independently of optional evidence, including a Commerce-only Tutor',async()=>{

 const user=await tutor(true,['subject-commerce']);
 assert.equal((await get('/v1/me/tutor',user.cookie)).body.profile.eligible,true);
 const state=(await get('/v1/me/listings',user.cookie).expect(200)).body;
 assert.deepEqual(state.eligible_subject_ids,['subject-commerce']);assert.deepEqual(state.listings,[]);
 await post('/v1/me/listings',offer,user.cookie).expect(403);
 await post('/v1/me/listings',completeFixtureOffer({...offer,title:'Commerce explained through examples',subject_id:'subject-commerce'}),user.cookie).expect(201);
 await database.pool.query("UPDATE tutor_claims SET expires_at=$2 WHERE user_id=$1 AND subject_id='subject-commerce'",[user.id,clock]);
 // Subject declarations are independent of optional qualification approvals.
 assert.deepEqual((await get('/v1/me/listings',user.cookie).expect(200)).body.eligible_subject_ids,['subject-commerce']);
 await database.pool.query("UPDATE tutor_claims SET expires_at=$2 WHERE user_id=$1 AND subject_id='subject-commerce'",[user.id,new Date(clock.getTime()+86400000)]);
 assert.deepEqual((await get('/v1/me/listings',user.cookie)).body.eligible_subject_ids,['subject-commerce']);
 await database.pool.query("UPDATE catalogue_terms SET active=false WHERE id='subject-commerce'");
 assert.deepEqual((await get('/v1/me/listings',user.cookie).expect(200)).body.eligible_subject_ids,[]);
 await database.pool.query("UPDATE catalogue_terms SET active=true WHERE id='subject-commerce'");
 const current=(await get('/v1/me/tutor',user.cookie)).body.profile;
 await post('/v1/me/tutor/introduction',{display_name:profile.display_name,biography:fixtureBiography,subject_ids:['subject-mathematics'],hourly_rate_paise:50000,identity_country:'IN',identity_document:'AADHAAR',adult_confirmed:true,public_email_consent:false,expected_public_revision:current.public_revision},user.cookie).expect(200);
 const revised=(await get('/v1/me/listings',user.cookie).expect(200)).body;assert.deepEqual(revised.eligible_subject_ids,['subject-mathematics']);assert.equal(revised.listings.length,1);
 await post('/v1/me/listings',{...offer,subject_id:'subject-commerce'},user.cookie).expect(403);

});
test('offers require an adult Tutor role and declared Subjects with strict taxonomy, rates, durations and contact-free text',async()=>{
 const user=await tutor();const pending=await tutor(false);await post('/v1/me/listings',offer).expect(401);
 const noTutor=await fixture(null);await post('/v1/me/listings',offer,noTutor.cookie).expect(403);
 const free=await publish(pending);assert.equal(free.identity_verified,false);

 for(const change of [{owner_id:user.id},{currency:'USD'},{rate_paise:1},{rate_paise:100.1},{teaching_mode:'IN_PERSON'},{language_ids:['language-english','language-english']},{curriculum_id:undefined},{domain_id:'career'},{subject_id:'exam-jee'},{rate_unit:'LESSON'},{trial_kind:'FREE'},{trial_price_paise:500},{title:'Contact tutor@example.test'},{description:'Contact me at https://example.test for private tutoring lessons.'},{curriculum_id:'curriculum-isc',level_id:'level-class-10'}])await post('/v1/me/listings',{...offer,...change},user.cookie).expect(change.subject_id==='exam-jee'?403:change.teaching_mode==='IN_PERSON'?409:400);
 await post('/v1/me/listings',{...offer,domain_id:'entrance',subject_id:'subject-mathematics',level_id:'level-repeater',curriculum_id:undefined,exam_id:'exam-neet'},user.cookie).expect(400);
 await post('/v1/me/listings',{...offer,subject_id:'subject-mathematics'},user.cookie).expect(403);
 await post('/v1/me/listings',{...offer,rate_unit:'LESSON',lesson_minutes:60,trial_kind:'PAID',trial_minutes:30,trial_price_paise:10000},user.cookie).expect(201);
});
test('direct publication, optimistic live edits, public privacy and pause/resume content boundaries are enforced',async()=>{

 const user=await tutor();let row=await draft(user);
 await get('/v1/listings/'+row.id).expect(404);
 await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(409);
 const previous=row.revision;
 row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;
 assert.equal(row.status,'PUBLISHED');assert.equal(row.eligible,true);assert.equal(row.reviewed_by,null);assert.equal(row.publication_policy,'direct-ads-v1');
 await post('/v1/me/listings/'+row.id,{revision:previous,offer},user.cookie).expect(409);
 await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Direct ads do not fabricate review decisions'},user.reviewer!.cookie).expect(409);
 const response=await get('/v1/listings/'+row.id).expect(200);assert.equal(response.body.listing.rate_paise,50000);for(const key of ['user_id','birth_date','evidence','reviewed_by','safety_reason','email'])assert.equal(response.body.listing[key],undefined);
 row=(await post('/v1/me/listings/'+row.id+'/actions/PAUSE',{revision:row.revision},user.cookie).expect(200)).body.listing;await get('/v1/listings/'+row.id).expect(404);
 row=(await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(200)).body.listing;await get('/v1/listings/'+row.id).expect(200);
 const old=row.revision;const revised=completeFixtureOffer({...offer,title:'Corrected Physics teaching offer',rate_paise:60000});
 row=(await post('/v1/me/listings/'+row.id,{revision:old,offer:revised},user.cookie).expect(200)).body.listing;
 assert.equal(row.status,'PUBLISHED');
 const live=(await get('/v1/listings/'+row.id).expect(200)).body.listing;assert.equal(live.title,revised.title);assert.equal(live.rate_paise,60000);
 await post('/v1/me/listings/'+row.id,{revision:old,offer},user.cookie).expect(409);
 await post('/v1/staff/listings/'+row.id+'/reviews',{revision:old,outcome:'APPROVE',reason:'Stale previous approval attempt'},user.reviewer!.cookie).expect(409);
 // Paused edits must not bypass the same publication content rules on resume.
 row=(await post('/v1/me/listings/'+row.id+'/actions/PAUSE',{revision:row.revision},user.cookie).expect(200)).body.listing;
 row=(await post('/v1/me/listings/'+row.id,{revision:row.revision,offer:{...offer,title:'Short private draft title'}},user.cookie).expect(200)).body.listing;
 await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(400);

});
test('foreign owners, missing/scoped MFA and self review cannot change offers',async()=>{
 const user=await tutor();const row=await submitted(user);const other=await tutor(false);await post('/v1/me/listings/'+row.id,{revision:row.revision,offer},other.cookie).expect(404);await post('/v1/me/listings/'+row.id+'/actions/PAUSE',{revision:row.revision},other.cookie).expect(404);
 const support=await fixture(['SUPPORT']);const supportMfa=await enroll(support.cookie);await get('/v1/staff/listings',supportMfa.cookie).expect(403);await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Unauthorized staff review attempt'},supportMfa.cookie).expect(403);
 await post('/v1/staff/listings/'+row.id+'/inspections',{reason:'Missing staff session attempt'},user.cookie).expect(403);await assignStaff(database,user.email,['TRUST'],'Check self review restrictions','test operator');const self=await enroll(user.cookie);await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Self publication attempt forbidden'},self.cookie).expect(403);
});
test('safety suspension survives owner edits and only Trust staff can lift it without auto publication',async()=>{
 const user=await tutor();let row=await publish(user);row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'SUSPEND',reason:'Restrict fictional offer for safety review'},user.reviewer!.cookie).expect(200)).body.listing;assert.equal(row.status,'SAFETY_SUSPENDED');await get('/v1/listings/'+row.id).expect(404);await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(409);
 row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'LIFT',reason:'Safety investigation allows availability decision'},user.reviewer!.cookie).expect(200)).body.listing;assert.equal(row.status,'PAUSED');await get('/v1/listings/'+row.id).expect(404);row=(await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(200)).body.listing;
 row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'SUSPEND',reason:'Repeat fictional safety restriction'},user.reviewer!.cookie).expect(200)).body.listing;row=(await post('/v1/me/listings/'+row.id,{revision:row.revision,offer:completeFixtureOffer({...offer,title:'Edited while safety suspended'})},user.cookie).expect(200)).body.listing;assert.equal(row.status,'SAFETY_SUSPENDED');await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(409);
 row=(await post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'LIFT',reason:'Allow corrected draft to be reviewed'},user.reviewer!.cookie).expect(200)).body.listing;assert.equal(row.status,'PAUSED');await get('/v1/listings/'+row.id).expect(404);row=(await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(200)).body.listing;await get('/v1/listings/'+row.id).expect(200);
});
test('optional evidence does not control free publication while safety holds, inactive taxonomy and disabled accounts block availability',async()=>{

 const user=await tutor();const row=await publish(user);
 await database.pool.query("UPDATE catalogue_terms SET active=false WHERE id='curriculum-cbse'");await get('/v1/listings/'+row.id).expect(404);await database.pool.query("UPDATE catalogue_terms SET active=true WHERE id='curriculum-cbse'");await get('/v1/listings/'+row.id).expect(200);
 clock=new Date(clock.getTime()+86400000);
 assert.equal((await get('/v1/me/tutor',user.cookie).expect(200)).body.profile.identity_verified,false);
 await get('/v1/listings/'+row.id).expect(200);
 clock=new Date(clock.getTime()-86400000);
 await database.pool.query("UPDATE users SET status='DISABLED' WHERE id=$1",[user.id]);await get('/v1/listings/'+row.id).expect(404);await database.pool.query("UPDATE users SET status='ACTIVE' WHERE id=$1",[user.id]);
 const claims=(await get('/v1/me/tutor',user.cookie)).body.claims;
 await post('/v1/staff/tutor-claims/'+claims.find((c:{kind:string})=>c.kind==='QUALIFICATION').id+'/reviews',{outcome:'REVOKE',checked_item:'Qualification approval revoked',reason:'Revoke fictional Physics evidence',adult_identity_confirmed:false},user.reviewer!.cookie).expect(200);
 await get('/v1/listings/'+row.id).expect(200);
 await post('/v1/staff/tutors/'+user.id+'/publication-restrictions',{action:'SUSPEND',reason:'Restrict public supply during an actual safety investigation'},user.reviewer!.cookie).expect(200);
 await get('/v1/listings/'+row.id).expect(404);
 await post('/v1/me/listings/'+row.id+'/actions/PUBLISH',{revision:row.revision},user.cookie).expect(403);
 await post('/v1/staff/tutors/'+user.id+'/publication-restrictions',{action:'LIFT',reason:'Lift recorded public safety restriction'},user.reviewer!.cookie).expect(200);
 await get('/v1/listings/'+row.id).expect(404);
 await publishProfileFixture(post,get,user);await get('/v1/listings/'+row.id).expect(200);

});
test('concurrent content edit and staff safety restriction permit one revision transition and never stale publication',async()=>{

 const user=await tutor();const row=await publish(user);
 const results=await Promise.all([
  post('/v1/me/listings/'+row.id,{revision:row.revision,offer:completeFixtureOffer({...offer,title:'Concurrently revised Physics offer'})},user.cookie),
  post('/v1/staff/listings/'+row.id+'/safety',{revision:row.revision,action:'SUSPEND',reason:'Concurrent original offer safety restriction'},user.reviewer!.cookie)
 ]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const own=(await get('/v1/me/listings',user.cookie)).body.listings[0];
 assert.equal(own.revision,row.revision+1);
 const publicResponse=await get('/v1/listings/'+row.id);assert.equal(publicResponse.status,own.status==='PUBLISHED'?200:404);

});


test('all eight Learning Domains can publish explicit offers without crossing subject and exam claims',async()=>{
 const combinations=[{domain_id:'school',subject_id:'subject-physics',level_id:'level-class-10',curriculum_id:'curriculum-cbse'}, {domain_id:'entrance',subject_id:'subject-physics',level_id:'level-repeater',exam_id:'exam-jee'}, {domain_id:'higher',subject_id:'subject-physics',level_id:'level-undergraduate'}, {domain_id:'competitive',subject_id:'subject-mathematics',level_id:'level-exam-preparation',exam_id:'exam-ssc'}, {domain_id:'professional',subject_id:'subject-accounting',level_id:'level-exam-preparation',exam_id:'exam-ca'}, {domain_id:'career',subject_id:'subject-programming',level_id:'level-beginner'}, {domain_id:'languages',subject_id:'subject-french',level_id:'level-beginner'}, {domain_id:'arts',subject_id:'subject-music',level_id:'level-beginner'}];
 const user=await tutor(true,[...new Set(combinations.map(c=>c.subject_id))]);
 for(const combination of combinations){const row=await publishOffer(user,{...offer,curriculum_id:undefined,...combination});const publicOffer=await get('/v1/listings/'+row.id).expect(200);assert.equal(publicOffer.body.listing.subject_id,combination.subject_id);assert.equal(publicOffer.body.listing.exam_id,combination.exam_id);}
});


test('photo-less drafts and short descriptions stay private until an explicit publish with a clean portrait',async()=>{
 const user=await tutor(false,['subject-physics'],false);
 const state=(await get('/v1/me/tutor',user.cookie)).body.profile;
 await post('/v1/me/tutor/introduction',{display_name:profile.display_name,biography:'Patient teaching.',subject_ids:['subject-physics'],hourly_rate_paise:50000,identity_country:'IN',identity_document:'AADHAAR',adult_confirmed:true,public_email_consent:false,expected_public_revision:state.public_revision},user.cookie).expect(200);
 const row=(await post('/v1/me/listings',{...offer,description:'Short.'},user.cookie).expect(201)).body.listing;
 for(const action of ['PUBLISH','SUBMIT']){
  const result=await post('/v1/me/listings/'+row.id+'/actions/'+action,{revision:row.revision},user.cookie).expect(409);
  assert.equal(result.body.code,'PHOTO_REQUIRED');
 }
 assert.equal((await get('/v1/me/tutor',user.cookie)).body.profile.publication_status,'DRAFT');
 await get('/v1/listings/'+row.id).expect(404);
 const photo=await ensurePublicationPhoto(post,get,user);assert.equal(photo.status,'PENDING');assert.equal(photo.self_published,true);assert.equal(photo.scan_status,'CLEAN');
 assert.equal((await get('/v1/me/listings',user.cookie)).body.listings[0].status,'DRAFT');
 assert.equal((await get('/v1/me/tutor',user.cookie)).body.profile.publication_status,'DRAFT');
 const live=(await post('/v1/me/listings/'+row.id+'/actions/PUBLISH',{revision:row.revision},user.cookie).expect(200)).body.listing;
 assert.equal(live.status,'PUBLISHED');assert.equal(live.identity_verified,false);
 await post('/v1/me/listings',{...offer,description:'   '},user.cookie).expect(400);
});

test('existing online ads remain live and editable without a portrait while resume still requires one',async()=>{
 const user=await tutor(false);let row=await publish(user);
 const photo=(await get('/v1/me/tutor/photo',user.cookie)).body.photo;
 await del('/v1/me/tutor/photo/'+photo.id,user.cookie).expect(204);
 await get('/v1/listings/'+row.id).expect(200);
 row=(await post('/v1/me/listings/'+row.id,{revision:row.revision,offer:{...offer,description:'Revised.',rate_paise:55000}},user.cookie).expect(200)).body.listing;
 assert.equal(row.status,'PUBLISHED');assert.equal(row.eligible,true);
 row=(await post('/v1/me/listings/'+row.id+'/actions/PAUSE',{revision:row.revision},user.cookie).expect(200)).body.listing;
 const refused=await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(409);assert.equal(refused.body.code,'PHOTO_REQUIRED');
 assert.equal((await get('/v1/me/listings',user.cookie)).body.listings[0].status,'PAUSED');
 await post('/v1/me/listings/'+row.id+'/actions/ARCHIVE',{revision:row.revision},user.cookie).expect(200);
 assert.deepEqual((await get('/v1/me/listings',user.cookie)).body.listings,[]);await get('/v1/listings/'+row.id).expect(404);
 await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision+1},user.cookie).expect(404);
});

test('legacy review publication requires the same portrait and title boundary as owner publication',async()=>{
 const user=await tutor(false,['subject-physics'],false);await publishProfileFixture(post,get,user);
 const reviewer=await fixture(['TRUST']),mfa=await enroll(reviewer.cookie);
 let row=await draft(user);await database.pool.query("UPDATE teaching_listings SET status='REVIEW' WHERE id=$1",[row.id]);
 const result=await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Review retained fictional legacy submission'},mfa.cookie).expect(409);assert.equal(result.body.code,'PHOTO_REQUIRED');
 await ensurePublicationPhoto(post,get,user);
 row=(await post('/v1/me/listings/'+row.id,{revision:row.revision,offer:{...offer,title:'Short private draft title'}},user.cookie).expect(200)).body.listing;
 const invalid=await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Reject short historical review content'},mfa.cookie).expect(400);assert.equal(invalid.body.code,'VALIDATION_ERROR');
});

test('legacy profile upgrade preserves encrypted birth date, public ID, creation time and an existing live ad',async()=>{
 const user=await tutor(true);
 // Synthetic pre-unified history in this isolated database; actual reviews above used the normal API.
 await database.pool.query("UPDATE tutor_profiles SET onboarding_version=1,encrypted_birth_date=$2 WHERE user_id=$1",[user.id,encrypt({birth_date:'1990-01-01'},config.authSecret)]);
 const before=(await database.pool.query('SELECT * FROM tutor_profiles WHERE user_id=$1',[user.id])).rows[0];
 const id=randomUUID();const legacyOffer={...offer,title:'Legacy Physics teaching offer',description:'Legacy description.'};
 await database.pool.query("INSERT INTO teaching_listings(id,user_id,payload,profile_revision,status,approved,publication_policy,created_at,updated_at) VALUES($1,$2,$3,$4,'PUBLISHED',true,'review-v1',$5,$5)",[id,user.id,legacyOffer,before.revision,clock]);
 await get('/v1/listings/'+id).expect(200);
 await post('/v1/me/tutor/introduction',{display_name:profile.display_name,biography:'Updated teaching.',subject_ids:['subject-physics'],hourly_rate_paise:50000,identity_country:'IN',identity_document:'AADHAAR',adult_confirmed:true,public_email_consent:false,expected_public_revision:before.public_revision},user.cookie).expect(200);
 const after=(await database.pool.query('SELECT * FROM tutor_profiles WHERE user_id=$1',[user.id])).rows[0];assert.equal(after.onboarding_version,2);assert.deepEqual(after.encrypted_birth_date,before.encrypted_birth_date);assert.equal(after.public_id,before.public_id);assert.deepEqual(after.created_at,before.created_at);assert.equal(after.publication_status,'PUBLISHED');
 await get('/v1/listings/'+id).expect(200);
 let row=(await get('/v1/me/listings',user.cookie)).body.listings.find((item:{id:string})=>item.id===id);
 row=(await post('/v1/me/listings/'+id+'/actions/PAUSE',{revision:row.revision},user.cookie).expect(200)).body.listing;
 row=(await post('/v1/me/listings/'+id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(200)).body.listing;
 row=(await post('/v1/me/listings/'+id+'/actions/PAUSE',{revision:row.revision},user.cookie).expect(200)).body.listing;
 row=(await post('/v1/me/listings/'+id,{revision:row.revision,offer:legacyOffer},user.cookie).expect(200)).body.listing;
 await post('/v1/me/listings/'+id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(400);
});
