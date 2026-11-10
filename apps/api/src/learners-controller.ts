import {Body,Controller,Get,HttpCode,Inject,Param,Post,Req} from '@nestjs/common';
import type {Request} from 'express';
import {z} from 'zod';
import {sessionCookieName,type Config} from './config.js';
import {LearnersService} from './learners.js';
import {ApiProblem} from './errors.js';

type LearnerRequest=Request&{correlationId:string};
const alias=z.string().trim().min(2).max(40);const learning_requirements=z.string().trim().min(10).max(300);
const profile=z.strictObject({alias,learning_requirements});
function parse<T>(schema:z.ZodType<T>,body:unknown):T{const result=schema.safeParse(body);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR','Please check the form fields.');return result.data;}
function cookie(request:Request,name:string){const matches=(request.headers.cookie||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));return matches.length===1?matches[0].slice(name.length+1):undefined;}
// ADR 0015 retired child profiles and Guardian verification. The old routes stay
// as clear 410 responses so an out-of-date client gets an explanation, not a 404.
function retired():never{throw new ApiProblem(410,'CHILD_PROFILES_RETIRED','Child profiles and Guardian verification are no longer offered. A parent books classes for their child from their own adult Learner profile.');}
@Controller('v1')
export class LearnersController {
  constructor(@Inject(LearnersService) private readonly learners:LearnersService,@Inject('AUTH_CONFIG') private readonly config:Config){}
  private token(request:Request){return cookie(request,sessionCookieName(this.config));}
  @Get('learner-policy') policy(){return this.learners.policy();}
  @Get('me/learners') list(@Req() request:LearnerRequest){return this.learners.list(this.token(request));}
  @Post('me/learners/adult') @HttpCode(201)
  adult(@Body() body:unknown,@Req() request:LearnerRequest){const input=parse(profile.extend({adult_confirmed:z.literal(true)}),body);return this.learners.adult(this.token(request),input,request.correlationId);}
  @Post('me/learners/children') @HttpCode(410) childRetired(){retired();}
  @Get('me/learners/:id/eligibility') check(@Param('id') id:string,@Req() request:LearnerRequest){return this.learners.check(this.token(request),parse(z.uuid(),id));}
  @Post('me/learners/:id') @HttpCode(200)
  edit(@Param('id') id:string,@Body() body:unknown,@Req() request:LearnerRequest){return this.learners.edit(this.token(request),parse(z.uuid(),id),parse(profile,body),request.correlationId);}
  @Post('me/learners/:id/consent-withdrawals') @HttpCode(200)
  withdraw(@Param('id') id:string,@Body() body:unknown,@Req() request:LearnerRequest){parse(z.strictObject({}),body);return this.learners.withdraw(this.token(request),parse(z.uuid(),id),request.correlationId);}
  @Post('me/learners/:id/consents') @HttpCode(410) consentRetired(){retired();}
  @Get('me/guardian-verifications') @HttpCode(410) applicationsRetired(){retired();}
  @Post('me/guardian-verifications') @HttpCode(410) submitRetired(){retired();}
  @Get('staff/guardian-verifications') @HttpCode(410) queueRetired(){retired();}
  @Post('staff/guardian-verifications/:id/inspections') @HttpCode(410) inspectRetired(){retired();}
  @Post('staff/guardian-verifications/:id/reviews') @HttpCode(410) reviewRetired(){retired();}
}
