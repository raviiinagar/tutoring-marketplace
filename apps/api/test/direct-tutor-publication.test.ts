import {ensurePublicationPhoto} from "./helpers/publication.js";
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {join,resolve} from 'node:path';
import {mkdir,readdir,copyFile} from 'node:fs/promises';
import sharp from 'sharp';
import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {createApplication} from '../src/app.js';
import {loadConfig,type Config} from '../src/config.js';
import {Database,migrate} from '../src/database.js';
import {decrypt,encrypt} from '../src/security.js';
import {assignStaff} from '../src/staff.js';
import {totp} from '../src/totp.js';
import {grantContactFixture} from '../../../scripts/contact-request-fixture.js';
import {grantTutorProFixture} from '../../../scripts/tutor-pro-fixture.js';
// @ts-expect-error Existing isolated PostgreSQL helper.
import {startDatabase} from '../../../scripts/postgres.mjs';
let app:INestApplication,db:Database,config:Config,cluster:Awaited<ReturnType<typeof startDatabase>>;
let clock=new Date();const now=()=>clock,origin='http://localhost:3000',password='Fictional-direct-ad-password-321!';
const post=(path:string,body:unknown,cookie?:string)=>{const r=request(app.getHttpServer()).post(path).set('Origin',origin).send(body);return cookie?r.set('Cookie',cookie):r;};
const get=(path:string,cookie?:string)=>{const r=request(app.getHttpServer()).get(path);return cookie?r.set('Cookie',cookie):r;};
const biography='I teach patient and practical lessons with worked examples and guided exercises. My experience includes helping learners develop confidence and understand difficult ideas. We discuss your goals together and adapt the pace to your needs with regular feedback and clear explanations.';
const offer={title:'Learn school Physics with patient explanations worked examples and guided practice together',description:biography,domain_id:'school',subject_id:'subject-physics',level_id:'level-class-10',curriculum_id:'curriculum-cbse',language_ids:['language-english'],currency:'INR',teaching_mode:'ONLINE',rate_paise:50000,rate_unit:'HOUR',trial_kind:'NONE'};
const legacy:Record<string,{id:string;public_id:string}>={};
before(async()=>{
 const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
 const dir=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/direct_ads_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(dir,'mail'),EVIDENCE_SCANNER:'test'});
 cluster=await startDatabase(config.databaseUrl,join(dir,'postgres'));db=new Database(config.databaseUrl);
 const old=join(dir,'migrations');await mkdir(old,{recursive:true});for(const name of await readdir('apps/api/migrations'))if(name.endsWith('.sql')&&Number(name.slice(0,3))<38)await copyFile(join('apps/api/migrations',name),join(old,name));await migrate(db,{directory:old});
 for(const status of ['APPROVED','APPROVED_TEST','DRAFT','REVOKED','CHANGES_REQUESTED']){
  const identityStatus=status==='APPROVED_TEST'?'APPROVED':status;
  const id=randomUUID();await db.pool.query("INSERT INTO users(id,email,display_name,password_hash,status,email_verified_at,roles,created_at) VALUES($1,$2,'Legacy fictional Tutor','unused-fixture','ACTIVE',$3,ARRAY['TUTOR'],$3)",[id,id+'@example.test',clock]);
  const p=(await db.pool.query("INSERT INTO tutor_profiles(user_id,display_name,biography,encrypted_birth_date,status,onboarding_version,subject_ids,hourly_rate_paise) VALUES($1,'Legacy fictional Tutor',$2,$3,$4,2,ARRAY['subject-physics'],50000) RETURNING public_id",[id,biography,encrypt({birth_date:null},config.authSecret),identityStatus])).rows[0];legacy[status]={id,public_id:p.public_id};
  if(status!=='DRAFT'){
   // Isolated synthetic records represent both a prior production-eligible
   // decision and a test-only decision; neither is a real identity document.
   const evidence=randomUUID();await db.pool.query("INSERT INTO tutor_evidence(id,user_id,media_type,byte_length,scan_status,test_only,encrypted_payload,created_at) VALUES($1,$2,'application/pdf',100,'CLEAN',$3,$4,$5)",[evidence,id,status==='APPROVED_TEST',encrypt({data:'fictional'},config.authSecret),clock]);
   await db.pool.query("INSERT INTO tutor_claims(id,user_id,profile_revision,kind,description,evidence_id,status,adult_identity_confirmed,expires_at) VALUES($1,$2,1,'IDENTITY','Fictional prior identity decision',$3,$4,$5,$6)",[randomUUID(),id,evidence,identityStatus==='APPROVED'?'APPROVED':status==='REVOKED'?'REVOKED':'REJECTED',identityStatus==='APPROVED',new Date(clock.getTime()+365*86400000)]);
  }
 }
 await migrate(db);app=await createApplication(config,db,now);
});
beforeEach(()=>{clock=new Date(clock.getTime()+2*3600000);});
after(async()=>{await app?.close();await db?.close();await cluster?.stop();});
async function account(tutor=true){const email=randomUUID()+'@example.test';await post('/v1/auth/registrations',{display_name:'Fictional adult',email,password}).expect(202);const mail=(await db.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0];await post('/v1/auth/verifications',{token:new URL(decrypt<{verification_url:string}>(mail.encrypted_payload,config.authSecret).verification_url).hash.slice(7)}).expect(200);const login=await post('/v1/auth/sessions',{email,password}).expect(200);const a={id:login.body.user.id as string,email,cookie:login.headers['set-cookie'][0] as string};if(tutor)await post('/v1/me/roles',{roles:['TUTOR']},a.cookie).expect(200);return a;}
async function staff(){const a=await account(false);await assignStaff(db,a.email,['TRUST'],'Fictional direct-publication reviewer','test');const enrollment=await post('/v1/staff/mfa/enrollments',{password},a.cookie).expect(200);const confirmation=await post('/v1/staff/mfa/confirmations',{code:totp(enrollment.body.secret,clock)},a.cookie).expect(200);return {...a,cookie:a.cookie.split(';')[0]+'; '+confirmation.headers['set-cookie'][0].split(';')[0]};}
async function intro(a:{cookie:string},extra:Record<string,unknown>={}){const profile=(await post('/v1/me/tutor/introduction',{display_name:'Fictional Physics Tutor',biography,subject_ids:['subject-physics'],hourly_rate_paise:50000,identity_country:'IN',identity_document:'AADHAAR',adult_confirmed:true,public_email_consent:false,replace_identity:false,...extra},a.cookie).expect(200)).body.profile;await ensurePublicationPhoto(post,get,a);return profile;}
async function online(a:{cookie:string}){const profile=await intro(a);const draft=(await post('/v1/me/listings',offer,a.cookie).expect(201)).body.listing;const listing=(await post('/v1/me/listings/'+draft.id+'/actions/PUBLISH',{revision:draft.revision},a.cookie).expect(200)).body.listing;return {profile,listing};}
test('migration preserves prior eligible publication but never exposes private or adverse historical cases',async()=>{
 const rows=(await db.pool.query('SELECT user_id,publication_status,publication_restricted,adult_declared_at,status FROM tutor_profiles WHERE user_id=ANY($1::uuid[])',[Object.values(legacy).map(x=>x.id)])).rows;
 for(const [status,a] of Object.entries(legacy)){const p=rows.find(r=>r.user_id===a.id);assert.equal(p.publication_status,status==='APPROVED'?'PUBLISHED':'DRAFT');assert.equal(p.publication_restricted,['REVOKED','CHANGES_REQUESTED'].includes(status));assert.equal(p.status,status==='APPROVED_TEST'?'APPROVED':status);await get('/v1/tutor-profiles/'+a.public_id).expect(status==='APPROVED'?200:404);}
});
test('explicit free ad publication works without identity or Pro, while drafts and identity facts stay truthful',async()=>{
 const a=await account(),p=await intro(a);assert.equal(p.status,'DRAFT');assert.equal(p.publication_status,'DRAFT');assert.equal(p.identity_verified,false);await get('/v1/tutor-profiles/'+p.public_id).expect(404);
 const own=(await get('/v1/me/listings',a.cookie).expect(200)).body;assert.equal(own.publication_policy,'direct-ads-v1');assert.equal(own.identity_optional,true);assert.equal(own.free_publication,true);assert.deepEqual(own.eligible_subject_ids,['subject-physics']);assert.equal(own.tutor_pro_active,false);
 let l=(await post('/v1/me/listings',offer,a.cookie).expect(201)).body.listing;await get('/v1/listings/'+l.id).expect(404);l=(await post('/v1/me/listings/'+l.id+'/actions/PUBLISH',{revision:l.revision},a.cookie).expect(200)).body.listing;assert.equal(l.status,'PUBLISHED');assert.equal(l.eligible,true);assert.equal(l.identity_verified,false);
 const publicProfile=(await get('/v1/tutor-profiles/'+p.public_id).expect(200)).body.profile;assert.equal(publicProfile.identity_label,'Identity not verified');assert.equal(publicProfile.contact,null);
 const discovery=(await get('/v1/discovery/'+l.id).expect(200)).body.listing;assert.equal(discovery.identity_verified,false);assert.deepEqual(discovery.evidence_labels,[]);
 const current=(await get('/v1/me/tutor',a.cookie).expect(200)).body;assert.equal(current.profile.status,'DRAFT');assert.equal(current.profile.publication_status,'PUBLISHED');assert.equal(current.claims.length,0);assert.equal((await db.pool.query('SELECT count(*)::int n FROM tutor_pro_grants WHERE payer_id=$1',[a.id])).rows[0].n,0);
 const progression=(await get('/v1/me/tutor/progression',a.cookie).expect(200)).body;assert.equal(progression.level,'NEW');
 const paused=(await post('/v1/me/tutor/publication',{expected_public_revision:current.profile.public_revision,action:'PAUSE'},a.cookie).expect(200)).body.profile;
 l=(await post('/v1/me/listings/'+l.id,{revision:l.revision,offer:{...offer,rate_paise:60000}},a.cookie).expect(200)).body.listing;assert.equal(l.eligible,false);assert.equal((await get('/v1/me/tutor',a.cookie).expect(200)).body.profile.publication_status,'PAUSED');await get('/v1/tutor-profiles/'+p.public_id).expect(404);
 await post('/v1/me/tutor/publication',{expected_public_revision:paused.public_revision,action:'PUBLISH'},a.cookie).expect(200);await get('/v1/discovery/'+l.id).expect(200);
});
test('new publication validates words, live edits are immediate, revisions and soft archive protect history',async()=>{
 const a=await account();await intro(a);let short=(await post('/v1/me/listings',{...offer,title:'Short private draft title'},a.cookie).expect(201)).body.listing;await post('/v1/me/listings/'+short.id+'/actions/PUBLISH',{revision:short.revision},a.cookie).expect(400);
 short=(await post('/v1/me/listings/'+short.id,{revision:short.revision,offer},a.cookie).expect(200)).body.listing;let l=(await post('/v1/me/listings/'+short.id+'/actions/PUBLISH',{revision:short.revision},a.cookie).expect(200)).body.listing;
 await post('/v1/me/listings/'+l.id,{revision:l.revision,offer:{...offer,description:'   '}},a.cookie).expect(400);
 const changed={...offer,title:'Study school Physics with patient explanations practical examples and guided practice together'};const previous=l.revision;l=(await post('/v1/me/listings/'+l.id,{revision:l.revision,offer:changed},a.cookie).expect(200)).body.listing;assert.equal(l.status,'PUBLISHED');assert.equal((await get('/v1/discovery/'+l.id).expect(200)).body.listing.offer.title,changed.title);
 await post('/v1/me/listings/'+l.id+'/actions/PAUSE',{revision:previous},a.cookie).expect(409);l=(await post('/v1/me/listings/'+l.id+'/actions/PAUSE',{revision:l.revision},a.cookie).expect(200)).body.listing;await get('/v1/discovery/'+l.id).expect(404);l=(await post('/v1/me/listings/'+l.id+'/actions/RESUME',{revision:l.revision},a.cookie).expect(200)).body.listing;
 await post('/v1/me/listings/'+l.id+'/actions/ARCHIVE',{revision:l.revision},a.cookie).expect(200);await get('/v1/discovery/'+l.id).expect(404);assert.ok((await db.pool.query('SELECT archived_at FROM teaching_listings WHERE id=$1',[l.id])).rows[0].archived_at);assert.equal((await get('/v1/me/listings',a.cookie).expect(200)).body.listings.some((r:{id:string})=>r.id===l.id),false);await post('/v1/me/listings/'+l.id+'/actions/RESUME',{revision:l.revision+1},a.cookie).expect(404);
});
test('optional pending identity does not pause free ads; audited staff restrictions cannot be bypassed',async()=>{
 const a=await account(),reviewer=await staff();let {listing:l,profile:p}=await online(a);const identity=(await post('/v1/me/tutor/identity',{media_type:'application/pdf',data:Buffer.from('%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n').toString('base64')},a.cookie).expect(200)).body;assert.equal(identity.profile.status,'SUBMITTED');assert.equal(identity.profile.publication_status,'PUBLISHED');await get('/v1/discovery/'+l.id).expect(200);
 l=(await post('/v1/staff/listings/'+l.id+'/safety',{revision:l.revision,action:'SUSPEND',reason:'Fictional ad safety case requires review'},reviewer.cookie).expect(200)).body.listing;await get('/v1/discovery/'+l.id).expect(404);await post('/v1/me/listings/'+l.id+'/actions/PUBLISH',{revision:l.revision},a.cookie).expect(409);
 l=(await post('/v1/staff/listings/'+l.id+'/safety',{revision:l.revision,action:'LIFT',reason:'Fictional safety review completed and lifted'},reviewer.cookie).expect(200)).body.listing;await get('/v1/discovery/'+l.id).expect(404);l=(await post('/v1/me/listings/'+l.id+'/actions/RESUME',{revision:l.revision},a.cookie).expect(200)).body.listing;
 await post('/v1/staff/tutors/'+a.id+'/publication-restrictions',{action:'SUSPEND',reason:'Fictional publication safety hold'},reviewer.cookie).expect(200);const held=(await get('/v1/me/tutor',a.cookie).expect(200)).body.profile;await get('/v1/tutor-profiles/'+p.public_id).expect(404);await post('/v1/me/tutor/publication',{expected_public_revision:held.public_revision,action:'PUBLISH'},a.cookie).expect(403);
 await post('/v1/staff/tutors/'+a.id+'/publication-restrictions',{action:'LIFT',reason:'Fictional publication hold reviewed and cleared'},reviewer.cookie).expect(200);await get('/v1/tutor-profiles/'+p.public_id).expect(404);const lifted=(await get('/v1/me/tutor',a.cookie).expect(200)).body.profile;await post('/v1/me/tutor/publication',{expected_public_revision:lifted.public_revision,action:'PUBLISH'},a.cookie).expect(200);await get('/v1/discovery/'+l.id).expect(200);
});
test('clean consented portrait publishes without fabricated staff approval and staff rejection hides it',async()=>{
 const a=await account(),reviewer=await staff();const {profile:p}=await online(a);const data=await sharp({create:{width:320,height:400,channels:3,background:'#eddc93'}}).withMetadata({exif:{IFD0:{ImageDescription:'FICTIONAL-TUTOR-EVIDENCE'}}}).jpeg().toBuffer();
 const photo=(await post('/v1/me/tutor/photo',{media_type:'image/jpeg',data:data.toString('base64'),public_consent:true},a.cookie).expect(201)).body.photo;assert.equal(photo.status,'PENDING');assert.equal(photo.self_published,true);let publicProfile=(await get('/v1/tutor-profiles/'+p.public_id).expect(200)).body.profile;assert.ok(publicProfile.photo_url);await get(publicProfile.photo_url).expect(200);
 await post('/v1/staff/tutor-photos/'+photo.id+'/reviews',{outcome:'REJECT',reason:'Fictional inappropriate portrait rejected'},reviewer.cookie).expect(200);await get(publicProfile.photo_url).expect(404);publicProfile=(await get('/v1/tutor-profiles/'+p.public_id).expect(200)).body.profile;assert.equal(publicProfile.photo_url,null);
});
test('learner coverage remains mandatory while a nonverified free Tutor can accept and retain safe connections',async()=>{
 const tutor=await account(),learner=await account(false);const {listing:l,profile:p}=await online(tutor);const learnerId=(await post('/v1/me/learners/adult',{alias:'Fictional adult learner',learning_requirements:'School Physics practice and worked examples',adult_confirmed:true},learner.cookie).expect(201)).body.profile.id;
 const input={request_key:randomUUID(),listing_id:l.id,listing_revision:l.revision,learner_id:learnerId,subject_id:'subject-physics',teaching_mode:'ONLINE',learning_requirements:'School Physics practice through worked examples',preferred_times:'Weekends, IST'};await post('/v1/me/contact-requests',input,learner.cookie).expect(403);
 await grantContactFixture(db,config,learner.email,'ACTIVE',clock);const enquiry=(await post('/v1/me/contact-requests',input,learner.cookie).expect(200)).body.request;const stored=(await db.pool.query('SELECT tutor_pro_grant_id FROM contact_requests WHERE id=$1',[enquiry.id])).rows[0];assert.equal(stored.tutor_pro_grant_id,null);
 const accepted=(await post('/v1/me/tutor-requests/'+enquiry.id+'/decisions',{decision:'ACCEPT'},tutor.cookie).expect(200)).body;const connection=accepted.connection_id;await get('/v1/me/connections/'+connection,learner.cookie).expect(200);
 await post('/v1/me/listings/'+l.id+'/actions/ARCHIVE',{revision:l.revision},tutor.cookie).expect(200);await get('/v1/me/connections/'+connection,learner.cookie).expect(200);const current=(await get('/v1/me/tutor',tutor.cookie).expect(200)).body.profile;await post('/v1/me/tutor/publication',{expected_public_revision:current.public_revision,action:'PAUSE'},tutor.cookie).expect(200);await get('/v1/me/connections/'+connection,learner.cookie).expect(200);await get('/v1/tutor-profiles/'+p.public_id).expect(404);
});
test('account restrictions, inactive catalogue and both-direction blocks remain authoritative',async()=>{
 const tutor=await account(),learner=await account(false);const {listing:l,profile:p}=await online(tutor);
 await db.pool.query("UPDATE catalogue_terms SET active=false WHERE id='subject-physics'");
 try{await get('/v1/discovery/'+l.id).expect(404);await get('/v1/tutor-profiles/'+p.public_id).expect(404);const row=(await get('/v1/me/listings',tutor.cookie).expect(200)).body;assert.equal(row.listings[0].eligible,false);assert.deepEqual(row.eligible_subject_ids,[]);}finally{await db.pool.query("UPDATE catalogue_terms SET active=true WHERE id='subject-physics'");}
 const learnerId=(await post('/v1/me/learners/adult',{alias:'Fictional blocked learner',learning_requirements:'School Physics practice and worked examples',adult_confirmed:true},learner.cookie).expect(201)).body.profile.id;await grantContactFixture(db,config,learner.email,'ACTIVE',clock);
 const input={request_key:randomUUID(),listing_id:l.id,listing_revision:l.revision,learner_id:learnerId,subject_id:'subject-physics',teaching_mode:'ONLINE',learning_requirements:'School Physics practice through worked examples',preferred_times:'Weekends, IST'};
 await db.pool.query('INSERT INTO account_blocks(owner_id,blocked_id,created_at) VALUES($1,$2,$3)',[tutor.id,learner.id,clock]);await post('/v1/me/contact-requests',input,learner.cookie).expect(403);
 await db.pool.query('DELETE FROM account_blocks WHERE owner_id=$1 AND blocked_id=$2',[tutor.id,learner.id]);await db.pool.query('INSERT INTO account_blocks(owner_id,blocked_id,created_at) VALUES($1,$2,$3)',[learner.id,tutor.id,clock]);await post('/v1/me/contact-requests',input,learner.cookie).expect(403);
 await db.pool.query("UPDATE users SET status='DISABLED' WHERE id=$1",[tutor.id]);await get('/v1/discovery/'+l.id).expect(404);await get('/v1/tutor-profiles/'+p.public_id).expect(404);await get('/v1/me/listings',tutor.cookie).expect(401);
});
test('public contact still requires explicit consent and current Pro; staff can find free unverified profiles',async()=>{
 const tutor=await account(),reviewer=await staff();const p=await intro(tutor,{public_email_consent:true});const draft=(await post('/v1/me/listings',offer,tutor.cookie).expect(201)).body.listing;await post('/v1/me/listings/'+draft.id+'/actions/PUBLISH',{revision:draft.revision},tutor.cookie).expect(200);
 assert.equal((await get('/v1/tutor-profiles/'+p.public_id).expect(200)).body.profile.contact,null);
 const queue=(await get('/v1/staff/tutors',reviewer.cookie).expect(200)).body.profiles;assert.ok(queue.some((x:{user_id:string;status:string;publication_status:string})=>x.user_id===tutor.id&&x.status==='DRAFT'&&x.publication_status==='PUBLISHED'));
 await grantTutorProFixture(db,config,tutor.email,clock);assert.equal((await get('/v1/tutor-profiles/'+p.public_id).expect(200)).body.profile.contact.email,tutor.email);
 const current=(await get('/v1/me/tutor',tutor.cookie).expect(200)).body.profile;await intro(tutor,{public_email_consent:false,expected_public_revision:current.public_revision});assert.equal((await get('/v1/tutor-profiles/'+p.public_id).expect(200)).body.profile.contact,null);
});
test('historical requested ad changes require a revision, and staff restriction lifts never publish automatically',async()=>{
 const tutor=await account(),reviewer=await staff();await intro(tutor);let l=(await post('/v1/me/listings',offer,tutor.cookie).expect(201)).body.listing;
 // Reproduce a saved pre-policy review case; the actual reviewer decision and
 // all following owner actions exercise the HTTP API.
 await db.pool.query("UPDATE teaching_listings SET status='REVIEW',publication_policy='review-v1' WHERE id=$1",[l.id]);
 l=(await post('/v1/staff/listings/'+l.id+'/reviews',{revision:l.revision,outcome:'CHANGES_REQUESTED',reason:'Fictional historical title needs a clearer learning outcome'},reviewer.cookie).expect(200)).body.listing;
 await post('/v1/me/listings/'+l.id+'/actions/PUBLISH',{revision:l.revision},tutor.cookie).expect(409);
 l=(await post('/v1/me/listings/'+l.id,{revision:l.revision,offer:{...offer,title:'Understand school Physics through practical worked examples patient explanations and guided practice'}},tutor.cookie).expect(200)).body.listing;
 assert.equal(l.status,'DRAFT');await post('/v1/me/listings/'+l.id+'/actions/PUBLISH',{revision:l.revision},tutor.cookie).expect(200);
});
