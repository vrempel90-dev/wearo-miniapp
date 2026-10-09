import EmbeddedPostgres from 'embedded-postgres';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const dir='work/postgres';
mkdirSync('work',{recursive:true});
const credentials='work/local-db-password';
const password=existsSync(credentials)?readFileSync(credentials,'utf8'):randomBytes(24).toString('hex');
writeFileSync(credentials,password);
const pg=new EmbeddedPostgres({databaseDir:dir,user:'postgres',password,port:55439,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:message=>console.error(message)});
if(!existsSync(`${dir}/PG_VERSION`)) await pg.initialise();
await pg.start();
const client=pg.getPgClient(); await client.connect();
for(const name of ['wearo_dev','wearo_test']) {
  const result=await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[name]);
  if(!result.rowCount) await pg.createDatabase(name);
}
await client.end();
if(!existsSync('.env')) writeFileSync('.env',`DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:55439/wearo_dev\nTEST_DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:55439/wearo_test\nAPP_URL=http://localhost:3000\nDEV_AUTH=true\nTEST_PAYMENTS=true\nDEMO_SEED=true\n`);
console.log('Local PostgreSQL listening on 127.0.0.1:55439 (wearo_dev, wearo_test). Environment saved to ignored .env.');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await pg.stop();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
await new Promise(()=>{});
