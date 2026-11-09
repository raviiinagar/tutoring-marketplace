import {requireSafetyClear} from './safety-permissions.js';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Config} from './config.js';
import {Database} from './database.js';
import {AuthService} from './auth.js';
import {StaffService} from './staff.js';
import {ApiProblem} from './errors.js';
import type {GuardianVerifier} from './guardian-verifier.js';

export interface LearnerInput {alias:string;learning_requirements:string}
const notFound=()=>new ApiProblem(404,'NOT_FOUND','Profile or verification not found.');
export class LearnersService {
  constructor(private readonly database:Database,private readonly config:Config,private readonly auth:AuthService,private readonly staff:StaffService,private readonly verifier:GuardianVerifier|undefined,private readonly now:()=>Date=()=>new Date()){
    if(verifier&&config.mode==='production'&&(verifier.policy.test_only||!verifier.policy.approved_for_production||!verifier.policy.approval_reference))throw new Error('Production requires an approved Guardian verification and consent policy');
  }
  // ADR 0015: child profiles and Guardian verification are retired; a parent books
  // for their child from their own adult Learner profile.
  policy(){return {child_profiles_enabled:false,test_only:false,policy:null};}
  private role(user:Record<string,any>){if(!user.roles.includes('LEARNER'))throw new ApiProblem(403,'LEARNER_ROLE_REQUIRED','Enable your Learner role first.');}
  private async audit(client:PoolClient,actor:string,event:string,target:string,correlation:string,metadata:Record<string,unknown>={}){await client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,event,correlation,this.now(),{target,...metadata}]);}
  private publicProfile(row:Record<string,any>,hasRole:boolean){return {id:row.id,kind:row.kind,alias:row.alias,age_band:row.age_band,learning_requirements:row.learning_requirements,status:row.status,usable:hasRole&&row.status==='ACTIVE'&&row.kind==='ADULT',created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString()};}
  private async profiles(client:PoolClient,owner:string){const policy=this.verifier?.policy;return (await client.query(`SELECT p.*, (g.status='APPROVED' AND g.policy_id=$2 AND g.notice_version=$3 AND g.consent_version=$4 AND EXISTS(SELECT 1 FROM learner_consents c WHERE c.profile_id=p.id AND c.owner_id=p.owner_id AND c.withdrawn_at IS NULL AND c.notice_version=$3 AND c.consent_version=$4)) AS child_eligible
    FROM learner_profiles p LEFT JOIN guardian_verifications g ON g.id=p.guardian_verification_id AND g.user_id=p.owner_id WHERE p.owner_id=$1 ORDER BY p.created_at,p.id`,[owner,policy?.id||'',policy?.notice_version||'',policy?.consent_version||''])).rows;}
  async list(token?:string){return this.database.transaction(async client=>{const {user}=await this.auth.authenticated(client,token);return {profiles:(await this.profiles(client,user.id)).map(row=>this.publicProfile(row,user.roles.includes('LEARNER')))};});}
  async adult(token:string|undefined,input:LearnerInput,correlation:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);this.role(user);
    if((await client.query("SELECT id FROM learner_profiles WHERE owner_id=$1 AND kind='ADULT'",[user.id])).rows[0])throw new ApiProblem(409,'ADULT_PROFILE_EXISTS','Your adult Learner profile already exists.');
    const id=randomUUID();await client.query("INSERT INTO learner_profiles(id,owner_id,kind,alias,age_band,learning_requirements,adult_attested_at,created_at,updated_at) VALUES($1,$2,'ADULT',$3,'ADULT',$4,$5,$5,$5)",[id,user.id,input.alias,input.learning_requirements,this.now()]);
    await this.audit(client,user.id,'ADULT_LEARNER_CREATED',id,correlation);return {profile:this.publicProfile((await this.profiles(client,user.id)).find(row=>row.id===id)!,true)};
  });}
  // Future Contact Request commands must call this seam inside their transaction.
  async requireUsable(client:PoolClient,ownerId:string,profileId:string){
    await requireSafetyClear(client,'ACCOUNT',ownerId);
    const user=(await client.query("SELECT roles FROM users WHERE id=$1 AND status='ACTIVE' AND email_verified_at IS NOT NULL FOR UPDATE",[ownerId])).rows[0];
    const owned=(await client.query('SELECT kind,guardian_verification_id FROM learner_profiles WHERE id=$1 AND owner_id=$2 FOR UPDATE',[profileId,ownerId])).rows[0];
    if(!user||!owned)throw notFound();
    if(owned.kind==='CHILD'){
      await client.query('SELECT id FROM guardian_verifications WHERE id=$1 AND user_id=$2 FOR UPDATE',[owned.guardian_verification_id,ownerId]);
      await client.query('SELECT id FROM learner_consents WHERE profile_id=$1 AND withdrawn_at IS NULL FOR UPDATE',[profileId]);
    }
    const row=(await this.profiles(client,ownerId)).find(row=>row.id===profileId);
    if(!user||!row)throw notFound();this.role(user);
    if(!this.publicProfile(row,true).usable)throw new ApiProblem(403,'LEARNER_UNAVAILABLE','This Learner profile cannot currently be used.');return row;
  }
  async check(token:string|undefined,id:string){return this.database.transaction(async client=>{const {user}=await this.auth.authenticated(client,token);const row=await this.requireUsable(client,user.id,id);return {profile:this.publicProfile(row,true)};});}
  async edit(token:string|undefined,id:string,input:LearnerInput,correlation:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);await this.requireUsable(client,user.id,id);
    await client.query('UPDATE learner_profiles SET alias=$3,learning_requirements=$4,updated_at=$5 WHERE id=$1 AND owner_id=$2',[id,user.id,input.alias,input.learning_requirements,this.now()]);
    await this.audit(client,user.id,'LEARNER_PROFILE_UPDATED',id,correlation);return {profile:this.publicProfile((await this.profiles(client,user.id)).find(row=>row.id===id)!,true)};
  });}
  async withdraw(token:string|undefined,id:string,correlation:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);const row=(await client.query('SELECT kind FROM learner_profiles WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,user.id])).rows[0];if(!row)throw notFound();
    if(row.kind!=='CHILD')throw new ApiProblem(400,'CHILD_PROFILE_REQUIRED','This action is for child profile consent.');
    await client.query('UPDATE learner_consents SET withdrawn_at=$2 WHERE profile_id=$1 AND withdrawn_at IS NULL',[id,this.now()]);await client.query("UPDATE learner_profiles SET status='WITHDRAWN',updated_at=$2 WHERE id=$1",[id,this.now()]);
    await this.audit(client,user.id,'LEARNER_CONSENT_WITHDRAWN',id,correlation);return {code:'CONSENT_WITHDRAWN',message:'This profile can no longer be used for tutoring.'};
  });}
}
