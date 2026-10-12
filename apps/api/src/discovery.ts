import {z} from 'zod';
import type {Config} from './config.js';
import {Database} from './database.js';
import {ApiProblem} from './errors.js';
import {isAdult} from './tutors.js';
import {decrypt} from './security.js';
const slug=z.string().regex(/^[a-z][a-z0-9-]{1,79}$/);
const integer=(min:number,max:number)=>z.string().regex(/^\d{1,8}$/).transform(Number).pipe(z.number().int().min(min).max(max));
export const discoveryInput=z.strictObject({domain_id:slug.optional(),subject_id:slug.optional(),level_id:slug.optional(),curriculum_id:slug.optional(),exam_id:slug.optional(),language_id:slug.optional(),rate_unit:z.enum(['HOUR','LESSON']).optional(),min_rate_paise:integer(100,10000000).optional(),max_rate_paise:integer(100,10000000).optional(),cursor:z.uuid().optional(),limit:integer(1,24).optional()}).superRefine((v,c)=>{
  if((v.min_rate_paise!==undefined||v.max_rate_paise!==undefined)&&!v.rate_unit)c.addIssue({code:'custom',message:'Choose an hourly or per-lesson unit when filtering by price.'});
  if(v.min_rate_paise!==undefined&&v.max_rate_paise!==undefined&&v.min_rate_paise>v.max_rate_paise)c.addIssue({code:'custom',message:'Minimum price must not exceed maximum price.'});
});
type Filters=z.infer<typeof discoveryInput>;
// One row per exact offer. Independent profile tags never participate in matching.
const availableSql=`SELECT l.id,l.payload,p.display_name,p.encrypted_birth_date,
  (SELECT jsonb_agg(jsonb_build_object('kind',c.kind,'reviewed_at',c.reviewed_at,'expires_at',c.expires_at) ORDER BY c.kind,c.id)
   FROM tutor_claims c JOIN tutor_evidence e ON e.id=c.evidence_id AND e.user_id=c.user_id
   WHERE c.user_id=l.user_id AND c.profile_revision=p.revision AND c.status='APPROVED' AND c.expires_at>$1
     AND e.scan_status='CLEAN' AND (NOT $2::boolean OR NOT e.test_only)
     AND (c.kind='IDENTITY' OR c.subject_id=l.payload->>'subject_id')) AS evidence_labels
 FROM teaching_listings l JOIN tutor_profiles p ON p.user_id=l.user_id JOIN users u ON u.id=l.user_id
 WHERE l.status='PUBLISHED' AND l.approved AND NOT l.safety_suspended
   AND p.status='APPROVED' AND p.revision=l.profile_revision AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL AND 'TUTOR'=ANY(u.roles)
   AND EXISTS (SELECT 1 FROM tutor_claims c JOIN tutor_evidence e ON e.id=c.evidence_id AND e.user_id=c.user_id
     WHERE c.user_id=l.user_id AND c.profile_revision=p.revision AND c.kind='IDENTITY' AND c.adult_identity_confirmed
       AND c.status='APPROVED' AND c.expires_at>$1 AND e.scan_status='CLEAN' AND (NOT $2::boolean OR NOT e.test_only))
   AND EXISTS (SELECT 1 FROM tutor_claims c JOIN tutor_evidence e ON e.id=c.evidence_id AND e.user_id=c.user_id
     WHERE c.user_id=l.user_id AND c.profile_revision=p.revision AND c.kind IN ('QUALIFICATION','EXPERIENCE') AND c.subject_id=l.payload->>'subject_id'
       AND c.status='APPROVED' AND c.expires_at>$1 AND e.scan_status='CLEAN' AND (NOT $2::boolean OR NOT e.test_only))
   AND NOT EXISTS (SELECT 1 FROM (VALUES ('SUBJECT',l.payload->>'subject_id'),('LEVEL',l.payload->>'level_id'),('CURRICULUM',l.payload->>'curriculum_id'),('EXAM',l.payload->>'exam_id')) AS field(kind,id)
     WHERE field.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalogue_terms t WHERE t.id=field.id AND t.kind=field.kind AND t.active AND l.payload->>'domain_id'=ANY(t.domain_ids)))
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(l.payload->'language_ids') AS language(id)
     WHERE NOT EXISTS (SELECT 1 FROM catalogue_terms t WHERE t.id=language.id AND t.kind='LANGUAGE' AND t.active AND l.payload->>'domain_id'=ANY(t.domain_ids)))`;

