import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {join,resolve} from 'node:path';
import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {createApplication} from '../src/app.js';
import {loadConfig,type Config} from '../src/config.js';
import {Database,migrate} from '../src/database.js';
import {decrypt,encrypt} from '../src/security.js';
// @ts-expect-error Existing isolated PostgreSQL helper.
import {startDatabase} from '../../../scripts/postgres.mjs';

let app:INestApplication,db:Database,config:Config,cluster:Awaited<ReturnType<typeof startDatabase>>;
const origin='http://localhost:3000',password='Fictional-profile-password-321!';
const post=(path:string,body:unknown,cookie?:string)=>{const r=request(app.getHttpServer()).post(path).set('Origin',origin).send(body);return cookie?r.set('Cookie',cookie):r;};
before(async()=>{
 const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
 const dir=resolve('.local/tests',randomUUID());config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/account_profile_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(dir,'mail')});
 cluster=await startDatabase(config.databaseUrl,join(dir,'postgres'));db=new Database(config.databaseUrl);await migrate(db);app=await createApplication(config,db);
});
after(async()=>{await app?.close();await db?.close();await cluster?.stop();});
async function account(){const email=randomUUID()+'@example.test';await post('/v1/auth/registrations',{display_name:'Fictional learner',email,password}).expect(202);const mail=(await db.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0];await post('/v1/auth/verifications',{token:new URL(decrypt<{verification_url:string}>(mail.encrypted_payload,config.authSecret).verification_url).hash.slice(7)}).expect(200);const signed=await post('/v1/auth/sessions',{email,password}).expect(200);return {id:signed.body.user.id as string,email,cookie:signed.headers['set-cookie'][0] as string};}

test('account name saves on the authenticated identity, persists and keeps Tutor and security facts separate',async()=>{
 const owner=await account(),other=await account();
 await db.pool.query("INSERT INTO tutor_profiles(user_id,display_name,biography,encrypted_birth_date,status) VALUES($1,'Separate public Tutor name','Separate teaching introduction',$2,'DRAFT')",[owner.id,encrypt({birth_date:null},config.authSecret)]);
 const before=(await db.pool.query('SELECT email,password_hash,roles,email_verified_at FROM users WHERE id=$1',[owner.id])).rows[0];
 const changed=await post('/v1/me/profile',{display_name:'  Fictional updated learner  '},owner.cookie).expect(200);
 assert.equal(changed.body.user.id,owner.id);assert.equal(changed.body.user.display_name,'Fictional updated learner');assert.equal(changed.body.user.email,owner.email);assert.equal(changed.body.user.email_verified,true);assert.ok(!JSON.stringify(changed.body).includes('password_hash'));
 await request(app.getHttpServer()).get('/v1/me').set('Cookie',owner.cookie).expect(200).expect(r=>assert.equal(r.body.user.display_name,'Fictional updated learner'));
 assert.deepEqual((await db.pool.query('SELECT email,password_hash,roles,email_verified_at FROM users WHERE id=$1',[owner.id])).rows[0],before);
 assert.equal((await db.pool.query('SELECT display_name FROM users WHERE id=$1',[other.id])).rows[0].display_name,'Fictional learner');
 assert.deepEqual((await db.pool.query('SELECT display_name,status FROM tutor_profiles WHERE user_id=$1',[owner.id])).rows[0],{display_name:'Separate public Tutor name',status:'DRAFT'});
 await post('/v1/me/profile',{display_name:'Fictional updated learner'},owner.cookie).expect(200);
 const events=(await db.pool.query("SELECT metadata FROM audit_events WHERE user_id=$1 AND event_type='ACCOUNT_PROFILE_UPDATED'",[owner.id])).rows;
 assert.equal(events.length,1);assert.deepEqual(events[0].metadata,{fields:['display_name']});assert.ok(!JSON.stringify(events).includes('Fictional updated learner'));
});

test('name bounds and strict request shape prevent changing another account or security fields',async()=>{
 const owner=await account();
 for(const body of [{},{display_name:''},{display_name:' '},{display_name:'x'},{display_name:'x'.repeat(81)},{display_name:1},{display_name:'Valid name',user_id:randomUUID()},{display_name:'Valid name',email:'replace@example.test'},{display_name:'Valid name',roles:['TUTOR']}])await post('/v1/me/profile',body,owner.cookie).expect(400);
 await post('/v1/me/profile',{display_name:'Li'},owner.cookie).expect(200);await post('/v1/me/profile',{display_name:'x'.repeat(80)},owner.cookie).expect(200);
});

test('profile updates require current authenticated session and the allowed request origin',async()=>{
 const owner=await account();
 await post('/v1/me/profile',{display_name:'Valid name'}).expect(401);
 await request(app.getHttpServer()).post('/v1/me/profile').set('Cookie',owner.cookie).send({display_name:'Valid name'}).expect(403);
 await request(app.getHttpServer()).post('/v1/me/profile').set('Cookie',owner.cookie).set('Origin','https://unrelated.example').send({display_name:'Valid name'}).expect(403);
 await db.pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1',[owner.id]);
 await post('/v1/me/profile',{display_name:'Valid name'},owner.cookie).expect(401);
 const disabled=await account();await db.pool.query("UPDATE users SET status='DISABLED' WHERE id=$1",[disabled.id]);await post('/v1/me/profile',{display_name:'Valid name'},disabled.cookie).expect(401);
 assert.equal((await db.pool.query('SELECT display_name FROM users WHERE id=$1',[owner.id])).rows[0].display_name,'Fictional learner');
});
