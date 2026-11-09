import {presenceFilters,addPresenceFilters,publicPresence,publicPlaceText} from './tutor-presence.js';
import {Controller,Get,Inject,Param,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {z} from 'zod';
import sharp from 'sharp';
import type {PoolClient} from 'pg';
import {Database} from './database.js';
import type {Config} from './config.js';
import {ApiProblem} from './errors.js';
import {decrypt} from './security.js';
import {isAdult} from './tutors.js';
import {availableSql} from './discovery.js';
import {identityVerifiedSql,publicTutorSql,publicPhotoSql} from './tutor-publication.js';
import {currentTutorPro} from './tutor-pro-access.js';
const noContact=(s:string)=>!/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d)/i.test(s);
const visible=`SELECT p.*,u.email,${identityVerifiedSql()} AS identity_verified,tp.location,tp.teaching_modes,tp.accepting_students,tp.weekly_slots,tp.revision AS presence_revision,tp.updated_at AS presence_updated_at,photo.id AS photo_id FROM tutor_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN tutor_presence tp ON tp.user_id=p.user_id LEFT JOIN tutor_photos photo ON photo.user_id=p.user_id AND ${publicPhotoSql()} AND photo.scan_status='CLEAN' AND photo.encrypted_payload IS NOT NULL AND (NOT $2::boolean OR NOT photo.test_only)
 WHERE ${publicTutorSql()}
 AND cardinality(p.subject_ids)>0 AND p.hourly_rate_paise IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM safety_restrictions s WHERE s.target_type='ACCOUNT' AND s.target_id=u.id AND s.lifted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM unnest(p.subject_ids) s(id) WHERE NOT EXISTS(SELECT 1 FROM catalogue_terms t WHERE t.id=s.id AND t.kind='SUBJECT' AND t.active))`;
