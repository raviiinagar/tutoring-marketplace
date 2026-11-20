import {ensurePublicationPhoto} from "./helpers/publication.js";
import {customSubjectText} from '../src/custom-subject.js';
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
before(async()=>{
 const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
 const dir=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/custom_subject_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(dir,'mail'),EVIDENCE_SCANNER:'test'});
 cluster=await startDatabase(config.databaseUrl,join(dir,'postgres'));db=new Database(config.databaseUrl);
 await migrate(db);app=await createApplication(config,db,now);
});
beforeEach(()=>{clock=new Date(clock.getTime()+2*3600000);});
after(async()=>{await app?.close();await db?.close();await cluster?.stop();});
async function account(tutor=true){const email=randomUUID()+'@example.test';await post('/v1/auth/registrations',{display_name:'Fictional adult',email,password}).expect(202);const mail=(await db.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0];await post('/v1/auth/verifications',{token:new URL(decrypt<{verification_url:string}>(mail.encrypted_payload,config.authSecret).verification_url).hash.slice(7)}).expect(200);const login=await post('/v1/auth/sessions',{email,password}).expect(200);const a={id:login.body.user.id as string,email,cookie:login.headers['set-cookie'][0] as string};if(tutor)await post('/v1/me/roles',{roles:['TUTOR']},a.cookie).expect(200);return a;}
async function staff(){const a=await account(false);await assignStaff(db,a.email,['TRUST'],'Fictional direct-publication reviewer','test');const enrollment=await post('/v1/staff/mfa/enrollments',{password},a.cookie).expect(200);const confirmation=await post('/v1/staff/mfa/confirmations',{code:totp(enrollment.body.secret,clock)},a.cookie).expect(200);return {...a,cookie:a.cookie.split(';')[0]+'; '+confirmation.headers['set-cookie'][0].split(';')[0]};}
async function intro(a:{cookie:string},extra:Record<string,unknown>={}){const profile=(await post('/v1/me/tutor/introduction',{display_name:'Fictional Physics Tutor',biography,subject_ids:['subject-physics'],hourly_rate_paise:50000,identity_country:'IN',identity_document:'AADHAAR',adult_confirmed:true,public_email_consent:false,replace_identity:false,...extra},a.cookie).expect(200)).body.profile;await ensurePublicationPhoto(post,get,a);return profile;}

const other={...offer,title:'Learn classical Guitar chords strumming and simple songs with patient guided practice',domain_id:'arts',subject_id:'subject-other',custom_subject:'Classical  Guitar',level_id:'',curriculum_id:undefined};
async function artsLevel(){return (await db.pool.query("SELECT id FROM catalogue_terms WHERE kind='LEVEL' AND active AND 'arts'=ANY(domain_ids) ORDER BY id LIMIT 1")).rows[0].id as string;}
async function presence(a:{cookie:string},modes:string[],revision=0,slots:unknown[]=[]){return (await post('/v1/me/tutor/presence',{expected_revision:revision,location:{city:'Kota',area:'Talwandi',country:'India'},teaching_modes:modes,accepting_students:true,weekly_slots:slots,timezone:'Asia/Kolkata'},a.cookie).expect(200)).body;}
async function publish(a:{cookie:string},body:Record<string,unknown>){const draft=(await post('/v1/me/listings',body,a.cookie).expect(201)).body.listing;return (await post('/v1/me/listings/'+draft.id+'/actions/PUBLISH',{revision:draft.revision},a.cookie).expect(200)).body.listing;}
const ids=(body:{offers:{id:string}[]})=>body.offers.map(x=>x.id);