export class DiscoveryService {
  constructor(private readonly database:Database,private readonly config:Config,private readonly now:()=>Date=()=>new Date()){}
  private project(row:Record<string,any>,at:Date){
    if(!isAdult(decrypt<{birth_date:string}>(row.encrypted_birth_date,this.config.authSecret).birth_date,at))return undefined;
    // Reviewed profile names are public, but a contact accidentally entered as a
    // display name must not become a public contact field.
    const name=/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d)/i.test(row.display_name)?'Tutor':row.display_name;
    const offer=row.payload;
    return {id:row.id,tutor:{display_name:name},offer:{title:offer.title,description:offer.description,domain_id:offer.domain_id,subject_id:offer.subject_id,level_id:offer.level_id,...(offer.curriculum_id?{curriculum_id:offer.curriculum_id}:{}),...(offer.exam_id?{exam_id:offer.exam_id}:{}),language_ids:offer.language_ids,currency:offer.currency,teaching_mode:offer.teaching_mode,rate_paise:offer.rate_paise,rate_unit:offer.rate_unit,...(offer.lesson_minutes?{lesson_minutes:offer.lesson_minutes}:{}),trial_kind:offer.trial_kind,...(offer.trial_minutes?{trial_minutes:offer.trial_minutes}:{}),...(offer.trial_price_paise?{trial_price_paise:offer.trial_price_paise}:{})},available:true,evidence_labels:row.evidence_labels.map((c:{kind:string;reviewed_at:string;expires_at:string})=>({kind:c.kind,label:c.kind==='IDENTITY'?'Identity and adult-status evidence reviewed':c.kind==='QUALIFICATION'?'Matching Subject qualification evidence reviewed':'Matching Subject experience evidence reviewed',reviewed_at:c.reviewed_at,expires_at:c.expires_at})),verification_disclaimer:'Evidence review does not guarantee teaching quality, qualification authenticity or learning outcomes.'};
  }
  async search(input:Filters){return this.database.transaction(async client=>{
    // Catalogue validation and the result projection share one read-only snapshot.
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if(input.domain_id&&!(await client.query('SELECT id FROM learning_domains WHERE id=$1',[input.domain_id])).rowCount)throw new ApiProblem(400,'INVALID_FILTER','Choose a known Learning Domain.');
    const fields=[['SUBJECT','subject_id'],['LEVEL','level_id'],['CURRICULUM','curriculum_id'],['EXAM','exam_id'],['LANGUAGE','language_id']] as const;
    for(const [kind,key] of fields){const id=input[key];if(!id)continue;const term=(await client.query('SELECT kind,active,domain_ids FROM catalogue_terms WHERE id=$1',[id])).rows[0];if(!term||!term.active||term.kind!==kind||input.domain_id&&!term.domain_ids.includes(input.domain_id))throw new ApiProblem(400,'INVALID_FILTER','Choose active filters of the correct type and Learning Domain.');}
    const at=this.now();const values:unknown[]=[at,this.config.mode==='production'];let sql=availableSql;
    const add=(fragment:(placeholder:string)=>string,value:unknown)=>{values.push(value);sql+=' AND '+fragment('$'+values.length);};
    for(const key of ['domain_id','subject_id','level_id','curriculum_id','exam_id','rate_unit'] as const)if(input[key])add(p=>`l.payload->>'${key}'=${p}`,input[key]);
    if(input.language_id)add(p=>`(l.payload->'language_ids') ? ${p}`,input.language_id);
    if(input.min_rate_paise!==undefined)add(p=>`(l.payload->>'rate_paise')::integer>=${p}`,input.min_rate_paise);
    if(input.max_rate_paise!==undefined)add(p=>`(l.payload->>'rate_paise')::integer<=${p}`,input.max_rate_paise);
    if(input.cursor)add(p=>`l.id>${p}::uuid`,input.cursor);
    const limit=input.limit||12;values.push(limit+1);sql+=` ORDER BY l.id LIMIT $${values.length}`;
    const rows=(await client.query(sql,values)).rows;const page=rows.slice(0,limit);const offers=page.map(row=>this.project(row,at)).filter(row=>row!==undefined);
    return {offers,next_cursor:rows.length>limit?page.at(-1).id:null,limit,order:'listing_id_ascending',price_currency:'INR'};
  });}
  async firstAvailable(input:Filters){let cursor:string|undefined;do{const page=await this.search({...input,limit:24,cursor});if(page.offers.length)return page.offers[0];cursor=page.next_cursor||undefined;}while(cursor);return undefined;}
  async detail(id:string){return this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const at=this.now();const row=(await client.query(availableSql+' AND l.id=$3',[at,this.config.mode==='production',id])).rows[0];const listing=row?this.project(row,at):undefined;if(!listing)throw new ApiProblem(404,'OFFER_UNAVAILABLE','This teaching offer is currently unavailable.');return {listing};});}
}
