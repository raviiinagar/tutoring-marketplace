import {Body,Controller,Delete,Get,HttpCode,Inject,Param,Post,Req,Res} from '@nestjs/common';
import type {Request,Response} from 'express';
import {z} from 'zod';
import {LoginSchema} from '@tutoring/contracts';
import {sessionCookieName,type Config} from './config.js';
import {ApiProblem} from './errors.js';
import {StaffService,staffCookieName} from './staff.js';

type StaffRequest=Request&{correlationId:string};
const password=LoginSchema.shape.password;
const code=z.string().regex(/^\d{6}$/);
const scopeSchema=z.enum(['SUPPORT','TRUST','FINANCE']);
function parse<T>(schema:z.ZodType<T>,value:unknown):T {const result=schema.safeParse(value);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR','Please check the form fields.');return result.data;}
function cookie(request:Request,name:string){const values=(request.headers.cookie||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));return values.length===1?values[0].slice(name.length+1):undefined;}
@Controller('v1/staff')
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff:StaffService,@Inject('AUTH_CONFIG') private readonly config:Config){}
  private account(request:Request){return cookie(request,sessionCookieName(this.config));}
  private token(request:Request){return cookie(request,staffCookieName(this.config));}
  private options(){return {httpOnly:true,secure:this.config.mode==='production',sameSite:'lax' as const,path:'/'};}
  private issue(response:Response,result:{token:string;expires:Date}){response.cookie(staffCookieName(this.config),result.token,{...this.options(),expires:result.expires});}
  @Get('access')
  access(@Req() request:StaffRequest){return this.staff.access(this.account(request),this.token(request));}
  @Post('mfa/enrollments')
  @HttpCode(200)
  enroll(@Body() body:unknown,@Req() request:StaffRequest){return this.staff.enroll(this.account(request),parse(z.strictObject({password}),body).password,request.ip||'unknown',request.correlationId);}
  @Post('mfa/confirmations')
  @HttpCode(200)
  async confirm(@Body() body:unknown,@Req() request:StaffRequest,@Res({passthrough:true}) response:Response){
    const result=await this.staff.confirm(this.account(request),parse(z.strictObject({code}),body).code,request.ip||'unknown',request.correlationId);this.issue(response,result);
    return {recovery_codes:result.recovery_codes};
  }
  @Post('sessions')
  @HttpCode(200)
  async signIn(@Body() body:unknown,@Req() request:StaffRequest,@Res({passthrough:true}) response:Response){
    const input=parse(z.strictObject({password,code}),body);const result=await this.staff.signIn(this.account(request),input.password,input.code,request.ip||'unknown',request.correlationId);this.issue(response,result);return {expires_at:result.expires.toISOString()};
  }
  @Post('mfa/recoveries')
  @HttpCode(200)
  async recover(@Body() body:unknown,@Req() request:StaffRequest,@Res({passthrough:true}) response:Response){
    const input=parse(z.strictObject({password,recovery_code:z.string().regex(/^[a-f0-9]{32}$/)}),body);
    const result=await this.staff.recover(this.account(request),input.password,input.recovery_code,request.ip||'unknown',request.correlationId);response.clearCookie(staffCookieName(this.config),this.options());return result;
  }
  @Delete('sessions/current')
  @HttpCode(204)
  async signOut(@Req() request:StaffRequest,@Res({passthrough:true}) response:Response){await this.staff.signOut(this.account(request),this.token(request),request.correlationId);response.clearCookie(staffCookieName(this.config),this.options());}
  @Get('workspaces/:scope')
  workspace(@Param('scope') scope:unknown,@Req() request:StaffRequest){return this.staff.workspace(this.account(request),this.token(request),parse(scopeSchema,scope));}
  @Post('workspaces/:scope/access-checks')
  @HttpCode(200)
  accessCheck(@Param('scope') scope:unknown,@Body() body:unknown,@Req() request:StaffRequest){return this.staff.workspace(this.account(request),this.token(request),parse(scopeSchema,scope),parse(z.strictObject({reason:z.string().trim().min(10).max(240)}),body).reason,request.correlationId);}
}
