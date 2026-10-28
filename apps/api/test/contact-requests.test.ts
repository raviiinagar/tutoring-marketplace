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
import {grantContactFixture} from '../../../scripts/contact-request-fixture.js';
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
  const directory=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/staff_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(directory,'mail'),EVIDENCE_SCANNER:'test',GUARDIAN_VERIFICATION_MODE:'test'});
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
 if(approved){const reviewer=await fixture(['TRUST']);const mfa=await enroll(reviewer.cookie);for(const [kind,subjectId] of [['IDENTITY',''],...subjects.map(subject=>['QUALIFICATION',subject])]){const file=(await post('/v1/me/tutor/evidence',{media_type:'application/pdf',data:Buffer.from('%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n').toString('base64')},user.cookie).expect(201)).body.evidence.id;await post('/v1/me/tutor/claims',{kind,description:'Fictional evidence for '+kind,evidence_id:file,...(kind==='IDENTITY'?{}:{subject_id:subjectId})},user.cookie).expect(201);}await post('/v1/me/tutor/submissions',{},user.cookie).expect(200);const claims=(await get('/v1/me/tutor',user.cookie)).body.claims;for(const claim of claims)await post('/v1/staff/tutor-claims/'+claim.id+'/reviews',{outcome:'APPROVE',checked_item:'Fictional document and claim checked',reason:'Approve fictional Tutor evidence',adult_identity_confirmed:true,expires_at:new Date(clock.getTime()+86400000).toISOString()},mfa.cookie).expect(200);await grantTutorProFixture(database,config,user.email,clock);return {...user,reviewer:mfa};}
 return {...user,reviewer:undefined};
}
async function draft(user:{cookie:string}){return (await post('/v1/me/listings',offer,user.cookie).expect(201)).body.listing;}
async function submitted(user:{cookie:string}){const row=await draft(user);return (await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;}
async function publish(user:Awaited<ReturnType<typeof tutor>>){const row=await submitted(user);return (await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Exact school Physics offer checked'},user.reviewer!.cookie).expect(200)).body.listing;}
async function publishOffer(user:Awaited<ReturnType<typeof tutor>>,payload:unknown){let row=(await post('/v1/me/listings',payload,user.cookie).expect(201)).body.listing;row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;return (await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Exact public discovery fixture checked'},user.reviewer!.cookie).expect(200)).body.listing;}
const find=(query:Record<string,string|number>={})=>request(app.getHttpServer()).get('/v1/discovery').query(query);

async function learner(){const user=await fixture(null);const row=(await post('/v1/me/learners/adult',{alias:'Fictional learner',learning_requirements:'Practice Physics concepts with worked examples',adult_confirmed:true},user.cookie).expect(201)).body.profile;return {...user,profile:row};}
async function scenario(){const owner=await learner();const teacher=await tutor();const listing=await publish(teacher);return {owner,teacher,listing};}
const enquiry=(learnerId:string,row:{id:string;revision:number})=>({request_key:randomUUID(),listing_id:row.id,listing_revision:row.revision,learner_id:learnerId,subject_id:'subject-physics',teaching_mode:'ONLINE',learning_requirements:'Explain Physics mechanics using worked examples',preferred_times:'Tuesday and Thursday evenings, IST'});
const submit=(body:unknown,cookie?:string)=>post('/v1/me/contact-requests',body,cookie);
const grant=(email:string,state:'ACTIVE'|'MATCHING'='ACTIVE')=>grantContactFixture(database,config,email,state,clock);

test('deadline worker records reminders once and expires at equality even after a delayed run',async()=>{
 const {owner,teacher,listing}=await scenario();await grant(owner.email);
 await database.pool.query('UPDATE tutor_claims SET expires_at=$2 WHERE user_id=$1',[teacher.id,new Date(clock.getTime()+10*86400000)]);
 const sent=(await submit(enquiry(owner.profile.id,listing),owner.cookie).expect(200)).body.request;
 const {RequestLifecycle}=await import('../src/request-lifecycle.js');
 const worker=new RequestLifecycle(database,now);
 assert.deepEqual(await worker.tick(),{expired:0,reminded:0});
 clock=new Date(clock.getTime()+48*3600000);
 assert.deepEqual(await worker.tick(),{expired:0,reminded:1});
 assert.deepEqual(await worker.tick(),{expired:0,reminded:0});
 const due=(await get('/v1/me/contact-requests/'+sent.id,owner.cookie).expect(200)).body.request;
 assert.equal(due.reminder,'DUE_SOON');assert.equal(due.server_time,clock.toISOString());
 clock=new Date(sent.expires_at);
 // Reads and decisions must remain correct while the worker is stopped.
 assert.equal((await get('/v1/me/contact-requests/'+sent.id,owner.cookie)).body.request.status,'EXPIRED');
 await post('/v1/me/tutor-requests/'+sent.id+'/decisions',{decision:'ACCEPT'},teacher.cookie).expect(409).expect(r=>assert.equal(r.body.code,'REQUEST_EXPIRED'));
 const results=await Promise.all([worker.tick(),worker.tick()]);
 assert.equal(results.reduce((total,result)=>total+result.expired,0),1);
 assert.deepEqual(await worker.tick(),{expired:0,reminded:0});
 const expired=(await get('/v1/me/contact-requests/'+sent.id,owner.cookie)).body.request;
 assert.equal(expired.status,'EXPIRED');assert.equal(expired.reminder,'EXPIRED');assert.equal(expired.expires_at,sent.expires_at);
 await post('/v1/me/tutor-requests/'+sent.id+'/decisions',{decision:'ACCEPT'},teacher.cookie).expect(409).expect(r=>assert.equal(r.body.code,'REQUEST_EXPIRED'));
 assert.equal((await get('/v1/me/request-access',owner.cookie)).body.pending_count,0);
});

test('owner-selected alternatives preserve exact intent without sending, charging or revealing contacts',async()=>{
 const {owner,teacher,listing}=await scenario();await grant(owner.email,'MATCHING');
 const original=(await submit(enquiry(owner.profile.id,listing),owner.cookie).expect(200)).body.request;
 const other=await tutor(true,['subject-physics','subject-mathematics']);
 const matching=await publish(other);
 await publishOffer(other,{...offer,title:'Different curriculum Physics',curriculum_id:'curriculum-icse'});
 await publishOffer(other,{...offer,title:'Different level Physics',level_id:'level-class-11'});
 await publishOffer(other,{...offer,title:'Different language Physics',language_ids:['language-hindi']});
 await publishOffer(other,{...offer,title:'Different subject Mathematics',subject_id:'subject-mathematics'});
 await publishOffer(teacher,{...offer,title:'Same original Tutor other offer'});
 const endpoint='/v1/me/contact-requests/'+original.id+'/alternatives';
 await get(endpoint).expect(401);await get(endpoint,other.cookie).expect(404);
 const suggestions=(await get(endpoint,owner.cookie).expect(200)).body;
 assert.deepEqual(suggestions.offers.map((row:{id:string})=>row.id),[matching.id]);
 const text=JSON.stringify(suggestions);for(const secret of [other.email,teacher.email,owner.email,'tutor_id','payer_id','encrypted_message'])assert.ok(!text.includes(secret));
 assert.equal((await get('/v1/me/contact-requests',owner.cookie)).body.requests.length,1);
 assert.equal((await get('/v1/me/connections',owner.cookie)).body.connections.length,0);
 assert.equal((await get('/v1/me/purchases/current',owner.cookie)).body.purchase,null);
 await database.pool.query('INSERT INTO account_blocks(owner_id,blocked_id) VALUES($1,$2)',[other.id,owner.id]);
 assert.deepEqual((await get(endpoint,owner.cookie)).body.offers,[]);
 await database.pool.query('DELETE FROM account_blocks WHERE owner_id=$1 AND blocked_id=$2',[other.id,owner.id]);
 const replacement=(await submit(enquiry(owner.profile.id,matching),owner.cookie).expect(200)).body.request;
 assert.notEqual(replacement.id,original.id);assert.equal(replacement.expires_at,original.expires_at);
 assert.equal(replacement.connection_id,null);
 assert.deepEqual((await get(endpoint,owner.cookie)).body.offers,[]);
 assert.equal((await get('/v1/me/request-access',owner.cookie)).body.pending_count,2);
 await post('/v1/me/roles',{roles:['TUTOR']},owner.cookie).expect(200);
 await get(endpoint,owner.cookie).expect(403);
});

test('requests require authenticated beneficiary authority, eligible exact offers and server coverage; client flags cannot grant access',async()=>{
 const {owner,teacher,listing}=await scenario();const body=enquiry(owner.profile.id,listing);await submit(body).expect(401);await submit(body,owner.cookie).expect(403).expect(r=>assert.equal(r.body.code,'ACCESS_REQUIRED'));const access=(await get('/v1/me/request-access',owner.cookie)).body;assert.equal(access.can_request,false);assert.equal(access.checkout_available,false);
 for(const invalid of [{...body,paid:true},{...body,entitlement_id:randomUUID()},{...body,payer_id:teacher.id},{...body,tutor_id:teacher.id},{...body,expires_at:new Date().toISOString()},{...body,teaching_mode:'IN_PERSON'},{...body,learning_requirements:'Email me at person@example.test please'},{...body,preferred_times:'Call +91 9876543210 please'},{...body,preferred_times:'Telegram: @fictionalname'},{...body,learning_requirements:'Read https://example.test/my-info'},{...body,learning_requirements:'Too short'}])await submit(invalid,owner.cookie).expect(400);
 await grant(owner.email);await submit({...body,subject_id:'subject-mathematics'},owner.cookie).expect(400);await submit({...body,listing_revision:listing.revision+1},owner.cookie).expect(409);const other=await learner();await submit({...body,learner_id:other.profile.id},owner.cookie).expect(404);
 await post('/v1/me/roles',{roles:['TUTOR']},owner.cookie).expect(200);await submit(body,owner.cookie).expect(403);await post('/v1/me/roles',{roles:['LEARNER']},owner.cookie).expect(200);let paused=(await post('/v1/me/listings/'+listing.id+'/actions/PAUSE',{revision:listing.revision},teacher.cookie).expect(200)).body.listing;await submit({...body,listing_revision:paused.revision},owner.cookie).expect(404);
 await post('/v1/me/roles',{roles:['LEARNER','TUTOR']},teacher.cookie).expect(200);const self=await post('/v1/me/learners/adult',{alias:'Tutor as Learner',learning_requirements:'Practice Physics with a suitable teacher',adult_confirmed:true},teacher.cookie).expect(201);await grant(teacher.email);paused=(await post('/v1/me/listings/'+listing.id+'/actions/RESUME',{revision:paused.revision},teacher.cookie).expect(200)).body.listing;await submit(enquiry(self.body.profile.id,paused),teacher.cookie).expect(403).expect(r=>assert.equal(r.body.code,'SELF_REQUEST'));
 assert.equal((await database.pool.query('SELECT count(*) FROM contact_requests WHERE payer_id=$1',[owner.id])).rows[0].count,'0');
});

test('submission snapshots coverage and encrypted enquiry; duplicate races return the same result without exposing unrelated records',async()=>{
 const {owner,teacher,listing}=await scenario();const coverage=await grant(owner.email);const body=enquiry(owner.profile.id,listing);const replies=await Promise.all([submit(body,owner.cookie).expect(200),submit(body,owner.cookie).expect(200)]);assert.equal(replies[0].body.request.id,replies[1].body.request.id);assert.equal(replies.filter(r=>r.body.replayed).length,1);const id=replies[0].body.request.id;const row=(await database.pool.query('SELECT * FROM contact_requests WHERE id=$1',[id])).rows[0];assert.equal(row.entitlement_id,coverage);assert.equal(row.coverage_snapshot.policy_version,'fixture-access-v1');assert.equal(row.request_policy_version,'contact-v1');assert.equal(new Date(row.expires_at).getTime()-new Date(row.created_at).getTime(),72*3600000);assert.ok(!JSON.stringify(row.encrypted_message).includes(body.learning_requirements));
 const aliasBody={...body,request_key:randomUUID()};const duplicate=(await submit(aliasBody,owner.cookie).expect(200)).body;assert.equal(duplicate.request.id,id);assert.equal(duplicate.replayed,true);await submit({...body,preferred_times:'Sunday morning, IST'},owner.cookie).expect(409);await submit({...body,request_key:randomUUID(),preferred_times:'Sunday morning, IST'},owner.cookie).expect(409);assert.equal((await database.pool.query('SELECT count(*) FROM contact_requests WHERE payer_id=$1',[owner.id])).rows[0].count,'1');
 const other=await learner();await get('/v1/me/contact-requests/'+id,other.cookie).expect(404);await get('/v1/me/contact-requests/'+id,teacher.cookie).expect(404);assert.equal((await get('/v1/me/contact-requests',other.cookie)).body.requests.length,0);const detail=await get('/v1/me/contact-requests/'+id,owner.cookie).expect(200);assert.equal(detail.body.request.learning_requirements,body.learning_requirements);const text=JSON.stringify(detail.body);for(const secret of [teacher.email,owner.email,'encrypted_message','entitlement_id','tutor_id','payer_id'])assert.ok(!text.includes(secret));const audit=(await database.pool.query("SELECT metadata FROM audit_events WHERE event_type='CONTACT_REQUEST_SUBMITTED' AND metadata->>'target'=$1",[id])).rows;assert.equal(audit.length,1);assert.ok(!JSON.stringify(audit).includes(body.learning_requirements));
 await assert.rejects(database.pool.query('UPDATE contact_requests SET expires_at=expires_at+interval \'1 hour\' WHERE id=$1',[id]),/immutable/);await assert.rejects(database.pool.query("UPDATE contact_request_policies SET pending_limit=4 WHERE version='contact-v1'"),/immutable/);
 clock=new Date(clock.getTime()+73*3600000);const lateAlias=(await submit(aliasBody,owner.cookie).expect(200)).body;assert.equal(lateAlias.request.id,id);assert.equal(lateAlias.request.status,'EXPIRED');assert.equal((await database.pool.query('SELECT count(*) FROM contact_requests WHERE payer_id=$1',[owner.id])).rows[0].count,'1');
});

test('six simultaneous enquiries share one coverage but only five remain pending; expired requests free slots at equality',async()=>{
 const {owner,teacher,listing}=await scenario();await grant(owner.email);const rows=[listing];for(let i=0;i<5;i++)rows.push(await publishOffer(teacher,{...offer,title:'Physics request fixture offer '+i}));const results=await Promise.all(rows.map(row=>submit(enquiry(owner.profile.id,row),owner.cookie)));assert.equal(results.filter(r=>r.status===200).length,5);assert.equal(results.filter(r=>r.status===409&&r.body.code==='PENDING_LIMIT').length,1);assert.equal((await get('/v1/me/request-access',owner.cookie)).body.pending_count,5);assert.equal((await database.pool.query('SELECT count(DISTINCT entitlement_id) FROM contact_requests WHERE payer_id=$1',[owner.id])).rows[0].count,'1');
 const rejected=rows[results.findIndex(r=>r.status===409)];clock=new Date(clock.getTime()+72*3600000);const history=(await get('/v1/me/contact-requests',owner.cookie)).body.requests;assert.ok(history.every((r:{status:string})=>r.status==='EXPIRED'));assert.equal((await get('/v1/me/request-access',owner.cookie)).body.pending_count,0);const newTeacher=await tutor();const newOffer=await publish(newTeacher);await submit(enquiry(owner.profile.id,newOffer),owner.cookie).expect(200);assert.equal((await database.pool.query("SELECT count(*) FROM contact_requests WHERE payer_id=$1 AND status='PENDING'",[owner.id])).rows[0].count,'1');assert.ok(rejected.id);
});

test('first matching deadline caps expiry, while active pass expiry never shortens already recorded request coverage',async()=>{
 const {owner,listing}=await scenario();const funded=await grant(owner.email,'MATCHING');await database.pool.query('UPDATE access_entitlements SET matching_deadline=$2 WHERE id=$1',[funded,new Date(clock.getTime()+2*3600000)]);const body=enquiry(owner.profile.id,listing);const response=(await submit(body,owner.cookie).expect(200)).body.request;assert.equal(new Date(response.expires_at).getTime(),clock.getTime()+2*3600000);clock=new Date(clock.getTime()+2*3600000);assert.equal((await get('/v1/me/request-access',owner.cookie)).body.can_request,false);const retry=(await submit(body,owner.cookie).expect(200)).body;assert.equal(retry.request.status,'EXPIRED');assert.equal(retry.request.expires_at,response.expires_at);
 const active=await grant(owner.email);await database.pool.query('UPDATE access_entitlements SET ends_at=$2 WHERE id=$1',[active,new Date(clock.getTime()+3600000)]);const second=enquiry(owner.profile.id,listing);const pending=(await submit(second,owner.cookie).expect(200)).body.request;clock=new Date(clock.getTime()+3600000);assert.equal((await get('/v1/me/request-access',owner.cookie)).body.can_request,false);assert.equal((await get('/v1/me/contact-requests/'+pending.id,owner.cookie)).body.request.status,'PENDING');await submit({...second,request_key:randomUUID()},owner.cookie).expect(403);
});

test('blocks in either direction, revoked coverage and expired identity prevent new requests',async()=>{
 const {owner,teacher,listing}=await scenario();const coverage=await grant(owner.email);const body=enquiry(owner.profile.id,listing);for(const [from,to] of [[owner.id,teacher.id],[teacher.id,owner.id]]){await database.pool.query('INSERT INTO account_blocks(owner_id,blocked_id) VALUES($1,$2)',[from,to]);await submit(body,owner.cookie).expect(403).expect(r=>assert.equal(r.body.code,'CONTACT_BLOCKED'));await database.pool.query('DELETE FROM account_blocks WHERE owner_id=$1 AND blocked_id=$2',[from,to]);}
 await database.pool.query("UPDATE access_entitlements SET status='REVOKED' WHERE id=$1",[coverage]);await submit(body,owner.cookie).expect(403).expect(r=>assert.equal(r.body.code,'ACCESS_REQUIRED'));await grant(owner.email);await database.pool.query('UPDATE tutor_claims SET expires_at=$2 WHERE user_id=$1',[teacher.id,clock]);await submit(body,owner.cookie).expect(404);
});

test('Guardian current approval and consent authorize the child beneficiary; withdrawal hides stored private enquiry and prevents reuse',async()=>{
 const owner=await fixture(null);const teacher=await tutor();const listing=await publish(teacher);const staff=teacher.reviewer!;const consent={accepted:true,notice_version:'test-notice-v1',consent_version:'test-consent-v1'};const applied=await post('/v1/me/guardian-verifications',{adult_reference:'test-adult-confirmed',authority_reference:'test-authority-confirmed',adult_confirmed:true,consent},owner.cookie).expect(201);await post('/v1/staff/guardian-verifications/'+applied.body.id+'/reviews',{decision:'APPROVE',identifiable_adult_reviewed:true,authority_reviewed:true,reason:'Fictional Guardian authority checked'},staff.cookie).expect(200);const child=(await post('/v1/me/learners/children',{alias:'Fictional child',age_band:'13_15',learning_requirements:'Practice school Physics through examples',consent},owner.cookie).expect(201)).body.profile;await grant(owner.email);const body=enquiry(child.id,listing);const sent=(await submit(body,owner.cookie).expect(200)).body.request;await post('/v1/me/learners/'+child.id+'/consent-withdrawals',{},owner.cookie).expect(200);const detail=(await get('/v1/me/contact-requests/'+sent.id,owner.cookie).expect(200)).body.request;assert.equal(detail.learner_usable,false);assert.equal(detail.learner_alias,null);assert.equal(detail.learning_requirements,null);assert.equal(detail.preferred_times,null);await submit({...body,request_key:randomUUID()},owner.cookie).expect(403);assert.equal((await submit(body,owner.cookie).expect(200)).body.request.learning_requirements,null);
});

test('production rejects fixture coverage and fixture replays, has no grant endpoint and isolated grant helper rejects ordinary databases',async()=>{
 const {owner,listing}=await scenario();await grant(owner.email);const body=enquiry(owner.profile.id,listing);const sent=(await submit(body,owner.cookie).expect(200)).body.request;await assert.rejects(grantContactFixture(database,{...config,mode:'production'},owner.email),/production/);await assert.rejects(grantContactFixture(database,{...config,databaseUrl:'postgres://test_user:unused@127.0.0.1:5433/tutoring_marketplace'},owner.email),/isolated/);await assert.rejects(grantContactFixture(database,config,'real@example.com'),/fictional/);
 await database.pool.query('UPDATE tutor_evidence SET test_only=false');const production={...config,mode:'production' as const,webOrigin:'https://marketplace.example.test',allowedOrigins:['https://marketplace.example.test'],mailTransport:'smtp' as const,guardianMode:'disabled' as const,evidenceScanner:'disabled' as const};const prod=await createApplication(production,database,now);const cookie=owner.cookie.replace('tm_session=','__Host-tm_session=');try{const access=await request(prod.getHttpServer()).get('/v1/me/request-access').set('Cookie',cookie).expect(200);assert.equal(access.body.can_request,false);for(const payload of [body,{...body,request_key:randomUUID()}])await request(prod.getHttpServer()).post('/v1/me/contact-requests').set('Cookie',cookie).set('Origin',production.webOrigin).send(payload).expect(403);await request(prod.getHttpServer()).get('/v1/me/contact-requests/'+sent.id).set('Cookie',cookie).expect(404);assert.equal((await request(prod.getHttpServer()).get('/v1/me/contact-requests').set('Cookie',cookie)).body.requests.length,0);await request(prod.getHttpServer()).post('/v1/dev/request-grants').set('Origin',production.webOrigin).send({}).expect(404);}finally{await prod.close();}
});

test('opposing requests between dual-role participants follow one user lock order and both can complete',async()=>{
 const a=await tutor();const b=await tutor();const first=await publish(a);const second=await publish(b);await post('/v1/me/roles',{roles:['LEARNER','TUTOR']},a.cookie).expect(200);await post('/v1/me/roles',{roles:['LEARNER','TUTOR']},b.cookie).expect(200);const profileFor=async(cookie:string)=>(await post('/v1/me/learners/adult',{alias:'Fictional adult',learning_requirements:'Learn Physics using worked examples',adult_confirmed:true},cookie).expect(201)).body.profile;const pa=await profileFor(a.cookie);const pb=await profileFor(b.cookie);await grant(a.email);await grant(b.email);const replies=await Promise.all([submit(enquiry(pa.id,second),a.cookie),submit(enquiry(pb.id,first),b.cookie)]);assert.deepEqual(replies.map(r=>r.status),[200,200]);
});
