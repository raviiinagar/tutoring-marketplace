import {ensurePublicationPhoto} from "./helpers/publication.js";
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {join,resolve} from 'node:path';
import {readdir,readFile} from 'node:fs/promises';
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
import {NotificationsService} from '../src/notifications.js';
import {teachStopToken} from '../src/teach-reminder-email.js';
before(async()=>{
 const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
 const dir=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/teach_reminders_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(dir,'mail'),EVIDENCE_SCANNER:'test'});
 cluster=await startDatabase(config.databaseUrl,join(dir,'postgres'));db=new Database(config.databaseUrl);
 await migrate(db);app=await createApplication(config,db,now);
});
beforeEach(()=>{clock=new Date();});
after(async()=>{await app?.close();await db?.close();await cluster?.stop();});
async function account(tutor=true){const email=randomUUID()+'@example.test';await post('/v1/auth/registrations',{display_name:'Fictional adult',email,password}).expect(202);const mail=(await db.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0];await post('/v1/auth/verifications',{token:new URL(decrypt<{verification_url:string}>(mail.encrypted_payload,config.authSecret).verification_url).hash.slice(7)}).expect(200);const login=await post('/v1/auth/sessions',{email,password}).expect(200);const a={id:login.body.user.id as string,email,cookie:login.headers['set-cookie'][0] as string};if(tutor)await post('/v1/me/roles',{roles:['TUTOR']},a.cookie).expect(200);return a;}
async function staff(){const a=await account(false);await assignStaff(db,a.email,['TRUST'],'Fictional direct-publication reviewer','test');const enrollment=await post('/v1/staff/mfa/enrollments',{password},a.cookie).expect(200);const confirmation=await post('/v1/staff/mfa/confirmations',{code:totp(enrollment.body.secret,clock)},a.cookie).expect(200);return {...a,cookie:a.cookie.split(';')[0]+'; '+confirmation.headers['set-cookie'][0].split(';')[0]};}
async function intro(a:{cookie:string},extra:Record<string,unknown>={}){const profile=(await post('/v1/me/tutor/introduction',{display_name:'Fictional Physics Tutor',biography,subject_ids:['subject-physics'],hourly_rate_paise:50000,identity_country:'IN',identity_document:'AADHAAR',adult_confirmed:true,public_email_consent:false,replace_identity:false,...extra},a.cookie).expect(200)).body.profile;await ensurePublicationPhoto(post,get,a);return profile;}

const DAY=86400000;
const pending=async(id:string)=>(await db.pool.query("SELECT template,status,available_at,last_error FROM notification_outbox WHERE recipient_id=$1 AND category='TEACHING' ORDER BY template",[id])).rows;
async function drain(){const worker=app.get(NotificationsService);for(let i=0;i<10;i++)if(!(await worker.tick()))break;}
async function mails(to:string){const dir=config.mailDir;let names:string[]=[];try{names=await readdir(dir);}catch{return [];}
 const out=[];for(const name of names){const m=JSON.parse(await readFile(join(dir,name),'utf8'));if(m.to===to&&m.subject&&m.notification_url)out.push(m);}return out;}

