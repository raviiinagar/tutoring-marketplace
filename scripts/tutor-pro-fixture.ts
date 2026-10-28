import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/src/database.js';
import type {Config} from '../apps/api/src/config.js';
// Test harness only; never imported by runtime application code.
export async function grantTutorProFixture(database:Database,config:Config,email:string,at:Date){
 const url=new URL(config.databaseUrl);
 if(config.mode==='production'||!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/[a-z][a-z0-9_]*_test$/.test(url.pathname)||!email.endsWith('@example.test'))throw new Error('Tutor Pro fixtures require a fictional identity in an isolated local test database.');
 const user=(await database.pool.query('SELECT id FROM users WHERE email=$1 AND status=\'ACTIVE\' AND email_verified_at IS NOT NULL',[email])).rows[0];if(!user)throw new Error('Verified fixture required.');
 await database.transaction(async client=>{const campaign=randomUUID(),redemption=randomUUID(),code='FIXTURE'+randomUUID().replaceAll('-','').slice(0,20).toUpperCase();await client.query("INSERT INTO access_coupons(id,code,percent_off,starts_at,expires_at,max_uses,test_only,created_at,product) VALUES($1,$2,100,$3,$4,1,true,$3,'TUTOR_PRO')",[campaign,code,at,new Date(at.getTime()+30*86400000)]);await client.query("INSERT INTO coupon_redemptions(id,coupon_id,payer_id,request_key,payload_hash,policy_version,code,percent_off,base_paise,discount_paise,total_paise,test_only,created_at,product) VALUES($1,$2,$3,$4,'isolated-fixture','tutor-pro-v1',$5,100,60000,60000,0,true,$6,'TUTOR_PRO')",[redemption,campaign,user.id,randomUUID(),code,at]);await client.query("INSERT INTO tutor_pro_grants(id,payer_id,source,coupon_redemption_id,test_only,starts_at,ends_at,created_at) VALUES($1,$2,'COUPON',$3,true,$4,$5,$4)",[randomUUID(),user.id,redemption,at,new Date(at.getTime()+30*86400000)]);});
}