test('a typed subject publishes immediately, is searchable by its words and stays out of the public catalogue',async()=>{
 const a=await account();await intro(a);const level=await artsLevel();
 const own=(await get('/v1/me/listings',a.cookie).expect(200)).body;assert.deepEqual(own.eligible_subject_ids,['subject-physics','subject-other']);
 const l=await publish(a,{...other,level_id:level});assert.equal(l.status,'PUBLISHED');assert.equal(l.eligible,true);assert.equal(l.offer.custom_subject,'Classical Guitar');
 const shown=(await get('/v1/discovery/'+l.id).expect(200)).body.listing;assert.equal(shown.offer.subject_id,'subject-other');assert.equal(shown.offer.custom_subject,'Classical Guitar');
 assert.ok(ids((await get('/v1/discovery?subject_text=guitar').expect(200)).body).includes(l.id));
 assert.deepEqual(ids((await get('/v1/discovery?subject_text=violin').expect(200)).body),[]);
 const physics=await publish(a,{...offer,title:'Learn school Physics with patient explanations worked examples and regular practice sessions'});
 assert.ok(!ids((await get('/v1/discovery?subject_text=physics').expect(200)).body).includes(physics.id),'typed-subject search never matches listed subjects');
 const catalogue=(await get('/v1/catalogue').expect(200)).body;assert.ok(!catalogue.terms.some((t:{id:string})=>t.id==='subject-other'));
 // Staff can switch the option off: the typed-subject ad leaves discovery and is no longer offered.
 await db.pool.query("UPDATE catalogue_terms SET active=false WHERE id='subject-other'");
 try{await get('/v1/discovery/'+l.id).expect(404);assert.deepEqual((await get('/v1/me/listings',a.cookie).expect(200)).body.eligible_subject_ids,['subject-physics']);}
 finally{await db.pool.query("UPDATE catalogue_terms SET active=true WHERE id='subject-other'");}
});

test('typed subjects are required for Other, refused elsewhere, and keep contact details out',async()=>{
 const a=await account();await intro(a);const level=await artsLevel();
 const {custom_subject:_omit,...missing}=other;
 await post('/v1/me/listings',{...missing,level_id:level},a.cookie).expect(400);
 await post('/v1/me/listings',{...offer,custom_subject:'Guitar'},a.cookie).expect(400);
 for(const bad of ['x','Guitar www.example.com','Guitar call 98765 43210','guitar@example.test','<b>Guitar</b>','12345','A'.repeat(61)])
  await post('/v1/me/listings',{...other,level_id:level,custom_subject:bad},a.cookie).expect(400);
 const kathak=(await post('/v1/me/listings',{...other,level_id:level,custom_subject:'Kathak (Lucknow gharana)'},a.cookie).expect(201)).body.listing;assert.equal(kathak.offer.custom_subject,'Kathak (Lucknow gharana)');
 // Any script is accepted (checked without the local test database, whose Windows encoding cannot store Devanagari).
 assert.equal(customSubjectText.parse('तबला  (हिंदुस्तानी)'),'तबला (हिंदुस्तानी)');
 // "Other" is an ad choice, never a declared profile subject.
 const current=(await get('/v1/me/tutor',a.cookie).expect(200)).body.profile;
 const refused=await post('/v1/me/tutor/introduction',{display_name:'Fictional Physics Tutor',biography,subject_ids:['subject-physics','subject-other'],hourly_rate_paise:50000,identity_country:'IN',identity_document:'AADHAAR',adult_confirmed:true,public_email_consent:false,replace_identity:false,expected_public_revision:current.public_revision},a.cookie);
 assert.ok([400,409].includes(refused.status),'declaring Other as a profile subject is refused');
});

test('an ad for both modes needs both saved modes and a city, and appears in online and in-person searches',async()=>{
 const a=await account();await intro(a);
 const both={...offer,title:'Learn school Physics online or at home with worked examples and guided practice',teaching_mode:'BOTH'};
 assert.equal((await post('/v1/me/listings',both,a.cookie).expect(409)).body.code,'TEACHING_LOCATION_REQUIRED');
 let saved=(await presence(a,['ONLINE','IN_PERSON'])).presence;
 const l=await publish(a,both);assert.equal(l.eligible,true);assert.equal(l.class_location.city,'Kota');
 assert.ok(ids((await get('/v1/discovery?teaching_mode=ONLINE').expect(200)).body).includes(l.id));
 assert.ok(ids((await get('/v1/discovery?teaching_mode=IN_PERSON&location=Kota').expect(200)).body).includes(l.id));
 assert.equal((await get('/v1/discovery/'+l.id).expect(200)).body.listing.offer.class_location.city,'Kota');
 // Saving new hours keeps the ad live; dropping a mode sends it back for an update.
 const hours=await presence(a,['ONLINE','IN_PERSON'],saved.revision,[{day:'MON',start_minute:960,end_minute:1080}]);
 assert.equal(hours.offers_need_review,0);await get('/v1/discovery/'+l.id).expect(200);saved=hours.presence;
 const dropped=await presence(a,['ONLINE'],saved.revision);
 assert.equal(dropped.offers_need_review,1);await get('/v1/discovery/'+l.id).expect(404);
});
