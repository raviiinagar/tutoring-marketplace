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
import {AvailabilityService,availabilityWorker} from '../src/availability.js';
import {DiscoveryService} from '../src/discovery.js';
import {ListingsService} from '../src/listings.js';
import {MailWorker} from '../src/mail.js';
import {readFile} from 'node:fs/promises';
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
beforeEach(async()=>{clock=new Date(clock.getTime()+8*86400000);await database.pool.query('DELETE FROM availability_notification_intents');await database.pool.query('DELETE FROM mail_outbox WHERE availability_subscription_id IS NOT NULL');await database.pool.query('DELETE FROM availability_subscriptions');});
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
async function publishOffer(user:Awaited<ReturnType<typeof tutor>>,payload:unknown,id?:string){let row=(await post('/v1/me/listings',payload,user.cookie).expect(201)).body.listing;if(id){await database.pool.query('UPDATE teaching_listings SET id=$2 WHERE id=$1',[row.id,id]);row.id=id;}row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;return (await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Exact public discovery fixture checked'},user.reviewer!.cookie).expect(200)).body.listing;}
const find=(query:Record<string,string|number>={})=>request(app.getHttpServer()).get('/v1/discovery').query(query);

const selection={domain_id:'school',subject_id:'subject-physics'};
const signup=(email=randomUUID()+'@example.test',filters:unknown=selection)=>({email,selection:filters,consent:true,adult_confirmed:true,consent_version:'availability-v1'});
const subscriptions=()=>database.pool.query('SELECT * FROM availability_subscriptions');
async function links(){const row=(await database.pool.query("SELECT m.id,m.encrypted_payload FROM mail_outbox m JOIN availability_subscriptions s ON s.id=m.availability_subscription_id WHERE m.status='PENDING' ORDER BY (s.status='PENDING') DESC,s.generation DESC,m.created_at DESC")).rows[0];const payload=decrypt<{to:string;availability_verification_url:string;availability_unsubscribe_url:string}>(row.encrypted_payload,config.authSecret);return {id:row.id,payload,verify:new URL(payload.availability_verification_url).hash.slice(7),unsubscribe:new URL(payload.availability_unsubscribe_url).hash.slice(7)};}
const worker=()=>availabilityWorker(database,config,now);

test('empty-category signup requires adult purpose consent and exact validated filters without creating an account or payment rights',async()=>{
 const beforeUsers=(await database.pool.query('SELECT count(*) FROM users')).rows[0].count;
 for(const invalid of [{...signup(),consent:false},{...signup(),adult_confirmed:false},{...signup(),consent_version:'marketing'},{...signup(),roles:['TUTOR']},signup('invalid'),signup(undefined,{}),signup(undefined,{domain_id:'unknown'}),signup(undefined,{domain_id:'arts',subject_id:'subject-physics'}),signup(undefined,{...selection,max_rate_paise:50000}),signup(undefined,{...selection,cursor:randomUUID()})])await post('/v1/availability/subscriptions',invalid).expect(400);
 const body=signup(' ADULT@EXAMPLE.TEST ',{...selection,level_id:'level-class-10',curriculum_id:'curriculum-cbse',language_id:'language-english',rate_unit:'HOUR',min_rate_paise:40000,max_rate_paise:60000});const result=await post('/v1/availability/subscriptions',body).expect(202);assert.equal(result.headers['set-cookie'],undefined);assert.equal(result.headers['cache-control'],'no-store');
 const row=(await subscriptions()).rows[0];assert.equal(row.status,'PENDING');assert.equal(row.purpose,'TUTOR_AVAILABILITY');assert.deepEqual(row.selection,body.selection);assert.equal(row.email_hash.length,64);assert.ok(!JSON.stringify(row).includes('adult@example.test'));const mail=await links();assert.equal(mail.payload.to,'adult@example.test');
 const audit=(await database.pool.query("SELECT metadata FROM audit_events WHERE event_type LIKE 'AVAILABILITY_%'")).rows;assert.ok(!JSON.stringify(audit).includes('adult@example.test'));assert.ok(!JSON.stringify(audit).includes(mail.verify));
 const mailWorker=new MailWorker(database,config,now);while(await mailWorker.tick()){}const captured=JSON.parse(await readFile(join(config.mailDir,mail.id+'.json'),'utf8'));assert.equal(captured.availability_verification_url,mail.payload.availability_verification_url);assert.equal(captured.availability_unsubscribe_url,mail.payload.availability_unsubscribe_url);
 await post('/v1/availability/confirmations',{token:mail.verify}).expect(200);assert.equal((await subscriptions()).rows[0].status,'ACTIVE');await post('/v1/availability/confirmations',{token:mail.verify}).expect(400);
 assert.equal((await database.pool.query('SELECT count(*) FROM users')).rows[0].count,beforeUsers);await post('/v1/payments/orders',{}).expect(404);assert.equal((await get('/v1/me')).status,401);
});

test('simultaneous normalized duplicate signups create one durable confirmation and do not rotate active consent tokens',async()=>{
 const email=randomUUID()+'@example.test';const replies=await Promise.all([post('/v1/availability/subscriptions',signup(email)).expect(202),post('/v1/availability/subscriptions',signup(email.toUpperCase())).expect(202)]);assert.deepEqual(replies[0].body,replies[1].body);assert.equal((await subscriptions()).rowCount,1);assert.equal((await database.pool.query('SELECT count(*) FROM mail_outbox WHERE availability_subscription_id IS NOT NULL')).rows[0].count,'1');
 const original=await links();await post('/v1/availability/confirmations',{token:original.verify}).expect(200);await post('/v1/availability/subscriptions',signup(email)).expect(202);assert.equal((await subscriptions()).rows[0].generation,1);assert.equal((await links()).id,original.id);await post('/v1/availability/unsubscriptions',{token:original.unsubscribe}).expect(200);assert.equal((await subscriptions()).rows[0].status,'WITHDRAWN');
});

test('verification expires at the exact boundary and pending/active expiry purges contact with no notification',async()=>{
 await post('/v1/availability/subscriptions',signup()).expect(202);const mail=await links();clock=new Date(clock.getTime()+15*60000);await post('/v1/availability/confirmations',{token:mail.verify}).expect(400);assert.equal(await worker().tick(),true);assert.equal((await subscriptions()).rows[0].status,'EXPIRED');assert.equal((await subscriptions()).rows[0].encrypted_contact,null);
 await post('/v1/availability/subscriptions',signup()).expect(202);const second=await links();await post('/v1/availability/confirmations',{token:second.verify}).expect(200);clock=new Date(clock.getTime()+90*86400000);await worker().tick();const active=(await subscriptions()).rows.find(r=>r.unsubscribe_hash===tokenHash(second.unsubscribe));assert.equal(active.status,'EXPIRED');assert.equal(active.encrypted_contact,null);assert.equal((await database.pool.query('SELECT count(*) FROM availability_notification_intents')).rows[0].count,'0');
});

test('withdrawal invalidates pending confirmation, cancels queued mail, is idempotent and old links cannot withdraw a new generation',async()=>{
 const email=randomUUID()+'@example.test';await post('/v1/availability/subscriptions',signup(email)).expect(202);const original=await links();await post('/v1/availability/unsubscriptions',{token:original.unsubscribe}).expect(200);await post('/v1/availability/unsubscriptions',{token:original.unsubscribe}).expect(200);await post('/v1/availability/confirmations',{token:original.verify}).expect(400);assert.equal((await subscriptions()).rows[0].encrypted_contact,null);assert.equal((await database.pool.query('SELECT status FROM mail_outbox WHERE id=$1',[original.id])).rows[0].status,'EXPIRED');
 await post('/v1/availability/subscriptions',signup(email)).expect(202);const renewed=await links();await post('/v1/availability/confirmations',{token:renewed.verify}).expect(200);await post('/v1/availability/unsubscriptions',{token:original.unsubscribe}).expect(200);assert.equal((await subscriptions()).rows[0].status,'ACTIVE');assert.equal((await subscriptions()).rows[0].generation,2);await post('/v1/availability/unsubscriptions',{token:'x'.repeat(43)}).expect(200);
});

test('only currently approved matching supply creates one intent; pause, price and same-offer dimensions are authoritative',async()=>{
 const filters={domain_id:'entrance',subject_id:'subject-physics',exam_id:'exam-jee',language_id:'language-hindi',rate_unit:'HOUR',max_rate_paise:60000};await post('/v1/availability/subscriptions',signup(undefined,filters)).expect(202);const mail=await links();const user=await tutor(true,['subject-physics','subject-mathematics']);await publishOffer(user,offer);await publishOffer(user,{...offer,domain_id:'entrance',subject_id:'subject-mathematics',curriculum_id:undefined,level_id:'level-repeater',exam_id:'exam-jee',language_ids:['language-hindi']});await post('/v1/availability/confirmations',{token:mail.verify}).expect(200);await worker().tick();assert.equal((await database.pool.query('SELECT count(*) FROM availability_notification_intents')).rows[0].count,'0');
 let row=await publishOffer(user,{...offer,domain_id:'entrance',curriculum_id:undefined,level_id:'level-repeater',exam_id:'exam-jee',language_ids:['language-hindi'],rate_paise:70000});clock=new Date(clock.getTime()+60000);await worker().tick();assert.equal((await subscriptions()).rows[0].status,'ACTIVE');
 row=(await post('/v1/me/listings/'+row.id,{offer:{...row.offer,rate_paise:50000},revision:row.revision},user.cookie).expect(200)).body.listing;
 row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;row=(await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Match revised exact offer'},user.reviewer!.cookie).expect(200)).body.listing;
 row=(await post('/v1/me/listings/'+row.id+'/actions/PAUSE',{revision:row.revision},user.cookie).expect(200)).body.listing;clock=new Date(clock.getTime()+60000);await worker().tick();assert.equal((await subscriptions()).rows[0].status,'ACTIVE');row=(await post('/v1/me/listings/'+row.id+'/actions/RESUME',{revision:row.revision},user.cookie).expect(200)).body.listing;
 clock=new Date(clock.getTime()+60000);await Promise.all([worker().tick(),worker().tick()]);await worker().tick();const intents=(await database.pool.query('SELECT * FROM availability_notification_intents')).rows;assert.equal(intents.length,1);assert.equal(intents[0].listing_id,row.id);assert.equal(intents[0].status,'PENDING');assert.equal((await subscriptions()).rows[0].status,'MATCH_FOUND');
 await post('/v1/availability/unsubscriptions',{token:mail.unsubscribe}).expect(200);assert.equal((await database.pool.query('SELECT status FROM availability_notification_intents')).rows[0].status,'CANCELLED');
 await post('/v1/availability/subscriptions',signup(undefined,filters)).expect(409);
});

test('abuse limits and origin guards reject repeated requests and workers never revive withdrawn subscriptions',async()=>{
 const email=randomUUID()+'@example.test';for(let i=0;i<3;i++)await post('/v1/availability/subscriptions',signup(email)).expect(202);await post('/v1/availability/subscriptions',signup(email)).expect(429);clock=new Date(clock.getTime()+3600000);
 for(let i=0;i<20;i++)await post('/v1/availability/subscriptions',signup()).expect(202);await post('/v1/availability/subscriptions',signup()).expect(429);
 await request(app.getHttpServer()).post('/v1/availability/subscriptions').set('Origin','https://evil.example').send(signup()).expect(403);clock=new Date(clock.getTime()+3600000);await worker().tick();await post('/v1/availability/subscriptions',signup()).expect(202);const mail=await links();await post('/v1/availability/confirmations',{token:mail.verify}).expect(200);await Promise.all([worker().tick(),post('/v1/availability/unsubscriptions',{token:mail.unsubscribe}).expect(200)]);const row=(await subscriptions()).rows.find(r=>r.unsubscribe_hash===tokenHash(mail.unsubscribe));assert.equal(row.status,'WITHDRAWN');assert.equal(row.encrypted_contact,null);assert.equal((await database.pool.query("SELECT count(*) FROM availability_notification_intents WHERE subscription_id=$1 AND status='PENDING'",[row.id])).rows[0].count,'0');
});

test('empty projected pages do not hide later eligible supply and changed prices are rechecked after discovery',async()=>{
 const filters={...selection,rate_unit:'HOUR',max_rate_paise:60000};await post('/v1/availability/subscriptions',signup(undefined,filters)).expect(202);const mail=await links();await post('/v1/availability/confirmations',{token:mail.verify}).expect(200);
 const invalid=await tutor();const template=await publishOffer(invalid,offer,'00000000-0000-4000-8000-000000000001');for(let i=2;i<=24;i++)await database.pool.query("INSERT INTO teaching_listings(id,user_id,payload,profile_revision,revision,status,approved,reviewed_by,reviewed_at) SELECT $2,user_id,payload,profile_revision,revision,status,approved,reviewed_by,reviewed_at FROM teaching_listings WHERE id=$1",[template.id,'00000000-0000-4000-8000-'+String(i).padStart(12,'0')]);await database.pool.query('UPDATE tutor_profiles SET encrypted_birth_date=$2 WHERE user_id=$1',[invalid.id,encrypt({birth_date:'2020-01-01'},config.authSecret)]);
 const valid=await tutor();const id='ffffffff-ffff-4fff-8fff-ffffffffffff';await publishOffer(valid,offer,id);const first=(await find({...filters,limit:24})).body;assert.equal(first.offers.length,0);assert.ok(first.next_cursor);await post('/v1/availability/subscriptions',signup(undefined,filters)).expect(409);
 const discovery=new DiscoveryService(database,config,now);const search=discovery.search.bind(discovery);let changed=false;discovery.search=async input=>{const page=await search(input);if(page.offers.length&&!changed){changed=true;await database.pool.query("UPDATE teaching_listings SET payload=jsonb_set(payload,'{rate_paise}','70000') WHERE id=$1",[id]);}return page;};const guarded=new AvailabilityService(database,config,discovery,app.get(ListingsService),now);await guarded.tick();assert.equal((await subscriptions()).rows[0].status,'ACTIVE');assert.equal((await database.pool.query('SELECT count(*) FROM availability_notification_intents')).rows[0].count,'0');
 await database.pool.query("UPDATE teaching_listings SET payload=jsonb_set(payload,'{rate_paise}','50000') WHERE id=$1",[id]);clock=new Date(clock.getTime()+60000);await worker().tick();assert.equal((await subscriptions()).rows[0].status,'MATCH_FOUND');assert.equal((await database.pool.query('SELECT listing_id FROM availability_notification_intents')).rows[0].listing_id,id);
});

test('email fanout stays capped after withdrawal and a freed slot requires fresh explicit confirmation',async()=>{
 const email=randomUUID()+'@example.test';const bodies=[];let withdrawnToken='';for(let i=0;i<10;i++){if(i%3===0)clock=new Date(clock.getTime()+3600000);const body=signup(email,{...selection,rate_unit:'HOUR',min_rate_paise:100+i});bodies.push(body);await post('/v1/availability/subscriptions',body).expect(202);const mail=await links();await post('/v1/availability/confirmations',{token:mail.verify}).expect(200);if(i===0)withdrawnToken=mail.unsubscribe;}
 await post('/v1/availability/unsubscriptions',{token:withdrawnToken}).expect(200);const extra=signup(email,{...selection,rate_unit:'HOUR',min_rate_paise:200});await post('/v1/availability/subscriptions',extra).expect(202);const mail=await links();await post('/v1/availability/confirmations',{token:mail.verify}).expect(200);clock=new Date(clock.getTime()+3600000);const before=(await database.pool.query('SELECT count(*) FROM mail_outbox WHERE availability_subscription_id IS NOT NULL')).rows[0].count;
 await post('/v1/availability/subscriptions',bodies[0]).expect(202);assert.equal((await subscriptions()).rows.filter(r=>r.status==='ACTIVE').length,10);assert.equal((await subscriptions()).rows.find(r=>r.unsubscribe_hash===tokenHash(withdrawnToken)).status,'WITHDRAWN');assert.equal((await database.pool.query('SELECT count(*) FROM mail_outbox WHERE availability_subscription_id IS NOT NULL')).rows[0].count,before);
});
