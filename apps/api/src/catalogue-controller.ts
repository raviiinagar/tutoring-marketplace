import {Body,Controller,Get,HttpCode,Inject,Param,Post,Req} from '@nestjs/common';
import type {Request} from 'express';
import {z} from 'zod';
import {CatalogueService,catalogueKind,selectionInput,termInput} from './catalogue.js';
import {ApiProblem} from './errors.js';
import {sessionCookieName,type Config} from './config.js';
import {staffCookieName} from './staff.js';
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR','Please check the catalogue fields.');return result.data;}
function cookie(request:Request,name:string){const matches=(request.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));return matches.length===1?matches[0].slice(name.length+1):undefined;}
@Controller('v1')
export class CatalogueController {
  constructor(@Inject(CatalogueService) private readonly catalogue:CatalogueService,@Inject('AUTH_CONFIG') private readonly config:Config){}
  @Get('catalogue') list(){return this.catalogue.publicCatalogue();}
  @Get('catalogue/resolve/:kind/:name') resolve(@Param('kind') kind:unknown,@Param('name') name:unknown){return this.catalogue.resolve(parse(catalogueKind,kind),parse(z.string().min(1).max(100),name));}
  @Post('catalogue/validations') @HttpCode(200) validate(@Body() body:unknown){return this.catalogue.validate(parse(selectionInput,body));}
  @Get('staff/catalogue') staff(@Req() request:Request){return this.catalogue.staffCatalogue(cookie(request,sessionCookieName(this.config)),cookie(request,staffCookieName(this.config)));}
  @Post('staff/catalogue/terms') @HttpCode(200) save(@Req() request:Request&{correlationId:string},@Body() body:unknown){return this.catalogue.save(cookie(request,sessionCookieName(this.config)),cookie(request,staffCookieName(this.config)),parse(termInput,body),request.correlationId);}
}
