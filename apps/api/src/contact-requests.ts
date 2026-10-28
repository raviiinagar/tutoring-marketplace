import {currentTutorPro} from './tutor-pro-access.js';
import {checkoutOpen} from './operations.js';
import {requestTiming,expirePayerRequests} from './request-lifecycle.js';
import {PaidAccess,testCoverage,coverageAllowed} from './paid-access.js';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {Config} from './config.js';
import {Database} from './database.js';
import {AuthService} from './auth.js';
import {LearnersService} from './learners.js';
import {ListingsService} from './listings.js';
import {DiscoveryService} from './discovery.js';
import {ApiProblem} from './errors.js';
import {encrypt,decrypt,tokenHash} from './security.js';
const contactPattern=/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d|(?:whatsapp|telegram|instagram)\s*[:@]|@[a-z][\w.]{2,})/i;
const privateText=(min:number,max:number)=>z.string().trim().min(min).max(max).refine(value=>!contactPattern.test(value),'Keep emails, phone numbers, social handles and links out of the enquiry.').refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),'Remove control characters.');
export const contactRequestInput=z.strictObject({request_key:z.uuid(),listing_id:z.uuid(),listing_revision:z.number().int().positive(),learner_id:z.uuid(),subject_id:z.string().regex(/^[a-z][a-z0-9-]{1,79}$/),teaching_mode:z.literal('ONLINE'),learning_requirements:privateText(20,500),preferred_times:privateText(5,160)});
export const requestListInput=z.strictObject({cursor:z.uuid().optional()});
type Input=z.infer<typeof contactRequestInput>;
const hour=3600000;
export class ContactRequestsService {
  constructor(private readonly database:Database,private readonly config:Config,private readonly auth:AuthService,private readonly learners:LearnersService,private readonly listings:ListingsService,private readonly paidAccess:PaidAccess,private readonly discovery:DiscoveryService,private readonly now:()=>Date=()=>new Date()){}
  async alternatives(token:string|undefined,id:string,cursor?:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);
    const row=(await client.query('SELECT * FROM contact_requests WHERE id=$1 AND payer_id=$2',[id,user.id])).rows[0];
    if(!row||!coverageAllowed(this.config,row.coverage_snapshot))throw new ApiProblem(404,'NOT_FOUND','Contact Request not found.');
    await this.learners.requireUsable(client,user.id,row.learner_id);
    return this.discovery.alternatives(client,row,cursor);
  });}
  private async policy(client:PoolClient){return (await client.query("SELECT * FROM contact_request_policies WHERE version='contact-v1'")).rows[0];}
  async access(token?:string){return this.database.transaction(async client=>{const {user}=await this.auth.authenticated(client,token);const at=this.now();const policy=await this.policy(client);const coverage=user.roles.includes('LEARNER')?await this.paidAccess.forPayer(client,user.id,at):undefined;const pending=Number((await client.query("SELECT count(*) FROM contact_requests WHERE payer_id=$1 AND status='PENDING' AND expires_at>$2",[user.id,at])).rows[0].count);return {can_request:!!coverage&&pending<policy.pending_limit,pending_count:pending,pending_limit:policy.pending_limit,request_policy_version:policy.version,request_ttl_hours:policy.ttl_hours,checkout_available:!!this.config.payments&&await checkoutOpen(client),reason:!coverage?'ACCESS_REQUIRED':pending>=policy.pending_limit?'PENDING_LIMIT':null,coverage:coverage?{source:coverage.source,status:coverage.status,expires_at:new Date(coverage.status==='ACTIVE'?coverage.ends_at:coverage.matching_deadline).toISOString(),id:coverage.id,purchase_id:coverage.cycle_id||null,starts_at:coverage.starts_at?new Date(coverage.starts_at).toISOString():null,ends_at:coverage.ends_at?new Date(coverage.ends_at).toISOString():null,test_only:coverage.test_only}:null};});}
  private async view(client:PoolClient,row:Record<string,any>){
    let learner:Record<string,any>|undefined;try{learner=await this.learners.requireUsable(client,row.payer_id,row.learner_id);}catch(error){if(!(error instanceof ApiProblem)||![403,404].includes(error.getStatus()))throw error;}
    const message=learner?decrypt<{learning_requirements:string;preferred_times:string}>(row.encrypted_message,this.config.authSecret):null;
    const connection=(await client.query('SELECT id FROM connections WHERE request_id=$1',[row.id])).rows[0];
    return {id:row.id,listing_id:row.listing_id,learner_id:row.learner_id,learner_alias:learner?.alias||null,learner_usable:!!learner,offer:row.offer_snapshot,...(message||{learning_requirements:null,preferred_times:null}),...requestTiming(row as {status:string;expires_at:Date},this.now()),created_at:new Date(row.created_at).toISOString(),request_policy_version:row.request_policy_version,connection_id:connection?.id||null,test_only:testCoverage(row.coverage_snapshot)};
  }
  async submit(token:string|undefined,input:Input,correlation:string){return this.database.transaction(async client=>{
    const recipient=(await client.query('SELECT user_id FROM teaching_listings WHERE id=$1',[input.listing_id])).rows[0];
    const {user}=await this.auth.authenticated(client,token,recipient?[recipient.user_id]:[]);
    const hash=tokenHash(JSON.stringify(input));const retry=(await client.query('SELECT r.*,k.payload_hash AS retry_hash FROM contact_request_keys k JOIN contact_requests r ON r.id=k.request_id WHERE k.payer_id=$1 AND k.request_key=$2 FOR UPDATE OF r',[user.id,input.request_key])).rows[0];
    if(retry){if(!coverageAllowed(this.config,retry.coverage_snapshot))throw new ApiProblem(403,'ACCESS_REQUIRED','Test coverage cannot authorize production requests.');if(retry.retry_hash!==hash)throw new ApiProblem(409,'IDEMPOTENCY_CONFLICT','This request key was already used for a different enquiry.');return {request:await this.view(client,retry),replayed:true};}
    await this.learners.requireUsable(client,user.id,input.learner_id);
    const listing=await this.listings.requireAvailable(client,input.listing_id);
    if(listing.user_id===user.id)throw new ApiProblem(403,'SELF_REQUEST','You cannot send a Contact Request to yourself.');
    if(listing.revision!==input.listing_revision)throw new ApiProblem(409,'OFFER_CHANGED','This offer changed. Refresh it before sending your enquiry.');
    if(listing.offer.subject_id!==input.subject_id||listing.offer.teaching_mode!==input.teaching_mode)throw new ApiProblem(400,'OFFER_MISMATCH','The enquiry must match this exact Subject and teaching mode.');
    if((await client.query('SELECT 1 FROM account_blocks WHERE (owner_id=$1 AND blocked_id=$2) OR (owner_id=$2 AND blocked_id=$1)',[user.id,listing.user_id])).rowCount)throw new ApiProblem(403,'CONTACT_BLOCKED','A current block prevents this Contact Request.');
    let at=this.now();const policy=await this.policy(client);const coverage=await this.paidAccess.forPayer(client,user.id,at);at=this.now();if(!coverage||(coverage.status==='MATCHING'?new Date(coverage.matching_deadline):new Date(coverage.ends_at))<=at)throw new ApiProblem(403,'ACCESS_REQUIRED','An Access Pass funded by payment or a full coupon is required before sending a Contact Request.');
    await expirePayerRequests(client,user.id,at);
    const duplicate=(await client.query("SELECT * FROM contact_requests WHERE payer_id=$1 AND learner_id=$2 AND listing_id=$3 AND status='PENDING'",[user.id,input.learner_id,input.listing_id])).rows[0];
    if(duplicate){const stored=decrypt<{learning_requirements:string;preferred_times:string}>(duplicate.encrypted_message,this.config.authSecret);if(duplicate.listing_revision!==input.listing_revision||stored.learning_requirements!==input.learning_requirements||stored.preferred_times!==input.preferred_times)throw new ApiProblem(409,'REQUEST_ALREADY_PENDING','An enquiry for this Learner and offer is already pending.');await client.query('INSERT INTO contact_request_keys(payer_id,request_key,payload_hash,request_id) VALUES($1,$2,$3,$4)',[user.id,input.request_key,hash,duplicate.id]);return {request:await this.view(client,duplicate),replayed:true};}
    const pending=Number((await client.query("SELECT count(*) FROM contact_requests WHERE payer_id=$1 AND status='PENDING'",[user.id])).rows[0].count);if(pending>=policy.pending_limit)throw new ApiProblem(409,'PENDING_LIMIT','You can have at most five pending Contact Requests.');
    const expiry=new Date(Math.min(at.getTime()+policy.ttl_hours*hour,coverage.status==='MATCHING'?new Date(coverage.matching_deadline).getTime():Infinity));const id=randomUUID();
    const tutorPro=await currentTutorPro(client,listing.user_id,at,this.config.mode!=='production');if(!tutorPro)throw new ApiProblem(409,'TUTOR_PRO_EXPIRED','This Tutor is not currently accepting new enquiries.');
    const snapshot={source:coverage.source,test_only:coverage.test_only,cycle_id:coverage.cycle_id||null,policy_version:coverage.policy_version,status:coverage.status,captured_at:coverage.captured_at,issued_at:coverage.issued_at,matching_deadline:coverage.matching_deadline,starts_at:coverage.starts_at,ends_at:coverage.ends_at,authorized_at:at.toISOString()};
    await client.query('INSERT INTO contact_requests(id,payer_id,tutor_id,learner_id,listing_id,listing_revision,profile_revision,offer_snapshot,encrypted_message,request_key,payload_hash,entitlement_id,coverage_snapshot,request_policy_version,expires_at,created_at,updated_at,tutor_pro_grant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,$17)',[id,user.id,listing.user_id,input.learner_id,listing.id,listing.revision,listing.profile_revision,listing.offer,encrypt({learning_requirements:input.learning_requirements,preferred_times:input.preferred_times},this.config.authSecret),input.request_key,hash,coverage.id,snapshot,policy.version,expiry,at,tutorPro.id]);
    await client.query('INSERT INTO contact_request_keys(payer_id,request_key,payload_hash,request_id) VALUES($1,$2,$3,$4)',[user.id,input.request_key,hash,id]);
    await client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),user.id,'CONTACT_REQUEST_SUBMITTED',correlation,at,{target:id,listing_id:listing.id,entitlement_id:coverage.id,request_policy_version:policy.version}]);
    return {request:await this.view(client,(await client.query('SELECT * FROM contact_requests WHERE id=$1',[id])).rows[0]),replayed:false};
  });}
  async list(token:string|undefined,cursor?:string){return this.database.transaction(async client=>{const {user}=await this.auth.authenticated(client,token);const rows=(await client.query("SELECT * FROM contact_requests WHERE payer_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) AND (NOT $3::boolean OR (coverage_snapshot->>'source' IN ('PAYMENT','COUPON') AND coverage_snapshot->>'test_only'='false')) ORDER BY id LIMIT 21",[user.id,cursor||null,this.config.mode==='production'])).rows;const requests=[];for(const row of rows.slice(0,20))requests.push(await this.view(client,row));return {requests,next_cursor:rows.length>20?rows[19].id:null};});}
  async detail(token:string|undefined,id:string){return this.database.transaction(async client=>{const {user}=await this.auth.authenticated(client,token);const row=(await client.query('SELECT * FROM contact_requests WHERE id=$1 AND payer_id=$2',[id,user.id])).rows[0];if(!row||!coverageAllowed(this.config,row.coverage_snapshot))throw new ApiProblem(404,'NOT_FOUND','Contact Request not found.');return {request:await this.view(client,row)};});}
}
