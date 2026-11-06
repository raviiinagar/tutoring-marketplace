import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { Database, migrate } from '../src/database.js';
import { decrypt } from '../src/security.js';
import { personalExport } from '../src/privacy-inventory.js';
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from '../../../scripts/postgres.mjs';
let app: INestApplication, db: Database, config: Config, cluster: Awaited<ReturnType<typeof startDatabase>>;
const origin = 'http://localhost:3000', password = 'Draft-test-password-321!';
const path = '/v1/me/tutor/onboarding-draft';
const post = (url: string, body: unknown, cookie?: string) => {
  const r = request(app.getHttpServer()).post(url).set('Origin', origin).send(body);
  return cookie ? r.set('Cookie', cookie) : r;
};
const get = (url: string, cookie?: string) => {
  const r = request(app.getHttpServer()).get(url);
  return cookie ? r.set('Cookie', cookie) : r;
};
const remove = (revision: number, cookie: string) => request(app.getHttpServer()).delete(path)
  .set('Origin', origin).set('Cookie', cookie).send({ revision });
before(async () => {
  const server = createServer();
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(r => server.close(() => r()));
  const directory = resolve('.local/tests', randomUUID());
  config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: `postgres://test_user:${randomBytes(24).toString('hex')}@127.0.0.1:${port}/drafts_test`,
    AUTH_SECRET: randomBytes(48).toString('hex'), WEB_ORIGIN: origin, MAIL_TRANSPORT: 'capture', DEV_MAIL_DIR: join(directory, 'mail') });
  cluster = await startDatabase(config.databaseUrl, join(directory, 'postgres'));
  db = new Database(config.databaseUrl); await migrate(db); app = await createApplication(config, db);
});
after(async () => { await app?.close(); await db?.close(); await cluster?.stop(); });
async function account(tutor = true) {
  const email = randomUUID() + '@example.test';
  await post('/v1/auth/registrations', { display_name: 'Draft owner', email, password }).expect(202);
  const row = (await db.pool.query('SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)', [email])).rows[0];
  await post('/v1/auth/verifications', { token: new URL(decrypt<{ verification_url: string }>(row.encrypted_payload, config.authSecret).verification_url).hash.slice(7) }).expect(200);
  const login = await post('/v1/auth/sessions', { email, password }).expect(200);
  const cookie = login.headers['set-cookie'][0] as string;
  if (tutor) await post('/v1/me/roles', { roles: ['TUTOR'] }, cookie).expect(200);
  return { cookie, id: login.body.user.id as string };
}
test('incomplete drafts persist privately, resume exactly and never create or publish a profile', async () => {
  const owner = await account(), other = await account();
  assert.equal((await get(path, owner.cookie).expect(200)).body.draft, null);
  const data = { display_name: '', biography: 'An unfinished introduction', subject_ids: [], adult_confirmed: false };
  const saved = (await post(path, { revision: 0, step: 1, data }, owner.cookie).expect(200)).body.draft;
  assert.equal(saved.revision, 1); assert.deepEqual(saved.data, data);
  assert.deepEqual((await get(path, owner.cookie).expect(200)).body.draft, saved);
  assert.equal((await get(path, other.cookie).expect(200)).body.draft, null);
  assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM tutor_profiles WHERE user_id=$1', [owner.id])).rows[0].n, 0);
  const stored = (await db.pool.query('SELECT encrypted_payload FROM tutor_onboarding_drafts WHERE user_id=$1', [owner.id])).rows[0].encrypted_payload;
  assert.equal(JSON.stringify(stored).includes('unfinished'), false);
  await db.transaction(async client => {
    const user = (await client.query('SELECT * FROM users WHERE id=$1', [owner.id])).rows[0];
    const exported = await personalExport(client, user, config, new Date());
    assert.deepEqual(exported.tutor_onboarding_draft?.data, data);
  });
});
test('concurrent writes and stale clears cannot overwrite a newer private draft', async () => {
  const owner = await account();
  await post(path, { revision: 0, step: 0, data: {} }, owner.cookie).expect(200);
  const writes = await Promise.all([
    post(path, { revision: 1, step: 2, data: { display_name: 'First writer' } }, owner.cookie),
    post(path, { revision: 1, step: 3, data: { display_name: 'Second writer' } }, owner.cookie),
  ]);
  assert.deepEqual(writes.map(r => r.status).sort(), [200, 409]);
  await remove(1, owner.cookie).expect(409);
  assert.equal((await get(path, owner.cookie).expect(200)).body.draft.revision, 2);
  await remove(2, owner.cookie).expect(204);
  assert.equal((await get(path, owner.cookie).expect(200)).body.draft, null);
});
test('draft endpoints enforce authentication, strict bounds and CSRF origin', async () => {
  const learner = await account(false), owner = await account();
  await get(path).expect(401);
  // Any signed-in account may open the teaching workspace; it simply has no
  // draft yet. Choosing a role up front is not required.
  assert.equal((await get(path, learner.cookie).expect(200)).body.draft, null);
  await post(path, { revision: 0, step: 0, data: { user_id: learner.id } }, owner.cookie).expect(400);
  await post(path, { revision: 0, step: 5, data: {} }, owner.cookie).expect(400);
  await post(path, { revision: 0, step: 0, data: { biography: 'x'.repeat(1001) } }, owner.cookie).expect(400);
  await post(path, { revision: 0, step: 0, data: { identity_document: 'FAKE_ID' } }, owner.cookie).expect(400);
  await post(path, { revision: 0, step: 0, data: { data: 'upload-blob', status: 'APPROVED' } }, owner.cookie).expect(400);
  await request(app.getHttpServer()).post(path).set('Origin', 'https://other.invalid').set('Cookie', owner.cookie)
    .send({ revision: 0, step: 0, data: {} }).expect(403);
  // A saved draft stays readable after the account drops back to Learner only.
  // Nothing about it is public, so there is nothing to withdraw.
  await post('/v1/me/roles', { roles: ['LEARNER'] }, owner.cookie).expect(200);
  await get(path, owner.cookie).expect(200);
});
test('starting a teaching draft records the Tutor role without publishing anything', async () => {
  const learner = await account(false);
  assert.ok(!(await get('/v1/me', learner.cookie).expect(200)).body.user.roles.includes('TUTOR'));
  const saved = await post(path, { revision: 0, step: 1, data: { biography: 'A private working copy.' } }, learner.cookie).expect(200);
  assert.equal(saved.body.draft.step, 1);
  const roles = (await get('/v1/me', learner.cookie).expect(200)).body.user.roles;
  assert.ok(roles.includes('TUTOR') && roles.includes('LEARNER'));
  // The workspace is open, but no profile and no ad exist yet.
  assert.equal((await get('/v1/me/tutor', learner.cookie).expect(200)).body.profile, null);
  assert.deepEqual((await get('/v1/me/listings', learner.cookie).expect(200)).body.listings, []);
});
