import {actingTutor,type TutorActor} from './tutor-delegation.js';
import {Body,Controller,Get,HttpCode,Inject,Post,Req} from '@nestjs/common';
import type {Request} from 'express';
import type {PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database} from './database.js';
import {AuthService} from './auth.js';
import {sessionCookieName,type Config} from './config.js';
import {ApiProblem} from './errors.js';
export const weekdays=['MON','TUE','WED','THU','FRI','SAT','SUN'] as const;
export const publicPlaceText=z.string().trim().transform(s=>s.normalize('NFKC').replace(/\s+/g,' ')).pipe(z.string().min(1).max(80)).refine(s=>/\p{L}/u.test(s),'Enter a named city, area or country.').refine(s=>!/(?:https?:|www\.|@|\+?\d[\d\s().-]{8,}\d|[\p{Cc}\p{Cf}])/u.test(s),'Use a city or area, without contact details or an exact address.');
const normalizePlace=(s:string)=>s.replace(/\bbangalore\b/gi,'Bengaluru');
export const placeInput=z.strictObject({city:publicPlaceText.transform(normalizePlace),area:publicPlaceText.optional(),state:publicPlaceText.optional(),country:publicPlaceText.default('India').transform(s=>['in','india','bharat'].includes(s.toLowerCase())?'India':s)});
const slot=z.strictObject({day:z.enum(weekdays),start_minute:z.number().int().min(0).max(1439),end_minute:z.number().int().min(1).max(1440)}).refine(s=>s.end_minute>s.start_minute,'End time must follow start time; split overnight hours into separate days.');
export const presenceInput=z.strictObject({expected_revision:z.number().int().nonnegative(),location:placeInput.nullable(),teaching_modes:z.array(z.enum(['ONLINE','IN_PERSON'])).min(1).max(2).refine(a=>new Set(a).size===a.length),accepting_students:z.boolean(),weekly_slots:z.array(slot).max(21),timezone:z.literal('Asia/Kolkata').default('Asia/Kolkata')}).superRefine((v,c)=>{
 if(v.teaching_modes.includes('IN_PERSON')&&!v.location)c.addIssue({code:'custom',message:'Add a public city/area before offering in-person classes.'});
 for(const day of weekdays){const slots=v.weekly_slots.filter(s=>s.day===day).sort((a,b)=>a.start_minute-b.start_minute);for(let i=1;i<slots.length;i++)if(slots[i].start_minute<slots[i-1].end_minute)c.addIssue({code:'custom',message:'Weekly time slots must not overlap.'});}
});
export const presenceFilters={location:publicPlaceText.transform(normalizePlace).optional(),country:publicPlaceText.optional(),teaching_mode:z.enum(['ONLINE','IN_PERSON']).optional(),day:z.enum(weekdays).optional(),at_time:z.string().regex(/^\d{1,4}$/).transform(Number).pipe(z.number().int().min(0).max(1439)).optional(),accepting_only:z.literal('true').optional()};
type FilterValues={location?:string;country?:string;teaching_mode?:string;day?:string;at_time?:number;accepting_only?:string};
export function addPresenceFilters(input:FilterValues,add:(sql:(p:string)=>string,value:unknown)=>void,alias='tp'){
 if(input.location)add(p=>`strpos(lower(concat_ws(', ',${alias}.location->>'area',${alias}.location->>'city',${alias}.location->>'state',${alias}.location->>'country')),lower(${p}))>0`,input.location);
 if(input.country)add(p=>`lower(${alias}.location->>'country')=lower(${p})`,input.country);
 if(input.teaching_mode)add(p=>`${p}=ANY(COALESCE(${alias}.teaching_modes,ARRAY['ONLINE']))`,input.teaching_mode);
 if(input.accepting_only)add(p=>`COALESCE(${alias}.accepting_students,true)=${p}::boolean`,true);
 if(input.day)add(p=>`EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(${alias}.weekly_slots,'[]')) slot WHERE slot->>'day'=(${p}::jsonb->>'day') AND ((${p}::jsonb->>'at') IS NULL OR ((slot->>'start_minute')::integer<=(${p}::jsonb->>'at')::integer AND (slot->>'end_minute')::integer>(${p}::jsonb->>'at')::integer)))`,JSON.stringify({day:input.day,at:input.at_time??null}));
}
export function publicPresence(row:Record<string,any>){return {revision:row.presence_revision??0,location:row.location??null,teaching_modes:row.teaching_modes??['ONLINE'],accepting_students:row.presence_revision?row.accepting_students:null,weekly_slots:row.weekly_slots??[],timezone:'Asia/Kolkata' as const,updated_at:row.presence_updated_at?new Date(row.presence_updated_at).toISOString():null};}
export async function requireTutorMode(client:PoolClient,userId:string,mode:string){
 const p=(await client.query('SELECT * FROM tutor_presence WHERE user_id=$1',[userId])).rows[0];
 if(!(p?.teaching_modes??['ONLINE']).includes(mode)||mode==='IN_PERSON'&&!p?.location?.city)throw new ApiProblem(409,'TEACHING_LOCATION_REQUIRED','Save the matching teaching mode and public city in your Tutor location settings first.');
}
export class TutorPresenceService{
 constructor(private readonly db:Database,private readonly auth:AuthService,private readonly now:()=>Date=()=>new Date()){}
 async own(token?:TutorActor){return this.db.transaction(async c=>{const {user}=await actingTutor(this.auth,c,token);return {presence:await this.snapshot(c,user.id)};});}
 private async snapshot(c:PoolClient,id:string){const p=(await c.query('SELECT *,revision AS presence_revision,updated_at AS presence_updated_at FROM tutor_presence WHERE user_id=$1',[id])).rows[0];return publicPresence(p??{});}
 async save(token:TutorActor,v:z.infer<typeof presenceInput>,correlation:string){return this.db.transaction(async c=>{
  const {user}=await actingTutor(this.auth,c,token);if(!user.roles.includes('TUTOR'))throw new ApiProblem(403,'TUTOR_ROLE_REQUIRED','Choose the Tutor role before saving teaching preferences.');const profile=(await c.query('SELECT user_id FROM tutor_profiles WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0];if(!profile)throw new ApiProblem(409,'TUTOR_PROFILE_REQUIRED','Save your Tutor introduction first.');
  const old=(await c.query('SELECT * FROM tutor_presence WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0];if((old?.revision??0)!==v.expected_revision)throw new ApiProblem(409,'PRESENCE_CHANGED','Your location or hours changed. Refresh before saving.');
  const slots=[...v.weekly_slots].sort((a,b)=>weekdays.indexOf(a.day)-weekdays.indexOf(b.day)||a.start_minute-b.start_minute);
  await c.query(`INSERT INTO tutor_presence(user_id,location,teaching_modes,accepting_students,weekly_slots,timezone,updated_at) VALUES($1,$2,$3,$4,$5,'Asia/Kolkata',$6) ON CONFLICT(user_id) DO UPDATE SET location=$2,teaching_modes=$3,accepting_students=$4,weekly_slots=$5,revision=tutor_presence.revision+1,updated_at=$6`,[user.id,v.location,v.teaching_modes,v.accepting_students,JSON.stringify(slots),this.now()]);
  const locationChanged=['city','area','state','country'].some(k=>(old?.location?.[k]??'').toLowerCase()!==(v.location?.[k as keyof typeof v.location]??'').toLowerCase());
  const changed=await c.query(`UPDATE teaching_listings SET status='CHANGES_REQUESTED',approved=false,revision=revision+1,review_reason='Class location or teaching mode changed. Update and resubmit this offer.',updated_at=$3 WHERE user_id=$1 AND status IN ('PUBLISHED','PAUSED','REVIEW') AND ((payload->>'teaching_mode'='IN_PERSON' AND $2) OR NOT (payload->>'teaching_mode'=ANY($4::text[])))`,[user.id,locationChanged,this.now(),v.teaching_modes]);
  await c.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),user.id,'TUTOR_PRESENCE_UPDATED',correlation,{target:user.id,location_changed:locationChanged,offers_need_review:changed.rowCount,accepting_students:v.accepting_students},this.now()]);
  return {presence:await this.snapshot(c,user.id),offers_need_review:changed.rowCount};
 });}
}
@Controller('v1/me/tutor/presence')
export class TutorPresenceController{
 constructor(@Inject(TutorPresenceService)private readonly presence:TutorPresenceService,@Inject('AUTH_CONFIG')private readonly config:Config){}
 private token(r:Request){const pairs=(r.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(sessionCookieName(this.config)+'='));return pairs.length===1?pairs[0].slice(sessionCookieName(this.config).length+1):undefined;}
 @Get()own(@Req() r:Request){return this.presence.own(this.token(r));}
 @Post()@HttpCode(200)save(@Body() body:unknown,@Req() r:Request&{correlationId:string}){const v=presenceInput.safeParse(body);if(!v.success)throw new ApiProblem(400,'INVALID_PRESENCE',v.error.issues[0]?.message||'Check the location and weekly hours.');return this.presence.save(this.token(r),v.data,r.correlationId);}
}
