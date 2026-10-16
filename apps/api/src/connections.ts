import {requestTiming} from './request-lifecycle.js';
import {PaidAccess,testCoverage,coverageAllowed} from './paid-access.js';
import {requireSafetyClear} from './safety-permissions.js';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {Config} from './config.js';
import {Database} from './database.js';
import {AuthService} from './auth.js';
import {LearnersService} from './learners.js';
import {ListingsService} from './listings.js';
import {TutorsService} from './tutors.js';
import {ApiProblem} from './errors.js';
import {decrypt} from './security.js';

export const connectionDecision=z.strictObject({decision:z.enum(['ACCEPT','DECLINE'])});
export const connectionList=z.strictObject({cursor:z.uuid().optional()});
type Row=Record<string,any>;
type ConnectionContext={connection:Row;request:Row;actor:Row;learner:Row};
const denied=(code:string,message:string)=>new ApiProblem(403,code,message);
const missing=()=>new ApiProblem(404,'NOT_FOUND','Request or Connection not found.');
const code=(error:ApiProblem)=>(error.getResponse() as {code:string}).code;
export class ConnectionsService {
  constructor(private readonly database:Database,private readonly config:Config,private readonly auth:AuthService,private readonly learners:LearnersService,private readonly listings:ListingsService,private readonly tutors:TutorsService,private readonly paidAccess:PaidAccess,private readonly now:()=>Date=()=>new Date()){}

