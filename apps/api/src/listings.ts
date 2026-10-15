import {requireSafetyClear} from './safety-permissions.js';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {Database} from './database.js';
import {AuthService} from './auth.js';
import {StaffService} from './staff.js';
import {CatalogueService,selectionInput} from './catalogue.js';
import {TutorsService} from './tutors.js';
import {ApiProblem} from './errors.js';

const noContact=(value:string)=>!/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d)/i.test(value);
const text=(min:number,max:number)=>z.string().trim().min(min).max(max).refine(noContact,'Keep contact details and links out of public offers.');
export const offerInput=z.strictObject({
  title:text(10,100),description:text(40,1500),
  domain_id:selectionInput.shape.domain_id,subject_id:selectionInput.shape.subject_id,level_id:selectionInput.shape.level_id,
  curriculum_id:selectionInput.shape.curriculum_id,exam_id:selectionInput.shape.exam_id,
  language_ids:z.array(selectionInput.shape.language_id).min(1).max(3).refine(ids=>new Set(ids).size===ids.length),
  currency:z.literal('INR'),teaching_mode:z.literal('ONLINE'),rate_paise:z.number().int().min(100).max(10000000),
  rate_unit:z.enum(['HOUR','LESSON']),lesson_minutes:z.number().int().min(30).max(180).optional(),
  trial_kind:z.enum(['NONE','FREE','PAID']),trial_minutes:z.number().int().min(15).max(90).optional(),trial_price_paise:z.number().int().min(100).max(10000000).optional(),
}).superRefine((v,c)=>{
  const invalid=(message:string)=>c.addIssue({code:'custom',message});
  if((v.rate_unit==='LESSON')!==!!v.lesson_minutes)invalid('Specify lesson duration only for per-lesson rates.');
  if((v.trial_kind!=='NONE')!==!!v.trial_minutes||(v.trial_kind==='PAID')!==!!v.trial_price_paise)invalid('Trial duration and price must match the trial type.');
  if(v.domain_id==='school'&&!v.curriculum_id)invalid('School offers require a Curriculum.');
  if(v.domain_id==='entrance'&&!v.exam_id)invalid('Entrance offers require an Exam Track.');
  if(v.exam_id&&['exam-jee','exam-jee-main','exam-jee-advanced'].includes(v.exam_id)&&!['subject-physics','subject-chemistry','subject-mathematics'].includes(v.subject_id))invalid('Choose a JEE Subject.');
  if(v.exam_id==='exam-neet'&&!['subject-physics','subject-chemistry','subject-biology'].includes(v.subject_id))invalid('Choose a NEET Subject.');
  if(v.curriculum_id==='curriculum-icse'&&['level-class-11','level-class-12'].includes(v.level_id)||v.curriculum_id==='curriculum-isc'&&!['level-class-11','level-class-12'].includes(v.level_id))invalid('Use ICSE through class 10 and ISC for classes 11–12.');
});
export const versionInput=z.strictObject({revision:z.number().int().positive()});
export const editOfferInput=z.strictObject({revision:versionInput.shape.revision,offer:offerInput});
export const listingReviewInput=z.strictObject({revision:versionInput.shape.revision,outcome:z.enum(['APPROVE','CHANGES_REQUESTED']),reason:z.string().trim().min(10).max(240)});
export const listingSafetyInput=z.strictObject({revision:versionInput.shape.revision,action:z.enum(['SUSPEND','LIFT']),reason:z.string().trim().min(10).max(240)});
type Offer=z.infer<typeof offerInput>;
const fail=(code:string,message:string,status=409)=>new ApiProblem(status,code,message);

