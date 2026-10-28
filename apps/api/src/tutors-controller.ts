import {Body,Controller,Delete,Get,HttpCode,Inject,Param,Post,Req,Res} from '@nestjs/common';
import type {Request,Response} from 'express';
import {z} from 'zod';
import {TutorsService,tutorProfileInput,tutorIntroInput,evidenceInput,claimInput,reviewInput} from './tutors.js';
import {ApiProblem} from './errors.js';
import {sessionCookieName,type Config} from './config.js';
import {staffCookieName} from './staff.js';
type TutorRequest=Request&{correlationId:string};
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR','Check the highlighted Tutor fields.',z.flattenError(result.error).fieldErrors as Record<string,string[]>);return result.data;}
function cookie(request:Request,name:string){const matches=(request.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));return matches.length===1?matches[0].slice(name.length+1):undefined;}
const reason=z.strictObject({reason:z.string().trim().min(10).max(240)});
@Controller('v1')
export class TutorsController {
  constructor(@Inject(TutorsService) private readonly tutors:TutorsService,@Inject('AUTH_CONFIG') private readonly config:Config){}
  private account(request:Request){return cookie(request,sessionCookieName(this.config));}
  private staff(request:Request){return cookie(request,staffCookieName(this.config));}
  @Get('tutor-policy') policy(){return this.tutors.policy();}
  @Get('me/tutor') own(@Req() r:TutorRequest){return this.tutors.own(this.account(r));}
  @Post('me/tutor') @HttpCode(200) save(@Req() r:TutorRequest,@Body() body:unknown){return this.tutors.save(this.account(r),parse(tutorProfileInput,body),r.correlationId);}
  @Post('me/tutor/evidence') @HttpCode(201) upload(@Req() r:TutorRequest,@Body() body:unknown){return this.tutors.upload(this.account(r),parse(evidenceInput,body),r.correlationId);}
  @Delete('me/tutor/evidence/:id') @HttpCode(204) withdraw(@Req() r:TutorRequest,@Param('id') id:string,@Body() body:unknown){parse(z.strictObject({}),body);return this.tutors.withdraw(this.account(r),parse(z.uuid(),id),r.correlationId);}
  @Post('me/tutor/introduction') @HttpCode(200) introduction(@Req()r:TutorRequest,@Body()body:unknown){return this.tutors.saveIntroduction(this.account(r),parse(tutorIntroInput,body),r.correlationId);}
  @Post('me/tutor/identity') @HttpCode(200) identity(@Req()r:TutorRequest,@Body()body:unknown){return this.tutors.submitIdentity(this.account(r),parse(evidenceInput,body),r.correlationId);}
  @Post('me/tutor/claims') @HttpCode(201) claim(@Req() r:TutorRequest,@Body() body:unknown){return this.tutors.claim(this.account(r),parse(claimInput,body),r.correlationId);}
  @Post('me/tutor/submissions') @HttpCode(200) submit(@Req() r:TutorRequest,@Body() body:unknown){parse(z.strictObject({}),body);return this.tutors.submit(this.account(r),r.correlationId);}
  @Get('staff/tutors') queue(@Req() r:TutorRequest){return this.tutors.queue(this.account(r),this.staff(r));}
  @Post('staff/tutors/:id/inspections') @HttpCode(200) inspect(@Req() r:TutorRequest,@Param('id') id:string,@Body() body:unknown){return this.tutors.inspect(this.account(r),this.staff(r),parse(z.uuid(),id),parse(reason,body).reason,r.correlationId);}
  @Post('staff/tutor-claims/:id/reviews') @HttpCode(200) review(@Req() r:TutorRequest,@Param('id') id:string,@Body() body:unknown){return this.tutors.review(this.account(r),this.staff(r),parse(z.uuid(),id),parse(reviewInput,body),r.correlationId);}
  @Post('staff/tutor-evidence/:id/download-grants') @HttpCode(200) grant(@Req() r:TutorRequest,@Param('id') id:string,@Body() body:unknown){return this.tutors.grant(this.account(r),this.staff(r),parse(z.uuid(),id),parse(reason,body).reason,r.correlationId);}
  @Post('staff/tutor-evidence/downloads') @HttpCode(200)
  async download(@Req() r:TutorRequest,@Body() body:unknown,@Res() response:Response){const secret=parse(z.strictObject({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}),body).token;const result=await this.tutors.download(this.account(r),this.staff(r),secret,r.correlationId);const suffix={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'}[result.media_type as 'application/pdf'|'image/png'|'image/jpeg'];response.setHeader('Content-Type',result.media_type);response.setHeader('Content-Disposition',`attachment; filename="evidence-${result.id}.${suffix}"`);response.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");response.send(result.bytes);}
}
