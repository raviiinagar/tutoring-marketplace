import {productionPrivacyFixture} from './privacy-fixture.js';
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {join,resolve} from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import request from 'supertest';
import type {INestApplication} from '@nestjs/common';
import {createApplication} from '../src/app.js';
import {loadConfig,type Config} from '../src/config.js';
import {Database,migrate} from '../src/database.js';
import {MailWorker} from '../src/mail.js';
import {decrypt,tokenHash} from '../src/security.js';
// @ts-expect-error Local JavaScript development helper intentionally has no declaration.
import {startDatabase} from '../../../scripts/postgres.mjs';

let app:INestApplication;let database:Database;let cluster:Awaited<ReturnType<typeof startDatabase>>;let config:Config;
let clock=new Date();const now=()=>clock;
const password='Eight123';const origin='http://localhost:3000';
const post=(path:string,body:unknown)=>request(app.getHttpServer()).post(path).set('Origin',origin).send(body);
async function register(email:string){return post('/v1/auth/registrations',{display_name:'Test learner',email,password}).expect(202);}
async function getToken(email:string){const result=await database.pool.query('SELECT encrypted_payload FROM mail_outbox m JOIN users u ON u.id=m.user_id WHERE u.email=$1 ORDER BY m.created_at DESC,m.id DESC',[email]);return new URL(decrypt<{verification_url:string}>(result.rows[0].encrypted_payload,config.authSecret).verification_url).hash.slice(7);}
before(async()=>{
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  const directory=resolve('.local/tests',randomUUID());
  config=loadConfig({NODE_ENV:'test',DATABASE_URL:`postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/identity_test`,AUTH_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:join(directory,'mail')});
  cluster=await startDatabase(config.databaseUrl,join(directory,'postgres'));database=new Database(config.databaseUrl);await migrate(database);await migrate(database);app=await createApplication(config,database,now);
});
after(async()=>{await app?.close();await database?.close();await cluster?.stop();});
test('development accepts loopback aliases but still rejects unrelated origins',async()=>{
  const devConfig=loadConfig({NODE_ENV:'development',DATABASE_URL:config.databaseUrl,AUTH_SECRET:config.authSecret,WEB_ORIGIN:origin,ALLOWED_ORIGINS:origin,MAIL_TRANSPORT:'capture',DEV_MAIL_DIR:config.mailDir});
  const devApp=await createApplication(devConfig,database,now);
  try{
    await request(devApp.getHttpServer()).post('/v1/auth/registrations').set('Origin','http://127.0.0.1:3000').send({display_name:'Local alias',email:'alias@example.test',password}).expect(202);
    await request(devApp.getHttpServer()).post('/v1/auth/registrations').set('Origin','http://127.0.0.1:9999').send({}).expect(403);
    await request(devApp.getHttpServer()).post('/v1/auth/registrations').set('Origin','https://evil.example').send({}).expect(403);
  }finally{await devApp.close();}
  await database.pool.query("UPDATE mail_outbox SET status='EXPIRED' WHERE user_id=(SELECT id FROM users WHERE email='alias@example.test')");
});
test('verified account journey, secure storage, cookie authentication and revocation',async()=>{
  const email='journey@example.test';await post('/v1/auth/registrations',{display_name:'Test learner',email,password:'seven77'}).expect(400);await register(email);
  await post('/v1/auth/sessions',{email,password}).expect(403).expect(r=>assert.equal(r.body.code,'EMAIL_NOT_VERIFIED'));
  const token=await getToken(email);
  const stored=(await database.pool.query('SELECT password_hash FROM users WHERE email=$1',[email])).rows[0].password_hash;
  assert.match(stored,/^scrypt\$/);assert.ok(!stored.includes(password));
  const outbox=(await database.pool.query('SELECT encrypted_payload FROM mail_outbox')).rows;
  assert.ok(!JSON.stringify(outbox).includes(token));
  assert.equal(await new MailWorker(database,config,now).tick(),true);
  const files=await readdir(config.mailDir);const captured=JSON.parse(await readFile(join(config.mailDir,files[0]),'utf8'));
  assert.equal(captured.development_only,true);assert.equal(captured.to,email);
  await request(app.getHttpServer()).get('/dev/mail').expect(200);
  await post('/v1/auth/verifications',{token}).expect(200);
  await post('/v1/auth/verifications',{token}).expect(400);
  const signed=await post('/v1/auth/sessions',{email,password}).expect(200);
  const cookie=signed.headers['set-cookie'][0];assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);assert.ok(!('password_hash' in signed.body.user));
  const raw=cookie.split(';')[0].split('=')[1];
  assert.equal((await database.pool.query('SELECT token_hash FROM sessions')).rows[0].token_hash,tokenHash(raw));
  await request(app.getHttpServer()).get('/v1/me').set('Cookie',cookie).expect(200).expect(r=>assert.equal(r.body.user.email,email));
  await request(app.getHttpServer()).delete('/v1/auth/sessions/current').set('Cookie',cookie).set('Origin',origin).send({}).expect(204);
  await request(app.getHttpServer()).get('/v1/me').set('Cookie',cookie).expect(401);
});
test('invalid, malformed, expired tokens and recovery with a fresh email',async()=>{
  await post('/v1/auth/verifications',{token:'malformed'}).expect(400);
  await post('/v1/auth/verifications',{token:randomBytes(32).toString('base64url')}).expect(400);
  const email='expiry@example.test';await register(email);const token=await getToken(email);
  clock=new Date(clock.getTime()+15*60_000);
  await post('/v1/auth/verifications',{token}).expect(400);
  await post('/v1/auth/verification-emails',{email}).expect(202);const fresh=await getToken(email);assert.notEqual(fresh,token);
  await post('/v1/auth/verifications',{token:fresh}).expect(200);
});
test('concurrent verification consumes one token once',async()=>{
  const email='race@example.test';await register(email);const token=await getToken(email);
  const responses=await Promise.all([post('/v1/auth/verifications',{token}),post('/v1/auth/verifications',{token})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);
});
test('private access, session expiry and disabled accounts',async()=>{
  await request(app.getHttpServer()).get('/v1/me').expect(401);
  await post('/v1/auth/sessions',{email:'missing@example.test',password}).expect(401);
  const email='session@example.test';await register(email);await post('/v1/auth/verifications',{token:await getToken(email)}).expect(200);
  await post('/v1/auth/sessions',{email,password:'incorrect-password'}).expect(401);
  const signed=await post('/v1/auth/sessions',{email,password}).expect(200);const cookie=signed.headers['set-cookie'][0];
  await database.pool.query("UPDATE users SET status='DISABLED' WHERE email=$1",[email]);
  await request(app.getHttpServer()).get('/v1/me').set('Cookie',cookie).expect(401);
  await post('/v1/auth/sessions',{email,password}).expect(401);
  await database.pool.query("UPDATE users SET status='ACTIVE' WHERE email=$1",[email]);
  clock=new Date(clock.getTime()+7*24*60*60_000);
  await request(app.getHttpServer()).get('/v1/me').set('Cookie',cookie).expect(401);
});
test('rate limits, duplicate signup and strict request/origin validation',async()=>{
  const email='limits@example.test';await register(email);await register(email);await register(email);
  assert.equal((await database.pool.query('SELECT count(*) FROM users WHERE email=$1',[email])).rows[0].count,'1');
  assert.equal((await database.pool.query('SELECT count(*) FROM mail_outbox m JOIN users u ON u.id=m.user_id WHERE email=$1',[email])).rows[0].count,'1');
  await post('/v1/auth/registrations',{display_name:'Test',email,password}).expect(429);
  await post('/v1/auth/registrations',{display_name:'Test',email:'extra@example.test',password,role:'ADMIN'}).expect(400);
  await request(app.getHttpServer()).post('/v1/auth/registrations').send({}).expect(403);
  await request(app.getHttpServer()).post('/v1/auth/registrations').set('Origin','https://evil.example').send({}).expect(403);
  await request(app.getHttpServer()).post('/v1/auth/registrations').set('Origin',origin).set('Content-Type','text/plain').send('hello').expect(415);
  await post('/v1/auth/registrations',{display_name:'T',email:'bad',password:'seven77'}).expect(400);
});
test('production refuses capture/missing secrets and does not expose development mail',async()=>{
  const base={...productionPrivacyFixture(),NODE_ENV:'production',DATABASE_URL:config.databaseUrl,AUTH_SECRET:config.authSecret,WEB_ORIGIN:'https://tutoring.example'};
  assert.throws(()=>loadConfig(base),/Production requires SMTP/);
  assert.throws(()=>loadConfig({...base,AUTH_SECRET:'CHANGE_ME'}),/AUTH_SECRET/);
  assert.throws(()=>loadConfig({...base,MAIL_TRANSPORT:'smtp'}),/SMTP host/);
  assert.throws(()=>loadConfig({...base,MAIL_TRANSPORT:'smtp',WEB_ORIGIN:'http://tutoring.example'}),/HTTPS/);
  const production=loadConfig({...base,MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'test',SMTP_PASSWORD:'not-live',SMTP_FROM:'accounts@example.test'});
  const localProduction=loadConfig({...base,WEB_ORIGIN:'https://localhost:3000',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'test',SMTP_PASSWORD:'not-live',SMTP_FROM:'accounts@example.test'});
  assert.deepEqual(localProduction.allowedOrigins,['https://localhost:3000']);
  const productionApp=await createApplication(production,database,now);
  try{await request(productionApp.getHttpServer()).get('/dev/mail').expect(404);
    const signed=await request(productionApp.getHttpServer()).post('/v1/auth/sessions').set('Origin',production.webOrigin).send({email:'race@example.test',password}).expect(200);
    assert.match(signed.headers['set-cookie'][0],/__Host-tm_session=/);assert.match(signed.headers['set-cookie'][0],/Secure/);
  }finally{await productionApp.close();}
});
test('worker retries invalid ciphertext and expires old undelivered mail',async()=>{
  const email='retry@example.test';await register(email);
  await database.pool.query("UPDATE mail_outbox SET status='EXPIRED' WHERE user_id NOT IN (SELECT id FROM users WHERE email=$1) AND status IN ('PENDING','PROCESSING')",[email]);
  await database.pool.query("UPDATE mail_outbox SET encrypted_payload='{}'::jsonb WHERE user_id=(SELECT id FROM users WHERE email=$1)",[email]);
  await new MailWorker(database,config,now).tick();
  let row=(await database.pool.query('SELECT status,attempts,last_error_code FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0];
  assert.equal(row.status,'PENDING');assert.equal(row.attempts,1);assert.equal(row.last_error_code,'MAIL_DELIVERY_FAILED');
  clock=new Date(clock.getTime()+15*60_000);await new MailWorker(database,config,now).tick();
  row=(await database.pool.query('SELECT status FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0];assert.equal(row.status,'EXPIRED');
});
test('roles stay on one identity, deny staff grants and audit without secrets',async()=>{
  const email='roles@example.test';await register(email);await post('/v1/auth/verifications',{token:await getToken(email)}).expect(200);
  const login=await post('/v1/auth/sessions',{email,password}).expect(200);const cookie=login.headers['set-cookie'][0];
  const roles=(body:unknown)=>post('/v1/me/roles',body).set('Cookie',cookie);
  await roles({roles:['LEARNER','TUTOR']}).expect(200).expect(r=>{assert.equal(r.body.user.id,login.body.user.id);assert.deepEqual(r.body.user.roles,['LEARNER','TUTOR']);});
  await roles({roles:['ADMIN']}).expect(400);await roles({roles:['LEARNER'],staff:true}).expect(400);
  await roles({roles:[]}).expect(400);await roles({roles:['TUTOR','TUTOR']}).expect(400);
  await roles({roles:['TUTOR']}).expect(200);
  await register(email);
  assert.equal((await database.pool.query('SELECT count(*) FROM users WHERE email=$1',[email])).rows[0].count,'1');
  const audit=(await database.pool.query("SELECT metadata FROM audit_events WHERE user_id=$1 AND event_type='ACCOUNT_ROLES_CHANGED'",[login.body.user.id])).rows;
  assert.equal(audit.length,2);assert.ok(!JSON.stringify(audit).includes(password));
  await database.pool.query("UPDATE users SET status='DISABLED' WHERE email=$1",[email]);
  await roles({roles:['LEARNER']}).expect(401);
  await request(app.getHttpServer()).get('/v1/auth/sessions').set('Cookie',cookie).expect(401);
});
test('session inventory and revocation enforce ownership and current access',async()=>{
  const email='devices@example.test';await register(email);await post('/v1/auth/verifications',{token:await getToken(email)}).expect(200);
  const first=(await post('/v1/auth/sessions',{email,password}).expect(200)).headers['set-cookie'][0];
  const second=(await post('/v1/auth/sessions',{email,password}).expect(200)).headers['set-cookie'][0];
  const listed=await request(app.getHttpServer()).get('/v1/auth/sessions').set('Cookie',first).expect(200);
  assert.equal(listed.body.sessions.length,2);assert.equal(listed.body.sessions.filter((s:any)=>s.current).length,1);assert.ok(!JSON.stringify(listed.body).includes('token_hash'));
  const own=listed.body.sessions.find((s:any)=>s.current).id;const other=listed.body.sessions.find((s:any)=>!s.current).id;
  const foreign=(await post('/v1/auth/sessions',{email:'race@example.test',password}).expect(200)).headers['set-cookie'][0];
  await request(app.getHttpServer()).delete('/v1/auth/sessions/by-id/'+other).set('Cookie',foreign).set('Origin',origin).send({}).expect(404);
  await request(app.getHttpServer()).delete('/v1/auth/sessions/by-id/'+other).set('Cookie',first).set('Origin',origin).send({}).expect(204);
  await request(app.getHttpServer()).get('/v1/me').set('Cookie',second).expect(401);
  await post('/v1/me/roles',{roles:['TUTOR']}).set('Cookie',second).expect(401);
  await request(app.getHttpServer()).get('/v1/me').set('Cookie',first).expect(200);
  const third=(await post('/v1/auth/sessions',{email,password}).expect(200)).headers['set-cookie'][0];
  await request(app.getHttpServer()).delete('/v1/auth/sessions/others').set('Cookie',first).set('Origin',origin).send({}).expect(204);
  await request(app.getHttpServer()).get('/v1/me').set('Cookie',third).expect(401);
  await request(app.getHttpServer()).delete('/v1/auth/sessions/by-id/'+own).set('Cookie',first).set('Origin',origin).send({}).expect(204);
  await request(app.getHttpServer()).get('/v1/me').set('Cookie',first).expect(401);
});
test('password recovery is generic, encrypted, expiring, single-use and revokes every session',async()=>{
  // Keep expiration and rate-limit assertions inside one hourly bucket,
  // regardless of the wall-clock time at which the suite is launched.
  clock=new Date((Math.floor(clock.getTime()/3_600_000)+1)*3_600_000);
  const email='reset@example.test';await register(email);await post('/v1/auth/verifications',{token:await getToken(email)}).expect(200);
  const cookie=(await post('/v1/auth/sessions',{email,password}).expect(200)).headers['set-cookie'][0];
  const existing=await post('/v1/auth/recovery-emails',{email}).expect(202);
  const missing=await post('/v1/auth/recovery-emails',{email:'absent@example.test'}).expect(202);assert.deepEqual(existing.body,missing.body);
  const resetToken=async()=>{const row=(await database.pool.query("SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1) AND encrypted_payload IS NOT NULL ORDER BY created_at DESC,id DESC",[email])).rows.map(r=>decrypt<{reset_url?:string}>(r.encrypted_payload,config.authSecret)).find(r=>r.reset_url);return new URL(row!.reset_url!).hash.slice(7);};
  const expired=await resetToken();
  assert.equal((await database.pool.query('SELECT token_hash FROM password_resets WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0].token_hash,tokenHash(expired));
  assert.ok(!JSON.stringify((await database.pool.query('SELECT encrypted_payload FROM mail_outbox')).rows).includes(expired));
  clock=new Date(clock.getTime()+15*60_000);
  await post('/v1/auth/password-resets',{token:expired,password:'Reset123'}).expect(400);
  await post('/v1/auth/recovery-emails',{email}).expect(202);const token=await resetToken();assert.notEqual(token,expired);
  await database.pool.query("UPDATE mail_outbox SET status='EXPIRED' WHERE status IN ('PENDING','PROCESSING') AND user_id<>(SELECT id FROM users WHERE email=$1)",[email]);
  await new MailWorker(database,config,now).tick();
  const inbox=await request(app.getHttpServer()).get('/dev/mail').expect(200);assert.ok(inbox.body.messages.some((m:any)=>m.to===email&&m.reset_url));
  await post('/v1/auth/password-resets',{token,password:'seven77'}).expect(400);
  const race=await Promise.all([post('/v1/auth/password-resets',{token,password:'Reset123'}),post('/v1/auth/password-resets',{token,password:'Reset123'})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,400]);
  await request(app.getHttpServer()).get('/v1/me').set('Cookie',cookie).expect(401);
  await post('/v1/auth/sessions',{email,password}).expect(401);
  await post('/v1/auth/sessions',{email,password:'Reset123'}).expect(200);
  await post('/v1/auth/password-resets',{token,password:'Other-password-789!'}).expect(400);
  await post('/v1/auth/recovery-emails',{email}).expect(202);await post('/v1/auth/recovery-emails',{email}).expect(429);
  const audits=(await database.pool.query("SELECT * FROM audit_events WHERE user_id=(SELECT id FROM users WHERE email=$1) AND event_type='PASSWORD_RESET'",[email])).rows;
  assert.equal(audits.length,1);assert.ok(!JSON.stringify(audits).includes(token));assert.ok(!JSON.stringify(audits).includes('New-password'));
});
test('disabled recovery cannot restore access; successful reset invalidates sibling links and sessions',async()=>{
  const email='reset-disabled@example.test';await register(email);await post('/v1/auth/verifications',{token:await getToken(email)}).expect(200);
  const cookies=[];
  for(let i=0;i<2;i++)cookies.push((await post('/v1/auth/sessions',{email,password}).expect(200)).headers['set-cookie'][0]);
  const issue=async()=>{
    clock=new Date(clock.getTime()+1000);await post('/v1/auth/recovery-emails',{email}).expect(202);
    const row=(await database.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1) ORDER BY created_at DESC,id DESC LIMIT 1',[email])).rows[0];
    return new URL(decrypt<{reset_url:string}>(row.encrypted_payload,config.authSecret).reset_url).hash.slice(7);
  };
  const first=await issue();const second=await issue();
  await database.pool.query("UPDATE users SET status='DISABLED' WHERE email=$1",[email]);
  const disabled=await post('/v1/auth/recovery-emails',{email}).expect(202);
  const missing=await post('/v1/auth/recovery-emails',{email:'reset-nobody@example.test'}).expect(202);assert.deepEqual(disabled.body,missing.body);
  assert.equal((await database.pool.query('SELECT count(*) FROM password_resets WHERE user_id=(SELECT id FROM users WHERE email=$1)',[email])).rows[0].count,'2');
  await post('/v1/auth/password-resets',{token:first,password:'Updated-disabled-456!'}).expect(400);
  await database.pool.query("UPDATE users SET status='ACTIVE' WHERE email=$1",[email]);
  await post('/v1/auth/password-resets',{token:second,password:'Updated-disabled-456!'}).expect(200);
  await post('/v1/auth/password-resets',{token:first,password:'Updated-again-789!'}).expect(400);
  for(const cookie of cookies)await request(app.getHttpServer()).get('/v1/me').set('Cookie',cookie).expect(401);
});
test('database restart preserves accounts and migration ledger',async()=>{
  const ledger=(await database.pool.query('SELECT version,checksum,applied_at FROM schema_migrations ORDER BY version')).rows;
  await app.close();await database.close();await cluster.stop();await cluster.start();database=new Database(config.databaseUrl);
  await migrate(database);app=await createApplication(config,database,now);
  assert.deepEqual((await database.pool.query('SELECT version,checksum,applied_at FROM schema_migrations ORDER BY version')).rows,ledger);
  assert.equal((await database.pool.query("SELECT count(*) FROM users WHERE email='journey@example.test' AND status='ACTIVE'")).rows[0].count,'1');
});
