import {Body,Controller,Get,HttpCode,Inject,Param,Post,Req} from '@nestjs/common';
import type {Request} from 'express';
import {z} from 'zod';
import {ListingsService,offerInput,editOfferInput,versionInput,listingReviewInput,listingSafetyInput} from './listings.js';
import {sessionCookieName,type Config} from './config.js';
import {staffCookieName} from './staff.js';
import {ApiProblem} from './errors.js';
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR',result.error.issues[0]?.message||'Check the offer fields.');return result.data;}
function cookie(r:Request,name:string){const values=(r.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));return values.length===1?values[0].slice(name.length+1):undefined;}
type ListingRequest=Request&{correlationId:string};
const reasonInput=z.strictObject({reason:z.string().trim().min(10).max(240)});
@Controller('v1')
export class ListingsController {
  constructor(@Inject(ListingsService) private readonly listings:ListingsService,@Inject('AUTH_CONFIG') private readonly config:Config){}
  private account(r:Request){return cookie(r,sessionCookieName(this.config));}
  private staff(r:Request){return cookie(r,staffCookieName(this.config));}
  @Get('me/listings') own(@Req() r:ListingRequest){return this.listings.own(this.account(r));}
  @Post('me/listings') @HttpCode(201) create(@Req() r:ListingRequest,@Body() body:unknown){return this.listings.create(this.account(r),parse(offerInput,body),r.correlationId);}
  @Post('me/listings/:id') @HttpCode(200) edit(@Req() r:ListingRequest,@Param('id') id:string,@Body() body:unknown){return this.listings.edit(this.account(r),parse(z.uuid(),id),parse(editOfferInput,body),r.correlationId);}
  @Post('me/listings/:id/actions/:action') @HttpCode(200) action(@Req() r:ListingRequest,@Param('id') id:string,@Param('action') action:string,@Body() body:unknown){return this.listings.ownerAction(this.account(r),parse(z.uuid(),id),parse(z.enum(['SUBMIT','PAUSE','RESUME']),action),parse(versionInput,body).revision,r.correlationId);}
  @Get('staff/listings') queue(@Req() r:ListingRequest){return this.listings.queue(this.account(r),this.staff(r));}
  @Post('staff/listings/:id/inspections') @HttpCode(200) inspect(@Req() r:ListingRequest,@Param('id') id:string,@Body() body:unknown){return this.listings.inspect(this.account(r),this.staff(r),parse(z.uuid(),id),parse(reasonInput,body).reason,r.correlationId);}
  @Post('staff/listings/:id/reviews') @HttpCode(200) review(@Req() r:ListingRequest,@Param('id') id:string,@Body() body:unknown){return this.listings.review(this.account(r),this.staff(r),parse(z.uuid(),id),parse(listingReviewInput,body),r.correlationId);}
  @Post('staff/listings/:id/safety') @HttpCode(200) safety(@Req() r:ListingRequest,@Param('id') id:string,@Body() body:unknown){return this.listings.safety(this.account(r),this.staff(r),parse(z.uuid(),id),parse(listingSafetyInput,body),r.correlationId);}
  @Get('listings/:id') publicOffer(@Param('id') id:string){return this.listings.publicOffer(parse(z.uuid(),id));}
}
