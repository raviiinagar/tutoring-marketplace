import {Body,Controller,Delete,Get,HttpCode,Inject,Param,Post,Req} from '@nestjs/common';
import type {Request} from 'express';
import {z} from 'zod';
import {Database} from './database.js';
import {AuthService} from './auth.js';
import {PublicTutors} from './public-tutors.js';
import {ApiProblem} from './errors.js';
import {sessionCookieName,type Config} from './config.js';
const MAX_SAVED=50;
const notFound=()=>new ApiProblem(404,'TUTOR_UNAVAILABLE','This Tutor profile is currently unavailable.');
export class SavedTutorsService {
 constructor(private readonly db:Database,private readonly auth:AuthService,private readonly profiles:PublicTutors,private readonly now:()=>Date=()=>new Date()){}
 async own(token?:string){return this.db.transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  const {user}=await this.auth.authenticated(c,token);
  const rows=(await c.query('SELECT profile_id,created_at FROM saved_tutors WHERE owner_id=$1 ORDER BY created_at DESC,profile_id LIMIT 50',[user.id])).rows;
  const visible=await this.profiles.savedProfiles(c,rows.map(r=>r.profile_id),user.id);
  return {items:rows.map(r=>({profile_id:r.profile_id,saved_at:new Date(r.created_at).toISOString(),profile:visible.get(r.profile_id)??null})),limit:MAX_SAVED};
 });}
 async save(token:string|undefined,id:string){if(!z.uuid().safeParse(id).success)throw notFound();return this.db.transaction(async c=>{
  const {user}=await this.auth.authenticated(c,token);await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
  // Coordinate with profile erasure so a concurrent save cannot recreate an erased reference.
  await c.query('SELECT public_id FROM tutor_profiles WHERE public_id=$1 FOR SHARE',[id]);
  const visible=await this.profiles.savedProfiles(c,[id],user.id);if(!visible.has(id))throw notFound();
  if((await c.query('SELECT 1 FROM saved_tutors WHERE owner_id=$1 AND profile_id=$2',[user.id,id])).rowCount)return {saved:true,profile_id:id};
  if(Number((await c.query('SELECT count(*) FROM saved_tutors WHERE owner_id=$1',[user.id])).rows[0].count)>=MAX_SAVED)throw new ApiProblem(409,'SAVED_TUTOR_LIMIT','Your shortlist is full. Remove a saved Tutor before adding another.');
  await c.query('INSERT INTO saved_tutors(owner_id,profile_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[user.id,id,this.now()]);return {saved:true,profile_id:id};
 });}
 async remove(token:string|undefined,id:string){if(!z.uuid().safeParse(id).success)throw notFound();return this.db.transaction(async c=>{const {user}=await this.auth.authenticated(c,token);await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);await c.query('DELETE FROM saved_tutors WHERE owner_id=$1 AND profile_id=$2',[user.id,id]);return {saved:false,profile_id:id};});}
}
@Controller('v1/me/saved-tutors')
export class SavedTutorsController {
 constructor(@Inject(SavedTutorsService)private readonly saved:SavedTutorsService,@Inject('AUTH_CONFIG')private readonly config:Config){}
 private token(r:Request){const pairs=(r.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(sessionCookieName(this.config)+'='));return pairs.length===1?pairs[0].slice(sessionCookieName(this.config).length+1):undefined;}
 @Get()own(@Req()r:Request){return this.saved.own(this.token(r));}
 @Post(':id')@HttpCode(200)save(@Param('id')id:string,@Body()body:unknown,@Req()r:Request){if(!z.strictObject({}).safeParse(body).success)throw new ApiProblem(400,'INVALID_SAVED_TUTOR','Send an empty object to save a Tutor.');return this.saved.save(this.token(r),id);}
 @Delete(':id')@HttpCode(200)remove(@Param('id')id:string,@Req()r:Request){return this.saved.remove(this.token(r),id);}
}
