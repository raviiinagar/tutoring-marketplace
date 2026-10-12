import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Config} from './config.js';
import {Database} from './database.js';
import {AuthService} from './auth.js';
import {StaffService} from './staff.js';
import {ApiProblem} from './errors.js';
import {encrypt,decrypt} from './security.js';
import type {GuardianEvidence,GuardianVerifier} from './guardian-verifier.js';

export interface LearnerInput {alias:string;learning_requirements:string}
export interface ConsentInput {accepted:true;notice_version:string;consent_version:string}
export interface ReviewInput {decision:'APPROVE'|'REJECT'|'REVOKE';identifiable_adult_reviewed:boolean;authority_reviewed:boolean;reason:string}
const notFound=()=>new ApiProblem(404,'NOT_FOUND','Profile or verification not found.');
export class LearnersService {
  constructor(private readonly database:Database,private readonly config:Config,private readonly auth:AuthService,private readonly staff:StaffService,private readonly verifier:GuardianVerifier|undefined,private readonly now:()=>Date=()=>new Date()){
    if(verifier&&config.mode==='production'&&(verifier.policy.test_only||!verifier.policy.approved_for_production||!verifier.policy.approval_reference))throw new Error('Production requires an approved Guardian verification and consent policy');
  }
  policy(){const policy=this.verifier?.policy;return {child_profiles_enabled:!!policy,test_only:policy?.test_only??false,policy:policy?{id:policy.id,notice_version:policy.notice_version,consent_version:policy.consent_version,notice:policy.notice,consent:policy.consent}:null};}
  private enabled(){if(!this.verifier)throw new ApiProblem(503,'GUARDIAN_POLICY_UNAVAILABLE','Child profiles are unavailable until the Guardian verification policy is approved and configured.');return this.verifier;}
  private consent(input:ConsentInput){const {policy}=this.enabled();if(!input.accepted||input.notice_version!==policy.notice_version||input.consent_version!==policy.consent_version)throw new ApiProblem(400,'CONSENT_REQUIRED','Accept the current notice and consent version.');}
  private role(user:Record<string,any>){if(!user.roles.includes('LEARNER'))throw new ApiProblem(403,'LEARNER_ROLE_REQUIRED','Enable your Learner role first.');}
  private async audit(client:PoolClient,actor:string,event:string,target:string,correlation:string,metadata:Record<string,unknown>={}){await client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,event,correlation,this.now(),{target,...metadata}]);}
  private async approved(client:PoolClient,userId:string){const {policy}=this.enabled();const row=(await client.query("SELECT * FROM guardian_verifications WHERE user_id=$1 AND status='APPROVED' AND policy_id=$2 AND notice_version=$3 AND consent_version=$4 FOR UPDATE",[userId,policy.id,policy.notice_version,policy.consent_version])).rows[0];if(!row)throw new ApiProblem(403,'GUARDIAN_APPROVAL_REQUIRED','Guardian verification must be approved before a child profile can be used.');return row;}
  private publicProfile(row:Record<string,any>,hasRole:boolean){return {id:row.id,kind:row.kind,alias:row.alias,age_band:row.age_band,learning_requirements:row.learning_requirements,status:row.status,usable:hasRole&&row.status==='ACTIVE'&&(row.kind==='ADULT'||!!row.child_eligible),created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString()};}
  private async profiles(client:PoolClient,owner:string){const policy=this.verifier?.policy;return (await client.query(`SELECT p.*, (g.status='APPROVED' AND g.policy_id=$2 AND g.notice_version=$3 AND g.consent_version=$4 AND EXISTS(SELECT 1 FROM learner_consents c WHERE c.profile_id=p.id AND c.owner_id=p.owner_id AND c.withdrawn_at IS NULL AND c.notice_version=$3 AND c.consent_version=$4)) AS child_eligible
    FROM learner_profiles p LEFT JOIN guardian_verifications g ON g.id=p.guardian_verification_id AND g.user_id=p.owner_id WHERE p.owner_id=$1 ORDER BY p.created_at,p.id`,[owner,policy?.id||'',policy?.notice_version||'',policy?.consent_version||''])).rows;}
  async list(token?:string){return this.database.transaction(async client=>{const {user}=await this.auth.authenticated(client,token);return {profiles:(await this.profiles(client,user.id)).map(row=>this.publicProfile(row,user.roles.includes('LEARNER')))};});}
  async adult(token:string|undefined,input:LearnerInput,correlation:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);this.role(user);
    if((await client.query("SELECT id FROM learner_profiles WHERE owner_id=$1 AND kind='ADULT'",[user.id])).rows[0])throw new ApiProblem(409,'ADULT_PROFILE_EXISTS','Your adult Learner profile already exists.');
    const id=randomUUID();await client.query("INSERT INTO learner_profiles(id,owner_id,kind,alias,age_band,learning_requirements,adult_attested_at,created_at,updated_at) VALUES($1,$2,'ADULT',$3,'ADULT',$4,$5,$5,$5)",[id,user.id,input.alias,input.learning_requirements,this.now()]);
    await this.audit(client,user.id,'ADULT_LEARNER_CREATED',id,correlation);return {profile:this.publicProfile((await this.profiles(client,user.id)).find(row=>row.id===id)!,true)};
  });}
  async child(token:string|undefined,input:LearnerInput&{age_band:string;consent:ConsentInput},correlation:string){this.consent(input.consent);return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);this.role(user);const guardian=await this.approved(client,user.id);const id=randomUUID();
    await client.query("INSERT INTO learner_profiles(id,owner_id,kind,alias,age_band,learning_requirements,guardian_verification_id,created_at,updated_at) VALUES($1,$2,'CHILD',$3,$4,$5,$6,$7,$7)",[id,user.id,input.alias,input.age_band,input.learning_requirements,guardian.id,this.now()]);
    await client.query('INSERT INTO learner_consents(id,profile_id,owner_id,notice_version,consent_version,accepted_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,user.id,input.consent.notice_version,input.consent.consent_version,this.now()]);
    await this.audit(client,user.id,'CHILD_LEARNER_CREATED',id,correlation,{verification_id:guardian.id,notice_version:input.consent.notice_version,consent_version:input.consent.consent_version});return {profile:this.publicProfile((await this.profiles(client,user.id)).find(row=>row.id===id)!,true)};
  });}
  // Future Contact Request commands must call this seam inside their transaction.
  async requireUsable(client:PoolClient,ownerId:string,profileId:string){
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
    const {user}=await this.auth.authenticated(client,token);const row=await this.requireUsable(client,user.id,id);if(row.kind==='CHILD')await this.approved(client,user.id);
    await client.query('UPDATE learner_profiles SET alias=$3,learning_requirements=$4,updated_at=$5 WHERE id=$1 AND owner_id=$2',[id,user.id,input.alias,input.learning_requirements,this.now()]);
    await this.audit(client,user.id,'LEARNER_PROFILE_UPDATED',id,correlation);return {profile:this.publicProfile((await this.profiles(client,user.id)).find(row=>row.id===id)!,true)};
  });}
  async withdraw(token:string|undefined,id:string,correlation:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);const row=(await client.query('SELECT kind FROM learner_profiles WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,user.id])).rows[0];if(!row)throw notFound();
    if(row.kind!=='CHILD')throw new ApiProblem(400,'CHILD_PROFILE_REQUIRED','This action is for child profile consent.');
    await client.query('UPDATE learner_consents SET withdrawn_at=$2 WHERE profile_id=$1 AND withdrawn_at IS NULL',[id,this.now()]);await client.query("UPDATE learner_profiles SET status='WITHDRAWN',updated_at=$2 WHERE id=$1",[id,this.now()]);
    await this.audit(client,user.id,'LEARNER_CONSENT_WITHDRAWN',id,correlation);return {code:'CONSENT_WITHDRAWN',message:'This profile can no longer be used for tutoring.'};
  });}
  async consentAgain(token:string|undefined,id:string,input:ConsentInput,correlation:string){this.consent(input);return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);this.role(user);const guardian=await this.approved(client,user.id);
    const row=(await client.query('SELECT kind FROM learner_profiles WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,user.id])).rows[0];if(!row)throw notFound();if(row.kind!=='CHILD')throw new ApiProblem(400,'CHILD_PROFILE_REQUIRED','This action is for child profile consent.');
    await client.query('UPDATE learner_consents SET withdrawn_at=$2 WHERE profile_id=$1 AND withdrawn_at IS NULL',[id,this.now()]);
    await client.query('INSERT INTO learner_consents(id,profile_id,owner_id,notice_version,consent_version,accepted_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,user.id,input.notice_version,input.consent_version,this.now()]);
    await client.query("UPDATE learner_profiles SET status='ACTIVE',guardian_verification_id=$2,updated_at=$3 WHERE id=$1",[id,guardian.id,this.now()]);
    await this.audit(client,user.id,'LEARNER_CONSENT_ACCEPTED',id,correlation,{notice_version:input.notice_version,consent_version:input.consent_version});return {code:'CONSENT_ACCEPTED',message:'Current consent recorded.'};
  });}
  async applications(token?:string){return this.database.transaction(async client=>{const {user}=await this.auth.authenticated(client,token);const rows=(await client.query('SELECT id,status,policy_id,notice_version,consent_version,created_at,review_reason FROM guardian_verifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC',[user.id])).rows;return {verifications:rows.map(row=>({...row,created_at:new Date(row.created_at).toISOString()}))};});}
  async submit(token:string|undefined,evidence:GuardianEvidence,consent:ConsentInput,correlation:string){this.consent(consent);return this.database.transaction(async client=>{
    if(this.config.mode==='production'&&(evidence.adult_reference.startsWith('test-')||evidence.authority_reference.startsWith('test-')))throw new ApiProblem(400,'TEST_EVIDENCE_FORBIDDEN','Test evidence cannot be submitted in production.');
    const {user}=await this.auth.authenticated(client,token);this.role(user);const {policy}=this.enabled();
    if((await client.query("SELECT id FROM guardian_verifications WHERE user_id=$1 AND status IN ('PENDING','APPROVED')",[user.id])).rows[0])throw new ApiProblem(409,'GUARDIAN_CASE_EXISTS','An open or approved Guardian verification already exists.');
    const id=randomUUID();await client.query('INSERT INTO guardian_verifications(id,user_id,policy_id,notice_version,consent_version,consent_accepted_at,encrypted_evidence,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$6)',[id,user.id,policy.id,consent.notice_version,consent.consent_version,this.now(),encrypt({adult_reference:evidence.adult_reference,authority_reference:evidence.authority_reference},this.config.authSecret)]);
    await this.audit(client,user.id,'GUARDIAN_VERIFICATION_SUBMITTED',id,correlation,{policy_id:policy.id});return {id,status:'PENDING'};
  });}
  async queue(token:string|undefined,staffToken:string|undefined){this.enabled();return this.database.transaction(async client=>{await this.staff.authorize(client,token,staffToken,'TRUST');return {verifications:(await client.query('SELECT id,user_id,status,created_at FROM guardian_verifications ORDER BY created_at DESC,id DESC LIMIT 50')).rows};});}
  async inspect(token:string|undefined,staffToken:string|undefined,id:string,reason:string,correlation:string){this.enabled();return this.database.transaction(async client=>{
    const actor=await this.staff.authorize(client,token,staffToken,'TRUST');const row=(await client.query('SELECT * FROM guardian_verifications WHERE id=$1',[id])).rows[0];if(!row)throw notFound();
    await this.audit(client,actor.id,'GUARDIAN_EVIDENCE_INSPECTED',id,correlation,{reason});return {verification:{id:row.id,user_id:row.user_id,status:row.status,policy_id:row.policy_id,notice_version:row.notice_version,consent_version:row.consent_version,evidence:decrypt<GuardianEvidence>(row.encrypted_evidence,this.config.authSecret)}};
  });}
  async review(token:string|undefined,staffToken:string|undefined,id:string,input:ReviewInput,correlation:string){const verifier=this.enabled();return this.database.transaction(async client=>{
    const planned=(await client.query('SELECT user_id FROM guardian_verifications WHERE id=$1',[id])).rows[0];const actor=await this.staff.authorize(client,token,staffToken,'TRUST',planned?[planned.user_id]:[]);const row=(await client.query('SELECT * FROM guardian_verifications WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw notFound();if(row.user_id===actor.id)throw new ApiProblem(403,'SELF_REVIEW_FORBIDDEN','A different Trust reviewer must review this application.');
    const status=input.decision==='APPROVE'?'APPROVED':input.decision==='REJECT'?'REJECTED':'REVOKED';
    if((input.decision==='REVOKE'&&row.status!=='APPROVED')||(input.decision!=='REVOKE'&&row.status!=='PENDING'))throw new ApiProblem(409,'VERIFICATION_STATE_CHANGED','This verification has already changed state.');
    if(input.decision==='APPROVE'){
      const assessed=verifier.assess(decrypt<GuardianEvidence>(row.encrypted_evidence,this.config.authSecret));
      if(row.policy_id!==verifier.policy.id||row.notice_version!==verifier.policy.notice_version||row.consent_version!==verifier.policy.consent_version||!assessed.identifiable_adult||!assessed.lawful_authority||!input.identifiable_adult_reviewed||!input.authority_reviewed)throw new ApiProblem(400,'GUARDIAN_EVIDENCE_INSUFFICIENT','Adult identity, authority and current policy review are required.');
    }
    await client.query('UPDATE guardian_verifications SET status=$2,review_reason=$3,reviewed_at=$4 WHERE id=$1',[id,status,input.reason,this.now()]);
    await client.query('INSERT INTO guardian_reviews(id,verification_id,reviewer_id,decision,identifiable_adult_reviewed,authority_reviewed,policy_id,notice_version,consent_version,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),id,actor.id,input.decision,input.identifiable_adult_reviewed,input.authority_reviewed,row.policy_id,row.notice_version,row.consent_version,input.reason,this.now()]);
    await this.audit(client,actor.id,'GUARDIAN_VERIFICATION_'+status,id,correlation,{reason:input.reason,policy_id:row.policy_id});return {id,status};
  });}
}
