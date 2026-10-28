import {Controller,Get,Inject,Param,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {Database} from './database.js';
import type {Config} from './config.js';
import {ApiProblem} from './errors.js';
import {decrypt} from './security.js';
import {isAdult} from './tutors.js';
import {availableSql} from './discovery.js';
const noContact=(s:string)=>!/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d)/i.test(s);
const visible=`SELECT p.*,u.email,photo.id AS photo_id FROM tutor_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN tutor_photos photo ON photo.user_id=p.user_id AND photo.status='APPROVED' AND photo.scan_status='CLEAN' AND photo.encrypted_payload IS NOT NULL AND (NOT $2::boolean OR NOT photo.test_only)
 WHERE p.status='APPROVED' AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL AND 'TUTOR'=ANY(u.roles)
 AND cardinality(p.subject_ids)>0 AND p.hourly_rate_paise IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM safety_restrictions s WHERE s.target_type='ACCOUNT' AND s.target_id=u.id AND s.lifted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM unnest(p.subject_ids) s(id) WHERE NOT EXISTS(SELECT 1 FROM catalogue_terms t WHERE t.id=s.id AND t.kind='SUBJECT' AND t.active))
 AND EXISTS(SELECT 1 FROM tutor_claims c JOIN tutor_evidence e ON e.id=c.evidence_id AND e.user_id=c.user_id WHERE c.user_id=p.user_id AND c.profile_revision=p.revision AND c.kind='IDENTITY' AND c.adult_identity_confirmed AND c.status='APPROVED' AND c.expires_at>$1 AND e.scan_status='CLEAN' AND (NOT $2::boolean OR NOT e.test_only))`;
const filters=z.strictObject({subject_id:z.string().regex(/^[a-z][a-z0-9-]{1,79}$/).optional(),cursor:z.uuid().optional()});
export class PublicTutors {
 constructor(private readonly database:Database,private readonly config:Config,private readonly now:()=>Date=()=>new Date()){}
 private valid(p:Record<string,any>){return noContact(p.display_name)&&noContact(p.biography)&&(p.onboarding_version===2||isAdult(decrypt<{birth_date:string}>(p.encrypted_birth_date,this.config.authSecret).birth_date,this.now()));}
 private async project(client:PoolClient,p:Record<string,any>){
  const offers=(await client.query(availableSql+" AND l.user_id=$3 ORDER BY l.id LIMIT 20",[this.now(),this.config.mode==='production',p.user_id])).rows;
  const consent=p.public_email_consent_at&&p.public_email_consent_version==='public-tutor-email-v1';
  return {id:p.public_id,display_name:p.display_name,biography:p.biography,subject_ids:p.subject_ids,hourly_rate_paise:p.hourly_rate_paise,currency:'INR',identity_label:'Identity and adult status reviewed',expertise_label:'Subjects, skills and experience are self-declared',photo_url:p.photo_id?`/v1/tutor-profiles/${p.public_id}/photos/${p.photo_id}`:null,contact:consent&&offers.length?{email:p.email,email_verified:true}:null,offers:offers.map(l=>({id:l.id,title:l.payload.title,rate_paise:l.payload.rate_paise,rate_unit:l.payload.rate_unit})),contact_status:consent&&offers.length?'PUBLIC':'NOT_PUBLIC'};
 }
 async search(raw:unknown){const input=filters.safeParse(raw);if(!input.success)throw new ApiProblem(400,'INVALID_FILTER','Choose a valid Subject or page.');return this.database.transaction(async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const rows=(await client.query(visible+" AND ($3::text IS NULL OR $3=ANY(p.subject_ids)) AND ($4::uuid IS NULL OR p.public_id>$4) ORDER BY p.public_id LIMIT 25",[this.now(),this.config.mode==='production',input.data.subject_id||null,input.data.cursor||null])).rows;
  const page=rows.slice(0,24),profiles=[];for(const p of page)if(this.valid(p))profiles.push(await this.project(client,p));return {profiles,next_cursor:rows.length>24?page.at(-1).public_id:null};
 });}
 async detail(id:string){if(!z.uuid().safeParse(id).success)throw new ApiProblem(404,'NOT_FOUND','Tutor profile not found.');return this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const p=(await client.query(visible+' AND p.public_id=$3',[this.now(),this.config.mode==='production',id])).rows[0];if(!p||!this.valid(p))throw new ApiProblem(404,'NOT_FOUND','Tutor profile is currently unavailable.');return {profile:await this.project(client,p)};});}
 async photo(id:string,photoId:string){await this.detail(id);return this.database.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const p=(await client.query(visible+' AND p.public_id=$3 AND photo.id=$4',[this.now(),this.config.mode==='production',id,photoId])).rows[0];if(!p||!this.valid(p))throw new ApiProblem(404,'NOT_FOUND','Tutor photo unavailable.');const file=(await client.query('SELECT encrypted_payload FROM tutor_photos WHERE id=$1',[photoId])).rows[0];return Buffer.from(decrypt<{data:string}>(file.encrypted_payload,this.config.authSecret).data,'base64');});}
}
@Controller('v1/tutor-profiles')
export class PublicTutorsController {
 constructor(@Inject(PublicTutors)private readonly tutors:PublicTutors){}
 @Get() search(@Query() input:unknown){return this.tutors.search(input);}
 @Get(':id') detail(@Param('id') id:string){return this.tutors.detail(id);}
 @Get(':id/photos/:photoId') async photo(@Param('id') id:string,@Param('photoId') photoId:string,@Res() response:Response){if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(photoId).success)throw new ApiProblem(404,'NOT_FOUND','Photo unavailable.');const bytes=await this.tutors.photo(id,photoId);response.type('jpeg').setHeader('Content-Disposition','inline; filename="tutor-portrait.jpg"');response.send(bytes);}
}
