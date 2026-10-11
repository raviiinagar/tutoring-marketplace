import {Body,Controller,Get,HttpCode,Inject,Param,Post,Req} from '@nestjs/common';
import type {Request} from 'express';
import {z} from 'zod';
import {sessionCookieName,type Config} from './config.js';
import {staffCookieName} from './staff.js';
import {LearnersService} from './learners.js';
import {ApiProblem} from './errors.js';

type LearnerRequest=Request&{correlationId:string};
const alias=z.string().trim().min(2).max(40);const learning_requirements=z.string().trim().min(10).max(300);
const profile=z.strictObject({alias,learning_requirements});
const consent=z.strictObject({accepted:z.literal(true),notice_version:z.string().min(1).max(80),consent_version:z.string().min(1).max(80)});
const reference=z.string().regex(/^(test-[a-z0-9-]{3,60}|evidence-[A-Za-z0-9_-]{20,100})$/);
const reason=z.string().trim().min(10).max(240);
function parse<T>(schema:z.ZodType<T>,body:unknown):T{const result=schema.safeParse(body);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR','Please check the form fields.');return result.data;}
function cookie(request:Request,name:string){const matches=(request.headers.cookie||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));return matches.length===1?matches[0].slice(name.length+1):undefined;}
@Controller('v1')
export class LearnersController {
  constructor(@Inject(LearnersService) private readonly learners:LearnersService,@Inject('AUTH_CONFIG') private readonly config:Config){}
  private token(request:Request){return cookie(request,sessionCookieName(this.config));}
  private staffToken(request:Request){return cookie(request,staffCookieName(this.config));}
  @Get('learner-policy') policy(){return this.learners.policy();}
  @Get('me/learners') list(@Req() request:LearnerRequest){return this.learners.list(this.token(request));}
  @Post('me/learners/adult') @HttpCode(201)
  adult(@Body() body:unknown,@Req() request:LearnerRequest){const input=parse(profile.extend({adult_confirmed:z.literal(true)}),body);return this.learners.adult(this.token(request),input,request.correlationId);}
  @Post('me/learners/children') @HttpCode(201)
  child(@Body() body:unknown,@Req() request:LearnerRequest){return this.learners.child(this.token(request),parse(profile.extend({age_band:z.enum(['UNDER_13','13_15','16_17']),consent}),body),request.correlationId);}
  @Get('me/learners/:id/eligibility') check(@Param('id') id:string,@Req() request:LearnerRequest){return this.learners.check(this.token(request),parse(z.uuid(),id));}
  @Post('me/learners/:id') @HttpCode(200)
  edit(@Param('id') id:string,@Body() body:unknown,@Req() request:LearnerRequest){return this.learners.edit(this.token(request),parse(z.uuid(),id),parse(profile,body),request.correlationId);}
  @Post('me/learners/:id/consent-withdrawals') @HttpCode(200)
  withdraw(@Param('id') id:string,@Body() body:unknown,@Req() request:LearnerRequest){parse(z.strictObject({}),body);return this.learners.withdraw(this.token(request),parse(z.uuid(),id),request.correlationId);}
  @Post('me/learners/:id/consents') @HttpCode(200)
  renew(@Param('id') id:string,@Body() body:unknown,@Req() request:LearnerRequest){return this.learners.consentAgain(this.token(request),parse(z.uuid(),id),parse(consent,body),request.correlationId);}
  @Get('me/guardian-verifications') applications(@Req() request:LearnerRequest){return this.learners.applications(this.token(request));}
  @Post('me/guardian-verifications') @HttpCode(201)
  submit(@Body() body:unknown,@Req() request:LearnerRequest){const input=parse(z.strictObject({adult_reference:reference,authority_reference:reference,adult_confirmed:z.literal(true),consent}),body);return this.learners.submit(this.token(request),input,input.consent,request.correlationId);}
  @Get('staff/guardian-verifications') queue(@Req() request:LearnerRequest){return this.learners.queue(this.token(request),this.staffToken(request));}
  @Post('staff/guardian-verifications/:id/inspections') @HttpCode(200)
  inspect(@Param('id') id:string,@Body() body:unknown,@Req() request:LearnerRequest){return this.learners.inspect(this.token(request),this.staffToken(request),parse(z.uuid(),id),parse(z.strictObject({reason}),body).reason,request.correlationId);}
  @Post('staff/guardian-verifications/:id/reviews') @HttpCode(200)
  review(@Param('id') id:string,@Body() body:unknown,@Req() request:LearnerRequest){return this.learners.review(this.token(request),this.staffToken(request),parse(z.uuid(),id),parse(z.strictObject({decision:z.enum(['APPROVE','REJECT','REVOKE']),identifiable_adult_reviewed:z.boolean(),authority_reviewed:z.boolean(),reason}),body),request.correlationId);}
}