  private async audit(client:PoolClient,actor:string,event:string,target:string,correlation:string){await client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,event,correlation,this.now(),{target}]);}
  private source(row:Row){if(!coverageAllowed(this.config,row.coverage_snapshot))throw denied('COVERAGE_UNAVAILABLE','This coverage cannot authorize a Connection.');}
  private async unblocked(client:PoolClient,row:Row){if((await client.query('SELECT 1 FROM account_blocks WHERE (owner_id=$1 AND blocked_id=$2) OR (owner_id=$2 AND blocked_id=$1)',[row.payer_id,row.tutor_id])).rowCount)throw denied('CONTACT_BLOCKED','A current block prevents this interaction.');}

  private async safety(client:PoolClient,row:Row){
    await requireSafetyClear(client,'LISTING',row.listing_id);
    const learner=await this.learners.requireUsable(client,row.payer_id,row.learner_id);
    await this.tutors.requireQualified(client,row.tutor_id,row.offer_snapshot.subject_id);
    const listing=(await client.query('SELECT * FROM teaching_listings WHERE id=$1 FOR UPDATE',[row.listing_id])).rows[0];
    if(!listing||listing.user_id!==row.tutor_id||listing.safety_suspended)throw denied('LISTING_RESTRICTED','This teaching offer is restricted.');
    await this.unblocked(client,row);return {learner,listing};
  }

  private async pending(client:PoolClient,row:Row){
    this.source(row);if(requestTiming(row as {status:string;expires_at:Date},this.now()).status==='EXPIRED')throw new ApiProblem(409,'REQUEST_EXPIRED','This request response deadline has passed.');
    if(row.status!=='PENDING')throw new ApiProblem(409,'DECISION_RECORDED','This request has already been decided.');
    const context=await this.safety(client,row);const coverage=await this.paidAccess.forRequest(client,row);
    if(requestTiming(row as {status:string;expires_at:Date},this.now()).status==='EXPIRED')throw new ApiProblem(409,'REQUEST_EXPIRED','This request response deadline has passed.');
    return {...context,coverage};
  }
  private async acceptOffer(client:PoolClient,row:Row){const current=await this.listings.requireAvailable(client,row.listing_id);if(current.user_id!==row.tutor_id||current.revision!==row.listing_revision||current.profile_revision!==row.profile_revision||current.offer.subject_id!==row.offer_snapshot.subject_id||current.offer.teaching_mode!==row.offer_snapshot.teaching_mode)throw new ApiProblem(409,'OFFER_CHANGED','The submitted teaching offer changed. A new enquiry is required.');}
  private async decisionView(client:PoolClient,row:Row,replayed:boolean){const connection=(await client.query('SELECT id,status FROM connections WHERE request_id=$1',[row.id])).rows[0];return {request_id:row.id,status:row.status,connection_id:connection?.id||null,connection_status:connection?.status||null,replayed};}

  async decide(token:string|undefined,id:string,decision:'ACCEPT'|'DECLINE',correlation:string){return this.database.transaction(async client=>{
    let found=(await client.query('SELECT * FROM contact_requests WHERE id=$1',[id])).rows[0];
    const {user}=await this.auth.authenticated(client,token,found?[found.payer_id,found.tutor_id]:[]);
    found=(await client.query('SELECT * FROM contact_requests WHERE id=$1',[id])).rows[0];
    if(!found||found.tutor_id!==user.id)throw missing();if(!user.roles.includes('TUTOR'))throw denied('TUTOR_ROLE_REQUIRED','Your Tutor role is required.');this.source(found);
    const prior=(await client.query('SELECT decision FROM contact_request_decisions WHERE request_id=$1',[id])).rows[0];
    if(prior){if(prior.decision!==decision)throw new ApiProblem(409,'DECISION_RECORDED','The original decision cannot be changed.');return this.decisionView(client,found,true);}
    const {coverage}=await this.pending(client,found);if(decision==='ACCEPT')await this.acceptOffer(client,found);
    // Coverage/purchase lock is held before the request transition and future refund coordination.
    const row=(await client.query('SELECT * FROM contact_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
    const at=this.now();if(requestTiming(row,at).status!=='PENDING')throw new ApiProblem(409,'REQUEST_EXPIRED','The request is no longer pending within its response deadline.');
    await client.query('INSERT INTO contact_request_decisions(request_id,tutor_id,decision,decided_at) VALUES($1,$2,$3,$4)',[id,user.id,decision,at]);
    if(decision==='ACCEPT'){
      const connectionId=randomUUID();const ready=await this.paidAccess.activate(client,coverage,at,{actor_id:user.id,request_id:row.id,correlation});
      await client.query('INSERT INTO connections(id,request_id,status,created_at) VALUES($1,$2,$3,$4)',[connectionId,id,ready?'ACTIVE':'PENDING_GRANT',at]);
      await client.query("INSERT INTO connection_participants(connection_id,user_id,role) VALUES($1,$2,'PAYER'),($1,$3,'TUTOR')",[connectionId,row.payer_id,row.tutor_id]);
      await client.query('INSERT INTO conversations(id,connection_id,created_at) VALUES($1,$2,$3)',[randomUUID(),connectionId,at]);
      if(ready)await client.query("INSERT INTO connection_access_grants(connection_id,entitlement_id,source,granted_at) VALUES($1,$2,$3,$4)",[connectionId,row.entitlement_id,coverage.source,at]);
      await this.audit(client,user.id,ready?'CONNECTION_ESTABLISHED':'CONNECTION_AWAITING_ACCESS',connectionId,correlation);
    }
    await client.query('UPDATE contact_requests SET status=$2,updated_at=$3 WHERE id=$1',[id,decision==='ACCEPT'?'ACCEPTED':'DECLINED',at]);
    await this.audit(client,user.id,'CONTACT_REQUEST_'+decision,id,correlation);return this.decisionView(client,{...row,status:decision==='ACCEPT'?'ACCEPTED':'DECLINED'},false);
  });}

  async inbox(token:string|undefined,cursor?:string){return this.database.transaction(async client=>{
    const actor=await this.auth.sessionOwner(client,token);let rows=actor?(await client.query("SELECT * FROM contact_requests WHERE tutor_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) AND (NOT $3::boolean OR (coverage_snapshot->>'source'='PAYMENT' AND coverage_snapshot->>'test_only'='false')) ORDER BY id LIMIT 21",[actor,cursor||null,this.config.mode==='production'])).rows:[];
    const {user}=await this.auth.authenticated(client,token,rows.map(row=>row.payer_id));if(!user.roles.includes('TUTOR'))throw denied('TUTOR_ROLE_REQUIRED','Your Tutor role is required.');
    if(rows.length)rows=(await client.query('SELECT * FROM contact_requests WHERE id=ANY($1::uuid[]) AND tutor_id=$2 ORDER BY id',[rows.map(row=>row.id),user.id])).rows;
    const requests=[];for(const row of rows.slice(0,20)){
      let canDecline=false;let canAccept=false;let reason:string|null=null;let message:Row|null=null;
      try{await this.pending(client,row);canDecline=true;message=decrypt<Row>(row.encrypted_message,this.config.authSecret);try{await this.acceptOffer(client,row);canAccept=true;}catch(error){if(!(error instanceof ApiProblem))throw error;reason=code(error);}}catch(error){if(!(error instanceof ApiProblem))throw error;reason=code(error);}
      const connection=(await client.query('SELECT id FROM connections WHERE request_id=$1',[row.id])).rows[0];
      requests.push({id:row.id,offer:row.offer_snapshot,...requestTiming(row,this.now()),created_at:new Date(row.created_at).toISOString(),learning_requirements:message?.learning_requirements||null,preferred_times:message?.preferred_times||null,can_accept:canAccept,can_decline:canDecline,unavailable_reason:reason,connection_id:connection?.id||null,test_only:testCoverage(row.coverage_snapshot)});
    }return {requests,next_cursor:rows.length>20?rows[19].id:null};
  });}

  private async context(client:PoolClient,actor:Row,found:Row):Promise<ConnectionContext>{
    if(![found.payer_id,found.tutor_id].includes(actor.id)||!(await client.query('SELECT 1 FROM connection_participants WHERE connection_id=$1 AND user_id=$2',[found.id,actor.id])).rowCount)throw missing();
    this.source(found);await requireSafetyClear(client,'CONNECTION',found.id);const {learner}=await this.safety(client,found);
    const connection=(await client.query('SELECT * FROM connections WHERE id=$1 FOR UPDATE',[found.id])).rows[0];
    if(connection.safety_suspended)throw denied('CONNECTION_RESTRICTED','This Connection is restricted.');
    const grant=(await client.query('SELECT * FROM connection_access_grants WHERE connection_id=$1 FOR UPDATE',[found.id])).rows[0];
    if(connection.status!=='ACTIVE'||!grant)throw denied('ACCESS_PENDING','Contacts are unavailable while access activation is pending.');
    if(grant.revoked_at||grant.source!==found.coverage_snapshot.source||!coverageAllowed(this.config,found.coverage_snapshot)||grant.entitlement_id!==found.entitlement_id)throw denied('CONNECTION_ACCESS_REVOKED','Connection access is unavailable.');
    return {connection,request:found,actor,learner};
  }
  private query(){return 'SELECT c.id,c.status,c.safety_suspended,c.created_at AS connected_at,r.id AS request_id,r.payer_id,r.tutor_id,r.learner_id,r.listing_id,r.offer_snapshot,r.coverage_snapshot,r.entitlement_id,r.encrypted_message FROM connections c JOIN contact_requests r ON r.id=c.request_id';}

  // Task 12 messages must enter through this transaction/permission boundary as well.
  async withConnection<T>(token:string|undefined,id:string,command:(client:PoolClient,context:ConnectionContext)=>Promise<T>):Promise<T>{return this.database.transaction(async client=>{const found=(await client.query(this.query()+' WHERE c.id=$1',[id])).rows[0];const {user}=await this.auth.authenticated(client,token,found?[found.payer_id,found.tutor_id]:[]);if(!found)throw missing();return command(client,await this.context(client,user,found));});}
  async detail(token:string|undefined,id:string){return this.withConnection(token,id,async(_client,context)=>({connection:{id:context.connection.id,request_id:context.request.request_id,listing_id:context.request.listing_id,offer:context.request.offer_snapshot,status:context.connection.status,created_at:new Date(context.connection.created_at).toISOString(),your_role:context.actor.id===context.request.tutor_id?'TUTOR':'PAYER',learner_kind:context.learner.kind,...decrypt<Row>(context.request.encrypted_message,this.config.authSecret),test_only:testCoverage(context.request.coverage_snapshot)}}));}
  async contacts(token:string|undefined,id:string,correlation:string){return this.withConnection(token,id,async(client,context)=>{const peerId=context.actor.id===context.request.tutor_id?context.request.payer_id:context.request.tutor_id;const peer=(await client.query("SELECT display_name,email FROM users WHERE id=$1 AND status='ACTIVE' AND email_verified_at IS NOT NULL",[peerId])).rows[0];if(!peer)throw denied('CONTACT_UNAVAILABLE','The verified adult contact is unavailable.');await this.audit(client,context.actor.id,'CONNECTION_CONTACTS_READ',id,correlation);return {peer:{display_name:peer.display_name,email:peer.email,email_verified:true,role:peerId===context.request.tutor_id?'TUTOR':context.learner.kind==='CHILD'?'GUARDIAN':'ADULT_LEARNER'}};});}
  async list(token:string|undefined,cursor?:string){return this.database.transaction(async client=>{
    const actor=await this.auth.sessionOwner(client,token);const rows=actor?(await client.query(this.query()+" JOIN connection_participants cp ON cp.connection_id=c.id WHERE cp.user_id=$1 AND ($2::uuid IS NULL OR c.id>$2::uuid) AND (NOT $3::boolean OR (r.coverage_snapshot->>'source'='PAYMENT' AND r.coverage_snapshot->>'test_only'='false')) ORDER BY c.id LIMIT 21",[actor,cursor||null,this.config.mode==='production'])).rows:[];
    const {user}=await this.auth.authenticated(client,token,rows.flatMap(row=>[row.payer_id,row.tutor_id]));const connections=[];for(const row of rows.slice(0,20)){let available=false;let reason:string|null=null;try{await this.context(client,user,row);available=true;}catch(error){if(!(error instanceof ApiProblem))throw error;reason=code(error);}const unread_count=available?Number((await client.query('SELECT count(*) FROM conversations c JOIN conversation_messages m ON m.conversation_id=c.id LEFT JOIN conversation_read_positions p ON p.conversation_id=c.id AND p.user_id=$2 WHERE c.connection_id=$1 AND m.sender_id<>$2 AND m.sequence>COALESCE(p.last_read_sequence,0)',[row.id,user.id])).rows[0].count):null;connections.push({unread_count,id:row.id,request_id:row.request_id,listing_id:row.listing_id,offer:row.offer_snapshot,status:row.status,available,unavailable_reason:reason,created_at:new Date(row.connected_at).toISOString(),test_only:testCoverage(row.coverage_snapshot)});}return {connections,next_cursor:rows.length>20?rows[19].id:null};
  });}
}
