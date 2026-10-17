import {ReviewPublication} from './review-publication.js';
import {z} from 'zod';
import type {Config} from './config.js';
import {Database} from './database.js';
import {ApiProblem} from './errors.js';
import {isAdult} from './tutors.js';
import {decrypt} from './security.js';
import type {PoolClient} from 'pg';
const slug=z.string().regex(/^[a-z][a-z0-9-]{1,79}$/);
const integer=(min:number,max:number)=>z.string().regex(/^\d{1,8}$/).transform(Number).pipe(z.number().int().min(min).max(max));
export const discoveryInput=z.strictObject({domain_id:slug.optional(),subject_id:slug.optional(),level_id:slug.optional(),curriculum_id:slug.optional(),exam_id:slug.optional(),language_id:slug.optional(),rate_unit:z.enum(['HOUR','LESSON']).optional(),min_rate_paise:integer(100,10000000).optional(),max_rate_paise:integer(100,10000000).optional(),cursor:z.uuid().optional(),limit:integer(1,24).optional()}).superRefine((v,c)=>{
  if((v.min_rate_paise!==undefined||v.max_rate_paise!==undefined)&&!v.rate_unit)c.addIssue({code:'custom',message:'Choose an hourly or per-lesson unit when filtering by price.'});
  if(v.min_rate_paise!==undefined&&v.max_rate_paise!==undefined&&v.min_rate_paise>v.max_rate_paise)c.addIssue({code:'custom',message:'Minimum price must not exceed maximum price.'});
});
type Filters=z.infer<typeof discoveryInput>;
// One row per exact offer. Independent profile tags never participate in matching.
const availableSql=`SELECT l.id,l.user_id,l.revision,l.payload,p.display_name,p.encrypted_birth_date,photo.id AS photo_id,
  (SELECT jsonb_agg(jsonb_build_object('kind',c.kind,'reviewed_at',c.reviewed_at,'expires_at',c.expires_at) ORDER BY c.kind,c.id)
   FROM tutor_claims c JOIN tutor_evidence e ON e.id=c.evidence_id AND e.user_id=c.user_id
   WHERE c.user_id=l.user_id AND c.profile_revision=p.revision AND c.status='APPROVED' AND c.expires_at>$1
     AND e.scan_status='CLEAN' AND (NOT $2::boolean OR NOT e.test_only)
     AND (c.kind='IDENTITY' OR c.subject_id=l.payload->>'subject_id')) AS evidence_labels
 FROM teaching_listings l JOIN tutor_profiles p ON p.user_id=l.user_id JOIN users u ON u.id=l.user_id
 LEFT JOIN tutor_photos photo ON photo.user_id=l.user_id AND photo.status='APPROVED' AND photo.scan_status='CLEAN' AND photo.encrypted_payload IS NOT NULL AND (NOT $2::boolean OR NOT photo.test_only)
 WHERE l.status='PUBLISHED' AND l.approved AND NOT l.safety_suspended
   AND NOT EXISTS (SELECT 1 FROM safety_restrictions sr WHERE sr.lifted_at IS NULL AND ((sr.target_type='ACCOUNT' AND sr.target_id=u.id) OR (sr.target_type='LISTING' AND sr.target_id=l.id)))
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
  constructor(private readonly database:Database,private readonly config:Config,private readonly now:()=>Date=()=>new Date(),private readonly reviews=new ReviewPublication(config)){}
  async publicIndex(transaction?:PoolClient){const load=async(client:PoolClient)=>{
    const at=this.now(),rows=(await client.query(availableSql+' ORDER BY l.id LIMIT 5001',[at,this.config.mode==='production'])).rows;
    if(rows.length>5000)throw new ApiProblem(503,'INDEX_CAPACITY','The public index requires pagination before adding more supply.');
    await this.enrichReviews(client,rows);return rows.map(row=>this.project(row,at)).filter(row=>row!==undefined);
  };return transaction?load(transaction):this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return load(client);});}
  async alternatives(client:PoolClient,source:Record<string,any>,cursor?:string){
    const at=this.now();
    const rows=(await client.query(availableSql+`
      AND l.user_id<>$3 AND l.user_id<>$4
      AND l.payload->>'domain_id'=$5::jsonb->>'domain_id'
      AND l.payload->>'subject_id'=$5::jsonb->>'subject_id'
      AND l.payload->>'level_id'=$5::jsonb->>'level_id'
      AND (l.payload->>'curriculum_id') IS NOT DISTINCT FROM ($5::jsonb->>'curriculum_id')
      AND (l.payload->>'exam_id') IS NOT DISTINCT FROM ($5::jsonb->>'exam_id')
      AND l.payload->>'teaching_mode'=$5::jsonb->>'teaching_mode'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements_text($5::jsonb->'language_ids') lang(id) WHERE l.payload->'language_ids' ? lang.id)
      AND NOT EXISTS (SELECT 1 FROM account_blocks b WHERE (b.owner_id=$3 AND b.blocked_id=l.user_id) OR (b.blocked_id=$3 AND b.owner_id=l.user_id))
      AND NOT EXISTS (SELECT 1 FROM contact_requests r WHERE r.payer_id=$3 AND r.learner_id=$6 AND r.tutor_id=l.user_id
        AND (r.status='ACCEPTED' OR (r.status='PENDING' AND r.expires_at>$1)))
      AND ($7::uuid IS NULL OR l.id>$7::uuid) ORDER BY l.id LIMIT 7`,
    [at,this.config.mode==='production',source.payer_id,source.tutor_id,source.offer_snapshot,source.learner_id,cursor||null])).rows;
    await this.enrichReviews(client,rows);
    return {offers:rows.slice(0,6).map(row=>this.project(row,at)).filter(row=>row!==undefined),next_cursor:rows.length>6?rows[5].id:null};
  }
  private async enrichReviews(client:PoolClient,rows:Record<string,any>[]){if(!rows.length)return;const summaries=await this.reviews.summaries(client,[...new Set(rows.map(row=>row.user_id))]);for(const row of rows)row.review_summary=summaries.get(row.user_id);}
  private project(row:Record<string,any>,at:Date){
    if(!isAdult(decrypt<{birth_date:string}>(row.encrypted_birth_date,this.config.authSecret).birth_date,at))return undefined;
    // Reviewed profile names are public, but a contact accidentally entered as a
    // display name must not become a public contact field.
    const name=/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d)/i.test(row.display_name)?'Tutor':row.display_name;
    const offer=row.payload;
    return {id:row.id,public_path:'/teachers/'+offer.subject_id.replace(/^subject-/, '')+'-'+row.id,revision:row.revision,review_summary:row.review_summary||{count:0,average:null,label:'Connection-linked reviews'},tutor:{display_name:name,...(row.photo_id?{photo_url:`/v1/discovery/${row.id}/photos/${row.photo_id}`}:{})},offer:{title:offer.title,description:offer.description,domain_id:offer.domain_id,subject_id:offer.subject_id,level_id:offer.level_id,...(offer.curriculum_id?{curriculum_id:offer.curriculum_id}:{}),...(offer.exam_id?{exam_id:offer.exam_id}:{}),language_ids:offer.language_ids,currency:offer.currency,teaching_mode:offer.teaching_mode,rate_paise:offer.rate_paise,rate_unit:offer.rate_unit,...(offer.lesson_minutes?{lesson_minutes:offer.lesson_minutes}:{}),trial_kind:offer.trial_kind,...(offer.trial_minutes?{trial_minutes:offer.trial_minutes}:{}),...(offer.trial_price_paise?{trial_price_paise:offer.trial_price_paise}:{})},available:true,evidence_labels:row.evidence_labels.map((c:{kind:string;reviewed_at:string;expires_at:string})=>({kind:c.kind,label:c.kind==='IDENTITY'?'Identity and adult-status evidence reviewed':c.kind==='QUALIFICATION'?'Matching Subject qualification evidence reviewed':'Matching Subject experience evidence reviewed',reviewed_at:c.reviewed_at,expires_at:c.expires_at})),verification_disclaimer:'Evidence review does not guarantee teaching quality, qualification authenticity or learning outcomes.'};
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
    const rows=(await client.query(sql,values)).rows;await this.enrichReviews(client,rows);const page=rows.slice(0,limit);const offers=page.map(row=>this.project(row,at)).filter(row=>row!==undefined);
    return {offers,next_cursor:rows.length>limit?page.at(-1).id:null,limit,order:'listing_id_ascending',price_currency:'INR'};
  });}
  async firstAvailable(input:Filters){let cursor:string|undefined;do{const page=await this.search({...input,limit:24,cursor});if(page.offers.length)return page.offers[0];cursor=page.next_cursor||undefined;}while(cursor);return undefined;}
  async detail(id:string){return this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const at=this.now();const row=(await client.query(availableSql+' AND l.id=$3',[at,this.config.mode==='production',id])).rows[0];if(row)await this.enrichReviews(client,[row]);const listing=row?this.project(row,at):undefined;if(!listing)throw new ApiProblem(404,'OFFER_UNAVAILABLE','This teaching offer is currently unavailable.');return {listing};});}
  async reviewPage(id:string,cursor?:string){return this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const at=this.now();const row=(await client.query(availableSql+' AND l.id=$3',[at,this.config.mode==='production',id])).rows[0];if(!row||!this.project(row,at))throw new ApiProblem(404,'OFFER_UNAVAILABLE','This teaching offer is currently unavailable.');return this.reviews.page(client,row.user_id,cursor);});}
  async photo(id:string,photoId:string){return this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const at=this.now();const row=(await client.query(availableSql+' AND l.id=$3 AND photo.id=$4',[at,this.config.mode==='production',id,photoId])).rows[0];if(!row||!this.project(row,at))throw new ApiProblem(404,'OFFER_UNAVAILABLE','This photo is currently unavailable.');const file=(await client.query('SELECT encrypted_payload FROM tutor_photos WHERE id=$1',[photoId])).rows[0];return Buffer.from(decrypt<{data:string}>(file.encrypted_payload,this.config.authSecret).data,'base64');});}
}