const filters=z.strictObject({...presenceFilters,subject_id:z.string().regex(/^[a-z][a-z0-9-]{1,79}$/).optional(),cursor:z.uuid().optional()}).refine(v=>v.at_time===undefined||!!v.day,'Choose a day for the preferred time.');
export class PublicTutors {
 constructor(private readonly database:Database,private readonly config:Config,private readonly now:()=>Date=()=>new Date()){}
 private valid(p:Record<string,any>){return noContact(p.display_name)&&noContact(p.biography)&&(p.onboarding_version===2||isAdult(decrypt<{birth_date:string}>(p.encrypted_birth_date,this.config.authSecret).birth_date,this.now()));}
 async savedProfiles(client:PoolClient,ids:string[],ownerId:string){
  const result=new Map<string,Awaited<ReturnType<PublicTutors['project']>>>();if(!ids.length)return result;
  const rows=(await client.query(visible+` AND p.public_id=ANY($3::uuid[]) AND NOT EXISTS(SELECT 1 FROM account_blocks b WHERE (b.owner_id=$4 AND b.blocked_id=u.id) OR (b.blocked_id=$4 AND b.owner_id=u.id))`,[this.now(),this.config.mode==='production',ids,ownerId])).rows;
  for(const row of rows)if(this.valid(row))result.set(row.public_id,await this.project(client,row));return result;
 }
 private async project(client:PoolClient,p:Record<string,any>){
  const offers=(await client.query(availableSql+" AND l.user_id=$3 ORDER BY l.id LIMIT 20",[this.now(),this.config.mode==='production',p.user_id])).rows;
  const consent=p.public_email_consent_at&&p.public_email_consent_version==='public-tutor-email-v1';
  // Free ads do not imply consent to publish contact details. ADR0014 retains
  // the separately agreed current Pro + explicit consent public-email rule.
  const contactEnabled=!!consent&&offers.length>0&&!!await currentTutorPro(client,p.user_id,this.now(),this.config.mode!=='production');
  return {id:p.public_id,display_name:p.display_name,biography:p.biography,presence:publicPresence(p),subject_ids:p.subject_ids,hourly_rate_paise:p.hourly_rate_paise,currency:'INR',identity_verified:!!p.identity_verified,identity_label:p.identity_verified?'Identity and adult status reviewed':'Identity not verified',publication_status:p.publication_status,expertise_label:'Subjects, skills and experience are self-declared',photo_url:p.photo_id?`/v1/tutor-profiles/${p.public_id}/photos/${p.photo_id}`:null,contact:contactEnabled?{email:p.email,email_verified:true}:null,offers:offers.map(l=>({id:l.id,title:l.payload.title,rate_paise:l.payload.rate_paise,rate_unit:l.payload.rate_unit})),contact_status:contactEnabled?'PUBLIC':'NOT_PUBLIC'};
 }
 async search(raw:unknown){const input=filters.safeParse(raw);if(!input.success)throw new ApiProblem(400,'INVALID_FILTER','Choose a valid Subject or page.');return this.database.transaction(async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const values:unknown[]=[this.now(),this.config.mode==='production',input.data.subject_id||null,input.data.cursor||null];let sql=visible+" AND ($3::text IS NULL OR $3=ANY(p.subject_ids)) AND ($4::uuid IS NULL OR p.public_id>$4)";addPresenceFilters(input.data,(fragment,value)=>{values.push(value);sql+=' AND '+fragment('$'+values.length);});const rows=(await client.query(sql+' ORDER BY p.public_id LIMIT 25',values)).rows;
  const page=rows.slice(0,24),profiles=[];for(const p of page)if(this.valid(p))profiles.push(await this.project(client,p));return {profiles,next_cursor:rows.length>24?page.at(-1).public_id:null};
 });}
 async locations(raw:unknown){const q=z.strictObject({q:publicPlaceText.optional()}).safeParse(raw);if(!q.success)throw new ApiProblem(400,'INVALID_LOCATION','Enter a city or area.');return this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const values:unknown[]=[this.now(),this.config.mode==='production'];let sql=visible+" AND tp.location IS NOT NULL AND 'IN_PERSON'=ANY(tp.teaching_modes) AND tp.accepting_students IS DISTINCT FROM FALSE";addPresenceFilters({location:q.data.q},(f,v)=>{values.push(v);sql+=' AND '+f('$'+values.length);});const rows=(await client.query(sql+' ORDER BY p.public_id LIMIT 200',values)).rows;const found=new Map<string,unknown>();for(const row of rows){if(!this.valid(row))continue;const p=row.location;for(const area of [undefined,p.area]){const label=[area,p.city,p.state,p.country].filter(Boolean).join(', '),query=[area,p.city].filter(Boolean).join(', ');if(!found.has(label.toLowerCase()))found.set(label.toLowerCase(),{...p,area,label,query});}}return {locations:[...found.values()].slice(0,10)};});}
 async detail(id:string){if(!z.uuid().safeParse(id).success)throw new ApiProblem(404,'NOT_FOUND','Tutor profile not found.');return this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const p=(await client.query(visible+' AND p.public_id=$3',[this.now(),this.config.mode==='production',id])).rows[0];if(!p||!this.valid(p))throw new ApiProblem(404,'NOT_FOUND','Tutor profile is currently unavailable.');return {profile:await this.project(client,p)};});}
 async photo(id:string,photoId:string,variant?:'card'|'portrait'){await this.detail(id);const bytes=await this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const p=(await client.query(visible+' AND p.public_id=$3 AND photo.id=$4',[this.now(),this.config.mode==='production',id,photoId])).rows[0];if(!p||!this.valid(p))throw new ApiProblem(404,'NOT_FOUND','Tutor photo unavailable.');const file=(await client.query('SELECT encrypted_payload FROM tutor_photos WHERE id=$1',[photoId])).rows[0];return Buffer.from(decrypt<{data:string}>(file.encrypted_payload,this.config.authSecret).data,'base64');});
  // Same derivative as the discovery card/portrait photos; resize after releasing the database connection.
  if(!variant)return bytes;
  return sharp(bytes,{limitInputPixels:640*800}).resize(variant==='card'?384:640,variant==='card'?480:800,{fit:'cover'}).webp({quality:72,effort:3}).timeout({seconds:2}).toBuffer();}
}
@Controller('v1/tutor-profiles')
export class PublicTutorsController {
 constructor(@Inject(PublicTutors)private readonly tutors:PublicTutors){}
 @Get() search(@Query() input:unknown){return this.tutors.search(input);}
 @Get('locations') locations(@Query() input:unknown){return this.tutors.locations(input);}
 @Get(':id') detail(@Param('id') id:string){return this.tutors.detail(id);}
 @Get(':id/photos/:photoId') async photo(@Param('id') id:string,@Param('photoId') photoId:string,@Query() query:unknown,@Res() response:Response){if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(photoId).success)throw new ApiProblem(404,'NOT_FOUND','Photo unavailable.');const options=z.strictObject({variant:z.enum(['card','portrait']).optional()}).safeParse(query);if(!options.success)throw new ApiProblem(400,'VALIDATION_ERROR','Unsupported photo variant.');const variant=options.data.variant;const bytes=await this.tutors.photo(id,photoId,variant);response.type(variant?'webp':'jpeg').setHeader('Content-Disposition',`inline; filename="tutor-portrait.${variant?'webp':'jpg'}"`);response.send(bytes);}
}
