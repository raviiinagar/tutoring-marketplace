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
const pdf=(extra='')=>({media_type:'application/pdf',data:Buffer.from('%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE '+extra+'\n%%EOF\n').toString('base64')});
async function tutor(){const user=await fixture(null);await post('/v1/me/roles',{roles:['TUTOR']},user.cookie).expect(200);await post('/v1/me/tutor',profile,user.cookie).expect(200);return user;}
async function trusted(){const user=await fixture(['TRUST']);return {...user,baseCookie:user.cookie,...await enroll(user.cookie)};}
async function pending(){const user=await tutor();const claims=[];for(const kind of ['IDENTITY','QUALIFICATION']){const file=await post('/v1/me/tutor/evidence',pdf(),user.cookie).expect(201);const result=await post('/v1/me/tutor/claims',{kind,description:'Fictional '+kind+' document reviewed for Physics',evidence_id:file.body.evidence.id,...(kind==='IDENTITY'?{}:{subject_id:'subject-physics'})},user.cookie).expect(201);claims.push(result.body.claims.at(-1));}await post('/v1/me/tutor/submissions',{},user.cookie).expect(200);return {user,claims};}
const approval=()=>({outcome:'APPROVE',checked_item:'Document and subject claim checked',reason:'Review fictional Tutor evidence',adult_identity_confirmed:true,expires_at:new Date(clock.getTime()+86400000).toISOString()});
test('adult age boundary and private profile revisions reject children, invalid dates and overposting',async()=>{
  assert.equal(isAdult('2008-10-11',new Date('2026-10-11T00:00:00Z')),true);assert.equal(isAdult('2008-10-12',new Date('2026-10-11T00:00:00Z')),false);assert.equal(isAdult('2000-02-30',clock),false);
  const user=await fixture(null);await post('/v1/me/tutor',profile,user.cookie).expect(403);await post('/v1/me/roles',{roles:['TUTOR']},user.cookie).expect(200);
  for(const change of [{birth_date:'2020-01-01'},{birth_date:'1990-02-30'},{adult_confirmed:false},{owner_id:randomUUID()},{biography:'short'}])await post('/v1/me/tutor',{...profile,...change},user.cookie).expect(400);
  const saved=await post('/v1/me/tutor',profile,user.cookie).expect(200);assert.equal(saved.body.profile.revision,1);await get('/v1/me/tutor').expect(401);await get('/v1/tutors/'+user.id).expect(404);
  const stored=(await database.pool.query('SELECT * FROM tutor_profiles WHERE user_id=$1',[user.id])).rows[0];assert.ok(!JSON.stringify(stored).includes(profile.birth_date));assert.equal(decrypt<{birth_date:string}>(stored.encrypted_birth_date,config.authSecret).birth_date,profile.birth_date);
});
test('uploads enforce formats, size, malicious/scan-error quarantine and cross-account ownership',async()=>{
  const owner=await tutor(),other=await tutor();
  for(const body of [{media_type:'text/html',data:pdf().data},{media_type:'image/png',data:pdf().data},pdf('/JavaScript'),{...pdf(),data:'not base64'}, {...pdf(),owner_id:other.id}])await post('/v1/me/tutor/evidence',body,owner.cookie).expect(400);
  await post('/v1/me/tutor/evidence',{...pdf(),data:Buffer.alloc(1048577).toString('base64')},owner.cookie).expect(400);
  const bad=await post('/v1/me/tutor/evidence',pdf('MALICIOUS-FIXTURE'),owner.cookie).expect(201);assert.equal(bad.body.evidence.scan_status,'REJECTED');
  const error=await post('/v1/me/tutor/evidence',pdf('SCAN-ERROR-FIXTURE'),owner.cookie).expect(201);assert.equal(error.body.evidence.scan_status,'ERROR');
  const clean=await post('/v1/me/tutor/evidence',pdf(),owner.cookie).expect(201);assert.equal(clean.body.evidence.scan_status,'CLEAN');assert.ok(!JSON.stringify(clean.body).includes(pdf().data));
  for(const id of [bad.body.evidence.id,error.body.evidence.id,clean.body.evidence.id])await post('/v1/me/tutor/claims',{kind:'IDENTITY',description:'Own identity document',evidence_id:id},other.cookie).expect(400);
  for(const id of [bad.body.evidence.id,error.body.evidence.id])await post('/v1/me/tutor/claims',{kind:'IDENTITY',description:'Own identity document',evidence_id:id},owner.cookie).expect(400);
  await del('/v1/me/tutor/evidence/'+clean.body.evidence.id,other.cookie).expect(404);
  const operator=await trusted();await post('/v1/staff/tutor-evidence/'+bad.body.evidence.id+'/download-grants',{reason:'Inspect rejected fixture document'},operator.cookie).expect(404);
  await database.pool.query("UPDATE tutor_evidence SET scan_status='QUARANTINED' WHERE id=$1",[clean.body.evidence.id]);await post('/v1/me/tutor/claims',{kind:'IDENTITY',description:'Own identity document',evidence_id:clean.body.evidence.id},owner.cookie).expect(400);
  await del('/v1/me/tutor/evidence/'+clean.body.evidence.id,owner.cookie).expect(204);assert.equal((await database.pool.query('SELECT encrypted_payload FROM tutor_evidence WHERE id=$1',[clean.body.evidence.id])).rows[0].encrypted_payload,null);
});
test('claim submission requires separate identity and active Subject evidence and limits uploads',async()=>{
  const user=await tutor();await post('/v1/me/tutor/submissions',{},user.cookie).expect(400);
  const file=(await post('/v1/me/tutor/evidence',pdf(),user.cookie).expect(201)).body.evidence.id;
  for(const body of [{kind:'IDENTITY',subject_id:'subject-physics'},{kind:'QUALIFICATION',subject_id:'exam-jee'},{kind:'QUALIFICATION'}])await post('/v1/me/tutor/claims',{...body,description:'Fictional claimed identity',evidence_id:file},user.cookie).expect(400);
  await post('/v1/me/tutor/claims',{kind:'IDENTITY',description:'Fictional claimed identity',evidence_id:file},user.cookie).expect(201);
  await post('/v1/me/tutor/claims',{kind:'IDENTITY',description:'Fictional claimed identity',evidence_id:file},user.cookie).expect(409);
  await post('/v1/me/tutor/submissions',{},user.cookie).expect(400);await del('/v1/me/tutor/evidence/'+file,user.cookie).expect(409);
  for(let i=1;i<12;i++)await post('/v1/me/tutor/evidence',pdf(),user.cookie).expect(201);await post('/v1/me/tutor/evidence',pdf(),user.cookie).expect(429);
});
test('private reviews and one-use downloads require Trust MFA, binding, purpose, scan and current revision',async()=>{
  const {user,claims}=await pending();const operator=await trusted();const support=await fixture(['SUPPORT']);const mfa=await enroll(support.cookie);
  await get('/v1/staff/tutors').expect(401);await get('/v1/staff/tutors',user.cookie).expect(403);await get('/v1/staff/tutors',mfa.cookie).expect(403);await get('/v1/staff/tutors',operator.staffCookie).expect(401);
  await post('/v1/staff/tutors/'+user.id+'/inspections',{reason:'Review fictional Tutor evidence'},operator.cookie).expect(200).expect(r=>assert.equal(r.body.profile.birth_date,profile.birth_date));
  const file=claims[0].evidence_id;const grant=(await post('/v1/staff/tutor-evidence/'+file+'/download-grants',{reason:'Review fictional Tutor evidence'},operator.cookie).expect(200)).body;
  await post('/v1/staff/tutor-evidence/downloads',{token:grant.token},mfa.cookie).expect(403);await post('/v1/staff/tutor-evidence/downloads',{token:grant.token},operator.baseCookie).expect(403);
  const responses=await Promise.all([post('/v1/staff/tutor-evidence/downloads',{token:grant.token},operator.cookie),post('/v1/staff/tutor-evidence/downloads',{token:grant.token},operator.cookie)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,403]);assert.match(responses.find(r=>r.status===200)!.headers['content-disposition'],/^attachment;/);
  const expired=(await post('/v1/staff/tutor-evidence/'+file+'/download-grants',{reason:'Review fictional Tutor evidence'},operator.cookie).expect(200)).body;clock=new Date(clock.getTime()+60000);await post('/v1/staff/tutor-evidence/downloads',{token:expired.token},operator.cookie).expect(403);
  const stale=(await post('/v1/staff/tutor-evidence/'+file+'/download-grants',{reason:'Review fictional Tutor evidence'},operator.cookie).expect(200)).body;
  const race=await Promise.all([post('/v1/me/tutor',{...profile,biography:profile.biography+' Updated.'},user.cookie),post('/v1/staff/tutor-evidence/downloads',{token:stale.token},operator.cookie)]);assert.equal(race[0].status,200);assert.ok([200,403].includes(race[1].status));await post('/v1/staff/tutor-evidence/downloads',{token:stale.token},operator.cookie).expect(403);
  const audits=(await database.pool.query("SELECT * FROM audit_events WHERE event_type LIKE 'TUTOR_%'")).rows;assert.ok(audits.some(r=>r.event_type==='TUTOR_EVIDENCE_DOWNLOADED'&&r.user_id===operator.id&&r.metadata.target===file));assert.ok(!JSON.stringify(audits).includes(grant.token));assert.ok(!JSON.stringify(audits).includes(profile.birth_date));
});
test('specific approvals expire, corrections revise claims and revocation blocks publication eligibility',async()=>{
  const {user,claims}=await pending();const operator=await trusted();
  await post('/v1/staff/tutor-claims/'+claims[0].id+'/reviews',{...approval(),adult_identity_confirmed:false},operator.cookie).expect(400);
  await post('/v1/staff/tutor-claims/'+claims[0].id+'/reviews',{...approval(),expires_at:clock.toISOString()},operator.cookie).expect(400);
  for(const claim of claims)await post('/v1/staff/tutor-claims/'+claim.id+'/reviews',approval(),operator.cookie).expect(200);
  const approved=await get('/v1/me/tutor',user.cookie).expect(200);assert.equal(approved.body.profile.status,'APPROVED');assert.equal(approved.body.profile.eligible,true);
  const service=new TutorsService(database,config,new AuthService(database,config,now),new StaffService(database,config,new AuthService(database,config,now),now),new TestEvidenceScanner(),now);
  await database.transaction(c=>service.requireQualified(c,user.id,'subject-physics'));await assert.rejects(database.transaction(c=>service.requireQualified(c,user.id,'subject-mathematics')));
  clock=new Date(clock.getTime()+86400000);assert.equal((await get('/v1/me/tutor',user.cookie)).body.profile.eligible,false);clock=new Date(clock.getTime()-86400000);
  await post('/v1/staff/tutor-claims/'+claims[1].id+'/reviews',{...approval(),outcome:'REVOKE'},operator.cookie).expect(200);assert.equal((await get('/v1/me/tutor',user.cookie)).body.profile.eligible,false);await assert.rejects(database.transaction(c=>service.requireQualified(c,user.id,'subject-physics')));
  await post('/v1/me/tutor',profile,user.cookie).expect(200).expect(r=>{assert.equal(r.body.profile.status,'DRAFT');assert.equal(r.body.claims.length,0);assert.equal(r.body.profile.revision,2);});
  await post('/v1/staff/tutor-claims/'+claims[0].id+'/reviews',{...approval(),outcome:'REVOKE'},operator.cookie).expect(409);
  const correction=await pending();await post('/v1/staff/tutor-claims/'+correction.claims[1].id+'/reviews',{...approval(),outcome:'CHANGES_REQUESTED'},operator.cookie).expect(200).expect(r=>assert.equal(r.body.profile.status,'CHANGES_REQUESTED'));
  await post('/v1/me/tutor/claims',{kind:'IDENTITY',description:'Correction claim evidence',evidence_id:correction.claims[0].evidence_id},correction.user.cookie).expect(409);
  await assignStaff(database,user.email,['TRUST'],'Check self-review prevention','test operator');const self=await enroll(user.cookie);await post('/v1/staff/tutors/'+user.id+'/inspections',{reason:'Inspect own Tutor evidence'},self.cookie).expect(403);
});
test('production refuses test scanner configuration/adapters and disabled uploads fail closed',async()=>{
  const env={...productionPrivacyFixture(),NODE_ENV:'production',DATABASE_URL:config.databaseUrl,AUTH_SECRET:config.authSecret,WEB_ORIGIN:'https://example.test',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',SMTP_FROM:'test@example.test'};
  assert.throws(()=>loadConfig({...env,EVIDENCE_SCANNER:'test'}));assert.throws(()=>loadConfig({...env,EVIDENCE_SCANNER:'clamav'}));
  const production=loadConfig(env);await assert.rejects(createApplication(production,database,now,undefined,new TestEvidenceScanner()));
  const disabled=await createApplication({...config,evidenceScanner:'disabled'},database,now);try{await request(disabled.getHttpServer()).post('/v1/me/tutor/evidence').set('Origin',origin).send(pdf()).expect(503);}finally{await disabled.close();}
});
test('ClamAV adapter streams framed bytes and fails closed on FOUND and ERROR responses',async()=>{
  for(const [reply,expected] of [['stream: OK\0','CLEAN'],['stream: Eicar-Signature FOUND\0','REJECTED'],['stream: scan failed ERROR\0','ERROR'],['stream: OK\0stream: Extra FOUND\0','ERROR'],['stream: OK','ERROR']] as const){let received=Buffer.alloc(0);const bytes=Buffer.from(pdf().data,'base64');
    const server=createServer(socket=>{socket.on('data',chunk=>{received=Buffer.concat([received,chunk]);if(received.length>=10+4+bytes.length+4){assert.equal(received.subarray(0,10).toString(),'zINSTREAM\0');assert.equal(received.readUInt32BE(10),bytes.length);assert.deepEqual(received.subarray(14,14+bytes.length),bytes);socket.write(reply.slice(0,5));socket.end(reply.slice(5));}});});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));try{assert.equal(await new ClamAvScanner('127.0.0.1',(server.address() as {port:number}).port).scan(bytes),expected);}finally{await new Promise<void>(r=>server.close(()=>r()));}
  }
});
