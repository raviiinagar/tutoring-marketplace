import {Body,Controller,Get,HttpCode,Inject,Param,Post,Query,Req} from '@nestjs/common';
import type {Request} from 'express';
import {z} from 'zod';
import {ConnectionsService,connectionDecision,connectionList} from './connections.js';
import {sessionCookieName,type Config} from './config.js';
import {ApiProblem} from './errors.js';
function parse<T>(schema:z.ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR','Check the request fields.');return result.data;}
type ActorRequest=Request&{correlationId:string};
@Controller('v1/me')
export class ConnectionsController {
  constructor(@Inject(ConnectionsService) private readonly connections:ConnectionsService,@Inject('AUTH_CONFIG') private readonly config:Config){}
  private token(r:Request){const name=sessionCookieName(this.config)+'=';const matches=(r.headers.cookie||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name));return matches.length===1?matches[0].slice(name.length):undefined;}
  @Get('tutor-requests') inbox(@Req() r:ActorRequest,@Query() query:unknown){return this.connections.inbox(this.token(r),parse(connectionList,query).cursor);}
  @Post('tutor-requests/:id/decisions') @HttpCode(200) decide(@Req() r:ActorRequest,@Param('id') id:string,@Body() body:unknown){return this.connections.decide(this.token(r),parse(z.uuid(),id),parse(connectionDecision,body).decision,r.correlationId);}
  @Get('connections') list(@Req() r:ActorRequest,@Query() query:unknown){return this.connections.list(this.token(r),parse(connectionList,query).cursor);}
  @Get('connections/:id') detail(@Req() r:ActorRequest,@Param('id') id:string){return this.connections.detail(this.token(r),parse(z.uuid(),id));}
  @Get('connections/:id/contacts') contacts(@Req() r:ActorRequest,@Param('id') id:string){return this.connections.contacts(this.token(r),parse(z.uuid(),id),r.correlationId);}
}
