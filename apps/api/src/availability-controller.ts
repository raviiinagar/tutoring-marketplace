import {Body,Controller,Get,HttpCode,Inject,Post,Req} from '@nestjs/common';
import type {Request} from 'express';
import {z} from 'zod';
import {AvailabilityService,availabilitySignup,availabilityToken} from './availability.js';
import {ApiProblem} from './errors.js';
function parse<T>(schema:z.ZodType<T>,body:unknown):T{const result=schema.safeParse(body);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR',result.error.issues[0]?.message||'Please check the availability fields.');return result.data;}
type AvailabilityRequest=Request&{correlationId:string};
@Controller('v1/availability')
export class AvailabilityController {
  constructor(@Inject(AvailabilityService) private readonly availability:AvailabilityService){}
  @Get('policy') policy(){return this.availability.policy();}
  @Post('subscriptions') @HttpCode(202) signup(@Req() r:AvailabilityRequest,@Body() body:unknown){return this.availability.signup(parse(availabilitySignup,body),r.ip||'unknown',r.correlationId);}
  @Post('confirmations') @HttpCode(200) verify(@Req() r:AvailabilityRequest,@Body() body:unknown){return this.availability.verify(parse(availabilityToken,body).token,r.ip||'unknown',r.correlationId);}
  @Post('unsubscriptions') @HttpCode(200) unsubscribe(@Req() r:AvailabilityRequest,@Body() body:unknown){return this.availability.unsubscribe(parse(availabilityToken,body).token,r.ip||'unknown',r.correlationId);}
}
