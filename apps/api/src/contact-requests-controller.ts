import {Body,Controller,Get,HttpCode,Inject,Param,Post,Query,Req} from '@nestjs/common';
import type {Request} from 'express';
import {z} from 'zod';
import {ContactRequestsService,contactRequestInput,requestListInput} from './contact-requests.js';
import {sessionCookieName,type Config} from './config.js';
import {ApiProblem} from './errors.js';
function parse<T>(schema:z.ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR',result.error.issues[0]?.message||'Check the enquiry fields.');return result.data;}
type ContactRequest=Request&{correlationId:string};
@Controller('v1/me')
export class ContactRequestsController {
  constructor(@Inject(ContactRequestsService) private readonly requests:ContactRequestsService,@Inject('AUTH_CONFIG') private readonly config:Config){}
  private token(r:Request){const matches=(r.headers.cookie||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(sessionCookieName(this.config)+'='));return matches.length===1?matches[0].slice(matches[0].indexOf('=')+1):undefined;}
  @Get('request-access') access(@Req() r:ContactRequest){return this.requests.access(this.token(r));}
  @Post('contact-requests') @HttpCode(200) submit(@Req() r:ContactRequest,@Body() body:unknown){return this.requests.submit(this.token(r),parse(contactRequestInput,body),r.correlationId);}
  @Get('contact-requests') list(@Req() r:ContactRequest,@Query() query:unknown){return this.requests.list(this.token(r),parse(requestListInput,query).cursor);}
  @Get('contact-requests/:id') detail(@Req() r:ContactRequest,@Param('id') id:string){return this.requests.detail(this.token(r),parse(z.uuid(),id));}
  @Get('contact-requests/:id/alternatives') alternatives(@Req() r:ContactRequest,@Param('id') id:string,@Query() query:unknown){return this.requests.alternatives(this.token(r),parse(z.uuid(),id),parse(requestListInput,query).cursor);}
}
