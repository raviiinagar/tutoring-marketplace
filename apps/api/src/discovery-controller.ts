import {Controller,Get,Inject,Param,Query} from '@nestjs/common';
import {z} from 'zod';
import {DiscoveryService,discoveryInput} from './discovery.js';
import {ApiProblem} from './errors.js';
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiProblem(400,'INVALID_FILTER',result.error.issues[0]?.message||'Please check the search filters.');return result.data;}
@Controller('v1/discovery')
export class DiscoveryController {
  constructor(@Inject(DiscoveryService) private readonly discovery:DiscoveryService){}
  @Get() search(@Query() query:unknown){return this.discovery.search(parse(discoveryInput,query));}
  @Get(':id') detail(@Param('id') id:string){return this.discovery.detail(parse(z.uuid(),id));}
}
