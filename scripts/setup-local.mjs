import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
import { startDatabase } from './postgres.mjs';

try {
  await writeFile('.env',[
    'NODE_ENV=development',
    `DATABASE_URL=postgres://tutoring_local:${randomBytes(24).toString('hex')}@127.0.0.1:5433/tutoring_dev`,
    `AUTH_SECRET=${randomBytes(48).toString('hex')}`,
    'WEB_ORIGIN=http://localhost:3000','ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173',
    'PORT=4000','MAIL_TRANSPORT=capture','DEV_MAIL_DIR=.local/mail','',
  ].join('\n'),{flag:'wx',mode:0o600});
  console.log('Created local .env with random development credentials.');
} catch (error) { if (error.code !== 'EEXIST') throw error; }
config({quiet:true});
const cluster = await startDatabase(process.env.DATABASE_URL);
try {
  const result = spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','--tsconfig','apps/api/tsconfig.json','apps/api/src/migrate.ts'],{stdio:'inherit',env:process.env});
  if (result.status !== 0) process.exitCode=1;
} finally { await cluster.stop(); }
