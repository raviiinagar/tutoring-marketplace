import {createHmac,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {Config} from './config.js';
import {Database} from './database.js';
import {DiscoveryService,discoveryInput} from './discovery.js';
import {ListingsService} from './listings.js';
import {AuthService} from './auth.js';
import {StaffService} from './staff.js';
import {CatalogueService} from './catalogue.js';
import {TutorsService} from './tutors.js';
import {evidenceScanner} from './evidence-scanner.js';
import {RateLimiter} from './rate-limit.js';
import {ApiProblem} from './errors.js';
import {encrypt,randomToken,tokenHash} from './security.js';
const shape=discoveryInput.shape;
export const availabilitySelection=z.strictObject({domain_id:shape.domain_id,subject_id:shape.subject_id,level_id:shape.level_id,curriculum_id:shape.curriculum_id,exam_id:shape.exam_id,language_id:shape.language_id,rate_unit:shape.rate_unit,min_rate_paise:z.number().int().min(100).max(10000000).optional(),max_rate_paise:z.number().int().min(100).max(10000000).optional()}).superRefine((v,c)=>{
  if(!v.domain_id&&!v.subject_id)c.addIssue({code:'custom',message:'Choose a Learning Domain or Subject for your alert.'});
  if((v.min_rate_paise!==undefined||v.max_rate_paise!==undefined)&&!v.rate_unit)c.addIssue({code:'custom',message:'Choose a price unit.'});
  if(v.min_rate_paise!==undefined&&v.max_rate_paise!==undefined&&v.min_rate_paise>v.max_rate_paise)c.addIssue({code:'custom',message:'Check the price range.'});
});
export const availabilitySignup=z.strictObject({email:z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254)),selection:availabilitySelection,consent:z.literal(true),adult_confirmed:z.literal(true),consent_version:z.literal('availability-v1')});
export const availabilityToken=z.strictObject({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)});
type Selection=z.infer<typeof availabilitySelection>;
const hour=3600000;
const generic={code:'CONFIRMATION_REQUIRED',message:'If eligible, a confirmation email will arrive. No alert subscription starts until you confirm it.'};
export class AvailabilityService {
  readonly limits:RateLimiter;
  constructor(private readonly database:Database,private readonly config:Config,private readonly discovery:DiscoveryService,private readonly listings:ListingsService,private readonly now:()=>Date=()=>new Date()){this.limits=new RateLimiter(database,config.authSecret,now);}
  policy(){return {consent_version:'availability-v1',purpose:'TUTOR_AVAILABILITY',duration_days:90,max_alerts:1,notice:'Use your own adult email. Receive one email alert about approved online Tutor availability matching these filters within 90 days. This is optional, free and not marketing consent. Confirm your email first; unsubscribe at any time.'};}
  private audit(client:PoolClient,id:string,event:string,correlation:string){return client.query('INSERT INTO audit_events(id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5)',[randomUUID(),event,correlation,this.now(),{target:id,purpose:'TUTOR_AVAILABILITY',consent_version:'availability-v1'}]);}
  async signup(input:z.infer<typeof availabilitySignup>,ip:string,correlation:string){
    await this.limits.consume('availability-signup-ip',ip,20,hour);await this.limits.consume('availability-signup-email',input.email,3,hour);
    if(await this.discovery.firstAvailable(input.selection))throw new ApiProblem(409,'AVAILABLE_NOW','Matching offers are available now. Refresh your search.');
    const selection=Object.fromEntries(Object.entries(input.selection).filter(([,value])=>value!==undefined).sort(([a],[b])=>a.localeCompare(b))) as Selection;
    const emailHash=createHmac('sha256',this.config.authSecret).update('availability:'+input.email).digest('hex');const key=tokenHash(JSON.stringify(selection));const at=this.now();
    await this.database.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[emailHash]);
      const existing=(await client.query('SELECT * FROM availability_subscriptions WHERE email_hash=$1 AND selection_key=$2 FOR UPDATE',[emailHash,key])).rows[0];
      if(existing&&!(this.config.mode==='production'&&existing.test_only)&&(['ACTIVE','MATCH_FOUND'].includes(existing.status)&&new Date(existing.expires_at)>at||existing.status==='PENDING'&&new Date(existing.verification_expires_at)>at))return;
      if(Number((await client.query("SELECT count(*) FROM availability_subscriptions WHERE email_hash=$1 AND ((status='PENDING' AND verification_expires_at>$2) OR (status IN ('ACTIVE','MATCH_FOUND') AND expires_at>$2))",[emailHash,at])).rows[0].count)>=10)return;
      const id=existing?.id||randomUUID();const verify=randomToken();const unsubscribe=randomToken();const expires=new Date(at.getTime()+15*60000);
      await client.query(`INSERT INTO availability_subscriptions(id,email_hash,selection_key,selection,encrypted_contact,consent_version,verification_hash,verification_expires_at,unsubscribe_hash,created_at,updated_at,test_only) VALUES($1,$2,$3,$4,$5,'availability-v1',$6,$7,$8,$9,$9,$10)
        ON CONFLICT(email_hash,selection_key) DO UPDATE SET test_only=excluded.test_only,encrypted_contact=excluded.encrypted_contact,status='PENDING',generation=availability_subscriptions.generation+1,verification_hash=excluded.verification_hash,verification_expires_at=excluded.verification_expires_at,unsubscribe_hash=excluded.unsubscribe_hash,verified_at=NULL,expires_at=NULL,next_check_at=$9,updated_at=$9`,[id,emailHash,key,selection,encrypt({email:input.email,unsubscribe_token:unsubscribe},this.config.authSecret),tokenHash(verify),expires,tokenHash(unsubscribe),at,this.config.mode!=='production']);
      await client.query("UPDATE availability_notification_intents SET status='CANCELLED' WHERE subscription_id=$1 AND status='PENDING'",[id]);
      await client.query("UPDATE mail_outbox SET status='EXPIRED' WHERE availability_subscription_id=$1 AND status IN ('PENDING','PROCESSING')",[id]);
      const payload=encrypt({to:input.email,availability_verification_url:this.config.webOrigin+'/availability/verify#token='+verify,availability_unsubscribe_url:this.config.webOrigin+'/availability/unsubscribe#token='+unsubscribe},this.config.authSecret);
      await client.query('INSERT INTO mail_outbox(id,availability_subscription_id,encrypted_payload,expires_at,available_at,created_at) VALUES($1,$2,$3,$4,$5,$5)',[randomUUID(),id,payload,expires,at]);await this.audit(client,id,'AVAILABILITY_SIGNUP',correlation);
    });return generic;
  }
  async verify(token:string,ip:string,correlation:string){await this.limits.consume('availability-verify-ip',ip,30,15*60000);return this.database.transaction(async client=>{const row=(await client.query('SELECT * FROM availability_subscriptions WHERE verification_hash=$1 FOR UPDATE',[tokenHash(token)])).rows[0];const at=this.now();if(!row||row.status!=='PENDING'||this.config.mode==='production'&&row.test_only||new Date(row.verification_expires_at)<=at)throw new ApiProblem(400,'INVALID_OR_EXPIRED_TOKEN','This confirmation link is invalid, expired or already used.');await client.query("UPDATE availability_subscriptions SET status='ACTIVE',verification_hash=NULL,verification_expires_at=NULL,verified_at=$2,expires_at=$3,next_check_at=$2,updated_at=$2 WHERE id=$1",[row.id,at,new Date(at.getTime()+90*24*hour)]);await this.audit(client,row.id,'AVAILABILITY_CONFIRMED',correlation);return {code:'SUBSCRIPTION_ACTIVE',message:'Your availability alert is active for up to 90 days. This does not enable paid access or marketing emails.'};});}
  async unsubscribe(token:string,ip:string,correlation:string){await this.limits.consume('availability-unsubscribe-ip',ip,30,15*60000);return this.database.transaction(async client=>{const row=(await client.query('SELECT id,status FROM availability_subscriptions WHERE unsubscribe_hash=$1 FOR UPDATE',[tokenHash(token)])).rows[0];if(row&&row.status!=='WITHDRAWN'){await client.query("UPDATE availability_subscriptions SET status='WITHDRAWN',encrypted_contact=NULL,verification_hash=NULL,verification_expires_at=NULL,updated_at=$2 WHERE id=$1",[row.id,this.now()]);await client.query("UPDATE availability_notification_intents SET status='CANCELLED' WHERE subscription_id=$1 AND status='PENDING'",[row.id]);await client.query("UPDATE mail_outbox SET status='EXPIRED' WHERE availability_subscription_id=$1 AND status IN ('PENDING','PROCESSING')",[row.id]);await this.audit(client,row.id,'AVAILABILITY_WITHDRAWN',correlation);}return {code:'UNSUBSCRIBED',message:'Any availability subscription linked to this token is unsubscribed.'};});}
  private matches(offer:Record<string,any>,selection:Selection){for(const key of ['domain_id','subject_id','level_id','curriculum_id','exam_id','rate_unit'] as const)if(selection[key]&&offer[key]!==selection[key])return false;return (!selection.language_id||offer.language_ids.includes(selection.language_id))&&(selection.min_rate_paise===undefined||offer.rate_paise>=selection.min_rate_paise)&&(selection.max_rate_paise===undefined||offer.rate_paise<=selection.max_rate_paise);}
  async tick():Promise<boolean>{return this.database.transaction(async client=>{
    const at=this.now();const expired=(await client.query("SELECT id FROM availability_subscriptions WHERE (status='PENDING' AND verification_expires_at<=$1) OR (status IN ('ACTIVE','MATCH_FOUND') AND expires_at<=$1) ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 1",[at])).rows[0];
    if(expired){await client.query("UPDATE availability_subscriptions SET status='EXPIRED',encrypted_contact=NULL,verification_hash=NULL,verification_expires_at=NULL,updated_at=$2 WHERE id=$1",[expired.id,at]);await client.query("UPDATE availability_notification_intents SET status='CANCELLED' WHERE subscription_id=$1 AND status='PENDING'",[expired.id]);await this.audit(client,expired.id,'AVAILABILITY_EXPIRED',randomUUID());return true;}
    const row=(await client.query("SELECT * FROM availability_subscriptions WHERE status='ACTIVE' AND next_check_at<=$1 AND (NOT $2::boolean OR NOT test_only) ORDER BY next_check_at,id FOR UPDATE SKIP LOCKED LIMIT 1",[at,this.config.mode==='production'])).rows[0];if(!row)return false;
    let found:string|undefined;
    try{let cursor:string|undefined;do{const results=await this.discovery.search({...row.selection,limit:24,cursor});for(const candidate of results.offers){try{const current=await this.listings.requireAvailable(client,candidate.id);if(this.matches(current.offer,row.selection)){found=current.id;break;}}catch(error){if(!(error instanceof ApiProblem))throw error;}}cursor=results.next_cursor||undefined;}while(!found&&cursor);}catch(error){if(!(error instanceof ApiProblem))throw error;}
    if(!found){await client.query('UPDATE availability_subscriptions SET next_check_at=$2 WHERE id=$1',[row.id,new Date(at.getTime()+60000)]);return true;}
    await client.query('INSERT INTO availability_notification_intents(id,subscription_id,generation,listing_id,matched_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(subscription_id,generation) DO NOTHING',[randomUUID(),row.id,row.generation,found,at]);await client.query("UPDATE availability_subscriptions SET status='MATCH_FOUND',updated_at=$2 WHERE id=$1",[row.id,at]);await this.audit(client,row.id,'AVAILABILITY_MATCH_INTENT',randomUUID());return true;
  });}
}
export function availabilityWorker(database:Database,config:Config,now:()=>Date=()=>new Date()){
  const auth=new AuthService(database,config,now);const staff=new StaffService(database,config,auth,now);const catalogue=new CatalogueService(database,staff);const tutors=new TutorsService(database,config,auth,staff,evidenceScanner(config),now);return new AvailabilityService(database,config,new DiscoveryService(database,config,now),new ListingsService(database,auth,staff,catalogue,tutors,now),now);
}