export class ListingsService {
  constructor(private readonly database:Database,private readonly auth:AuthService,private readonly staff:StaffService,private readonly catalogue:CatalogueService,private readonly tutors:TutorsService,private readonly now:()=>Date=()=>new Date()){}
  private role(user:{roles:string[]}){if(!user.roles.includes('TUTOR'))throw fail('TUTOR_ROLE_REQUIRED','Choose the Tutor role.',403);}
  private async row(client:PoolClient,id:string,owner?:string){const row=(await client.query('SELECT * FROM teaching_listings WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row||owner&&row.user_id!==owner)throw fail('NOT_FOUND','Listing not found.',404);return row;}
  private version(row:Record<string,any>,revision:number){if(row.revision!==revision)throw fail('STALE_LISTING','This offer changed. Refresh it before continuing.');}
  private async selection(client:PoolClient,offer:Offer){for(const language_id of offer.language_ids)await this.catalogue.requireSelection(client,{domain_id:offer.domain_id,subject_id:offer.subject_id,level_id:offer.level_id,curriculum_id:offer.curriculum_id,exam_id:offer.exam_id,language_id});}
  private async audit(client:PoolClient,actor:string,id:string,event:string,correlation:string,reason?:string){await client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,event,correlation,this.now(),{target:id,...(reason?{reason}:{})}]);}
  private async view(client:PoolClient,row:Record<string,any>){
    const profile=(await client.query('SELECT revision FROM tutor_profiles WHERE user_id=$1',[row.user_id])).rows[0];
    const stale=profile?.revision!==row.profile_revision;let eligible=false;
    if(row.status==='PUBLISHED'&&row.approved&&!row.safety_suspended&&!stale){
      // Eligibility failures are ordinary state; database/programming failures must propagate.
      try{await requireSafetyClear(client,'LISTING',row.id);await this.tutors.requireQualified(client,row.user_id,row.payload.subject_id);await this.selection(client,row.payload);eligible=true;}catch(error){if(!(error instanceof ApiProblem))throw error;}
    }
    return {id:row.id,user_id:row.user_id,offer:row.payload,revision:row.revision,profile_revision:row.profile_revision,status:row.safety_suspended?'SAFETY_SUSPENDED':stale&&row.status!=='DRAFT'?'CHANGES_REQUESTED':row.status,eligible,requires_profile_review:stale,review_reason:row.review_reason,reviewed_by:row.reviewed_by,reviewed_at:row.reviewed_at,safety_reason:row.safety_reason};
  }
  async own(token?:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);this.role(user);
    const rows=(await client.query('SELECT * FROM teaching_listings WHERE user_id=$1 ORDER BY created_at,id',[user.id])).rows;const listings=[];
    for(const row of rows)listings.push(await this.view(client,row));
    const candidates=(await client.query("SELECT DISTINCT c.subject_id FROM tutor_claims c JOIN tutor_profiles p ON p.user_id=c.user_id AND p.revision=c.profile_revision JOIN catalogue_terms t ON t.id=c.subject_id AND t.kind='SUBJECT' AND t.active WHERE c.user_id=$1 AND c.kind IN ('QUALIFICATION','EXPERIENCE') AND c.status='APPROVED' ORDER BY c.subject_id",[user.id])).rows;
    const eligible_subject_ids:string[]=[];
    for(const candidate of candidates){try{await this.tutors.requireQualified(client,user.id,candidate.subject_id);eligible_subject_ids.push(candidate.subject_id);}catch(error){if(!(error instanceof ApiProblem)||![403,404].includes(error.getStatus()))throw error;}}
    return {listings,eligible_subject_ids};
  });}
  async create(token:string|undefined,offer:Offer,correlation:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);this.role(user);const qualified=await this.tutors.requireQualified(client,user.id,offer.subject_id);await this.selection(client,offer);
    if(Number((await client.query('SELECT count(*) FROM teaching_listings WHERE user_id=$1',[user.id])).rows[0].count)>=20)throw fail('LISTING_LIMIT','At most twenty offers per Tutor.',429);
    const id=randomUUID();await client.query('INSERT INTO teaching_listings(id,user_id,payload,profile_revision,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)',[id,user.id,offer,qualified.profile_revision,this.now()]);await this.audit(client,user.id,id,'LISTING_CREATED',correlation);return {listing:await this.view(client,await this.row(client,id))};
  });}
  async edit(token:string|undefined,id:string,input:z.infer<typeof editOfferInput>,correlation:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);this.role(user);
    // Owner -> profile -> listing follows Tutor review/revision lock order.
    const profile=(await client.query('SELECT revision FROM tutor_profiles WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0];const row=await this.row(client,id,user.id);this.version(row,input.revision);await this.selection(client,input.offer);
    await client.query("UPDATE teaching_listings SET payload=$2,profile_revision=$3,revision=revision+1,status='DRAFT',approved=false,review_reason=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=$4 WHERE id=$1",[id,input.offer,profile.revision,this.now()]);await this.audit(client,user.id,id,'LISTING_EDITED',correlation);return {listing:await this.view(client,await this.row(client,id))};
  });}
  async ownerAction(token:string|undefined,id:string,action:'SUBMIT'|'PAUSE'|'RESUME',revision:number,correlation:string){return this.database.transaction(async client=>{
    const {user}=await this.auth.authenticated(client,token);this.role(user);const profile=(await client.query('SELECT revision FROM tutor_profiles WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0];const row=await this.row(client,id,user.id);this.version(row,revision);
    if(row.safety_suspended)throw fail('SAFETY_SUSPENDED','Staff must lift the safety suspension.');
    let status:string;
    if(action==='PAUSE'){if(row.status!=='PUBLISHED')throw fail('INVALID_LISTING_STATE','Only a published offer can be paused.');status='PAUSED';}
    else{
      if(row.profile_revision!==profile.revision)throw fail('PROFILE_CHANGED','Save the offer again after your revised Tutor profile is approved.');
      await this.tutors.requireQualified(client,user.id,row.payload.subject_id);await this.selection(client,row.payload);
      if(action==='SUBMIT'){if(!['DRAFT','CHANGES_REQUESTED'].includes(row.status))throw fail('INVALID_LISTING_STATE','Only draft or corrected offers can be submitted.');status='REVIEW';}
      else{if(row.status!=='PAUSED'||!row.approved)throw fail('INVALID_LISTING_STATE','Only an approved paused offer can resume.');status='PUBLISHED';}
    }
    await client.query('UPDATE teaching_listings SET status=$2,revision=revision+1,updated_at=$3 WHERE id=$1',[id,status,this.now()]);await this.audit(client,user.id,id,'LISTING_'+action,correlation);return {listing:await this.view(client,await this.row(client,id))};
  });}
  private async staffRow(client:PoolClient,actor:string,id:string){const found=(await client.query('SELECT user_id FROM teaching_listings WHERE id=$1',[id])).rows[0];if(!found)throw fail('NOT_FOUND','Listing not found.',404);if(found.user_id===actor)throw fail('SELF_REVIEW','You cannot review or lift restrictions on your own offer.',403);await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[found.user_id]);await client.query('SELECT user_id FROM tutor_profiles WHERE user_id=$1 FOR UPDATE',[found.user_id]);return this.row(client,id);}
  private async staffTarget(client:PoolClient,account:string|undefined,token:string|undefined,id:string){
    const found=(await client.query('SELECT user_id FROM teaching_listings WHERE id=$1',[id])).rows[0];
    const actor=await this.staff.authorize(client,account,token,'TRUST',found?[found.user_id]:[]);
    return {actor,row:await this.staffRow(client,actor.id,id)};
  }
  async queue(account?:string,token?:string){return this.database.transaction(async client=>{await this.staff.authorize(client,account,token,'TRUST');return {listings:(await client.query("SELECT id,payload->>'title' AS title,status,safety_suspended,revision FROM teaching_listings ORDER BY updated_at DESC LIMIT 100")).rows};});}
  async inspect(account:string|undefined,token:string|undefined,id:string,reason:string,correlation:string){return this.database.transaction(async client=>{const {actor,row}=await this.staffTarget(client,account,token,id);await this.audit(client,actor.id,id,'LISTING_INSPECTED',correlation,reason);return {listing:await this.view(client,row)};});}
  async review(account:string|undefined,token:string|undefined,id:string,input:z.infer<typeof listingReviewInput>,correlation:string){return this.database.transaction(async client=>{
    const {actor,row}=await this.staffTarget(client,account,token,id);this.version(row,input.revision);if(row.status!=='REVIEW'||row.safety_suspended)throw fail('INVALID_LISTING_STATE','Only an unrestricted submitted offer can be reviewed.');
    if(input.outcome==='APPROVE'){const current=await this.tutors.requireQualified(client,row.user_id,row.payload.subject_id);if(current.profile_revision!==row.profile_revision)throw fail('PROFILE_CHANGED','The Tutor profile changed. Request a corrected offer.');await this.selection(client,row.payload);}
    await client.query('UPDATE teaching_listings SET status=$2,approved=$3,revision=revision+1,review_reason=$4,reviewed_by=$5,reviewed_at=$6,updated_at=$6 WHERE id=$1',[id,input.outcome==='APPROVE'?'PUBLISHED':'CHANGES_REQUESTED',input.outcome==='APPROVE',input.reason,actor.id,this.now()]);await this.decision(client,actor.id,row,input.outcome,input.reason,correlation);return {listing:await this.view(client,await this.row(client,id))};
  });}
  private async decision(client:PoolClient,actor:string,row:Record<string,any>,outcome:string,reason:string,correlation:string){await client.query('INSERT INTO listing_decisions(id,listing_id,actor_id,revision,outcome,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),row.id,actor,row.revision,outcome,reason,this.now()]);await this.audit(client,actor,row.id,'LISTING_'+outcome,correlation,reason);}
  async safety(account:string|undefined,token:string|undefined,id:string,input:z.infer<typeof listingSafetyInput>,correlation:string){return this.database.transaction(async client=>{const {actor,row}=await this.staffTarget(client,account,token,id);this.version(row,input.revision);const suspend=input.action==='SUSPEND';if(row.safety_suspended===suspend)throw fail('INVALID_LISTING_STATE','That restriction state is already recorded.');await client.query("UPDATE teaching_listings SET safety_suspended=$2,status=CASE WHEN status='PUBLISHED' THEN 'PAUSED' ELSE status END,revision=revision+1,safety_reason=$3,safety_actor=$4,updated_at=$5 WHERE id=$1",[id,suspend,input.reason,actor.id,this.now()]);await this.decision(client,actor.id,row,input.action,input.reason,correlation);return {listing:await this.view(client,await this.row(client,id))};});}
  // Task 08 and later commands use this seam; they never trust a stored status alone.
  async requireAvailable(client:PoolClient,id:string){const found=(await client.query('SELECT user_id FROM teaching_listings WHERE id=$1',[id])).rows[0];if(!found)throw fail('NOT_FOUND','Listing unavailable.',404);await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[found.user_id]);await client.query('SELECT user_id FROM tutor_profiles WHERE user_id=$1 FOR UPDATE',[found.user_id]);const row=await this.row(client,id);const view=await this.view(client,row);if(!view.eligible)throw fail('NOT_FOUND','Listing unavailable.',404);return view;}
  async publicOffer(id:string){return this.database.transaction(async client=>{const view=await this.requireAvailable(client,id);return {listing:{id:view.id,...view.offer,verification:'Identity and matching Subject evidence reviewed; approval is not a teaching-quality guarantee.'}};});}
}
