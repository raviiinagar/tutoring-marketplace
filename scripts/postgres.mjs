import EmbeddedPostgres from 'embedded-postgres';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { createRequire } from 'node:module';

export async function postgresTools(major = 18) {
  if (![16, 18].includes(major)) throw new Error('Unsupported isolated PostgreSQL major');
  const packageName = major === 16 ? 'embedded-postgres-pilot' : 'embedded-postgres';
  const require = createRequire(createRequire(resolve('package.json')).resolve(packageName));
  const native = require(`@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`);
  const bin = resolve(native.pg_ctl, '..');
  return { bin, pg_ctl: native.pg_ctl };
}

export async function startDatabase(urlString, directory = '.local/postgres', options = { major: Number(process.env.LOCAL_POSTGRES_MAJOR || 18) }) {
  if (![16, 18].includes(options.major)) throw new Error('Unsupported isolated PostgreSQL major');
  const Engine = options.major === 16 ? (await import('embedded-postgres-pilot')).default : EmbeddedPostgres;
  const url = new URL(urlString);
  if (!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('Local database helper requires loopback host');
  const database = url.pathname.slice(1);
  if (!/^[a-z][a-z0-9_]*$/.test(database)) throw new Error('Invalid local database name');
  const occupied=await new Promise(resolve=>{
    const socket=createConnection({host:'127.0.0.1',port:Number(url.port||5433)});
    socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));
  });
  if(occupied)throw new Error(`Local PostgreSQL port ${url.port||5433} is already in use; stop the existing stack first.`);
  const cluster = new Engine({
    databaseDir:resolve(directory),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),
    port:Number(url.port || 5433),persistent:true,authMethod:'scram-sha-256',createPostgresUser:false,
    postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{},
  });
  // The pinned wrapper force-kills Windows PostgreSQL. Use its bundled pg_ctl
  // for a clean checkpoint and clear its process reference for its exit hook.
  if(process.platform==='win32'){
    const {pg_ctl}=await postgresTools(options.major);
    let stopping;
    cluster.stop=()=>stopping ||= (async()=>{
      const child=cluster.process;
      if(!child || child.exitCode!==null){cluster.process=undefined;return;}
      const ctl=spawn(pg_ctl,['stop','-D',resolve(directory),'-m','fast','-w','-t','60'],{stdio:'ignore',windowsHide:true});
      await new Promise((resolve,reject)=>{ctl.on('error',reject);ctl.on('exit',code=>code===0?resolve():reject(new Error('Local PostgreSQL graceful shutdown failed')));});
      cluster.process=undefined;
    })().finally(()=>{stopping=undefined;});
  }
  try { await access(resolve(directory,'PG_VERSION')); } catch { await cluster.initialise(); }
  await cluster.start();
  try {
    const client = cluster.getPgClient('postgres','127.0.0.1');
    await client.connect();
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[database]);
    await client.end();
    if (!result.rowCount) await cluster.createDatabase(database);
    return cluster;
  } catch (error) { await cluster.stop(); throw error; }
}
