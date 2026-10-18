import {Controller,Get,Inject,Param,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {z} from 'zod';
import {DiscoveryService,discoveryInput} from './discovery.js';
import {ApiProblem} from './errors.js';
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiProblem(400,'INVALID_FILTER',result.error.issues[0]?.message||'Please check the search filters.');return result.data;}
@Controller('v1/discovery')
export class DiscoveryController {
  constructor(@Inject(DiscoveryService) private readonly discovery:DiscoveryService){}
  @Get() search(@Query() query:unknown){return this.discovery.search(parse(discoveryInput,query));}
  @Get(':id') detail(@Param('id') id:string){return this.discovery.detail(parse(z.uuid(),id));}
  @Get(':id/reviews') reviews(@Param('id') id:string,@Query() query:unknown){const input=parse(z.strictObject({cursor:z.uuid().optional()}),query);return this.discovery.reviewPage(parse(z.uuid(),id),input.cursor);}
  @Get(':id/photos/:photoId') async photo(@Param('id') id:string,@Param('photoId') photoId:string,@Query() query:unknown,@Res() response:Response){
    const {variant}=parse(z.strictObject({variant:z.enum(['card','portrait']).optional()}),query);
    const bytes=await this.discovery.photo(parse(z.uuid(),id),parse(z.uuid(),photoId),variant);
    response.setHeader('Content-Type',variant?'image/webp':'image/jpeg');
    response.setHeader('Content-Disposition',`inline; filename="tutor-photo.${variant?'webp':'jpg'}"`);
    response.send(bytes);
  }
}