test('choosing to teach schedules two reminders; they offer both ways and stop once an ad is online',async()=>{
 const a=await account();
 const queued=await pending(a.id);assert.deepEqual(queued.map((r:{template:string})=>r.template),['TEACH_REMINDER_1','TEACH_REMINDER_2']);
 const delays=queued.map((r:{available_at:Date})=>Math.round((new Date(r.available_at).getTime()-Date.now())/DAY));assert.deepEqual(delays,[1,7]);
 // Nothing goes out before the first day.
 clock=new Date(Date.now()+3600000);await drain();assert.equal((await mails(a.email)).length,0);
 clock=new Date(Date.now()+2*DAY);await drain();
 const [first]=await mails(a.email);assert.ok(first,'reminder 1 was sent');
 assert.equal(first.subject,'Your Tutor ad is one step away');
 // The team option opens the site's team form (request and consent recorded), never WhatsApp or email directly.
 assert.ok(first.text.includes('1. Send your details to our team. We create the ad for you.\n   '+origin+'/tutor?way=team'));
 assert.doesNotMatch(first.text,/wa\.me|WhatsApp|mailto:/);
 assert.match(first.text,new RegExp('2\\. Create it yourself in one short form\\.\\n   '+origin+'/tutor'));
 assert.match(first.text,/Stop these reminders:\nhttp:\/\/localhost:3000\/reminders\/stop#token=[\w.-]+/);
 assert.ok(!first.text.includes('[['),'every placeholder is filled');
 assert.match(first.html,/Hi Fictional,/);assert.ok(first.html.includes('href="'+origin+'/tutor?way=team"'));assert.match(first.html,/>Send to our team</);assert.doesNotMatch(first.html,/wa\.me|mailto:/);
 assert.match(first.html,/>Create my ad</);assert.match(first.html,/>Stop these reminders</);
 // Once an ad is online the second reminder is withheld.
 await intro(a);const draft=(await post('/v1/me/listings',offer,a.cookie).expect(201)).body.listing;await post('/v1/me/listings/'+draft.id+'/actions/PUBLISH',{revision:draft.revision},a.cookie).expect(200);
 clock=new Date(Date.now()+8*DAY);await drain();
 assert.equal((await mails(a.email)).length,1);
 const second=(await pending(a.id)).find((r:{template:string})=>r.template==='TEACH_REMINDER_2');assert.equal(second.status,'SUPPRESSED');assert.equal(second.last_error,'ALREADY_TEACHING');
});

test('accounts that only learn never get reminders, and each account gets them at most once',async()=>{
 const learner=await account(false);await post('/v1/me/roles',{roles:['LEARNER']},learner.cookie).expect(200);
 assert.deepEqual(await pending(learner.id),[]);
 const t=await account();
 await post('/v1/me/roles',{roles:['LEARNER']},t.cookie).expect(200);await post('/v1/me/roles',{roles:['TUTOR']},t.cookie).expect(200);
 assert.equal((await pending(t.id)).length,2,'switching back to Teach does not queue new reminders');
 // Someone who goes back to learning only is not reminded.
 await post('/v1/me/roles',{roles:['LEARNER']},t.cookie).expect(200);
 clock=new Date(Date.now()+8*DAY);await drain();
 assert.deepEqual((await pending(t.id)).map((r:{status:string;last_error:string})=>r.status+':'+r.last_error),['SUPPRESSED:NOT_TEACHING','SUPPRESSED:NOT_TEACHING']);
});

test('the signed stop link and the email setting both turn reminders off',async()=>{
 const a=await account();
 const token=teachStopToken(config.authSecret,a.id);
 await post('/v1/me/teach-reminders/stop',{token:token.slice(0,-2)+'xx'}).expect(400);
 await post('/v1/me/teach-reminders/stop',{token:teachStopToken('wrong-secret',a.id)}).expect(400);
 assert.deepEqual((await post('/v1/me/teach-reminders/stop',{token}).expect(200)).body,{stopped:true});
 assert.ok((await pending(a.id)).every((r:{status:string})=>r.status==='SUPPRESSED'));
 const prefs=(await get('/v1/me/notification-preferences',a.cookie).expect(200)).body.preferences;assert.equal(prefs.teaching_reminder_email,false);
 // Saving other preferences (older clients send no teaching field) keeps the choice.
 const base={enquiry_email:true,chat_email:false,availability_email:true,marketing_email:false,notice_version:'notification-preferences-v1'};
 await post('/v1/me/notification-preferences',base,a.cookie).expect(200);
 assert.equal((await get('/v1/me/notification-preferences',a.cookie).expect(200)).body.preferences.teaching_reminder_email,false);
 assert.equal((await post('/v1/me/notification-preferences',{...base,teaching_reminder_email:true},a.cookie).expect(200)).body.preferences.teaching_reminder_email,true);
});
