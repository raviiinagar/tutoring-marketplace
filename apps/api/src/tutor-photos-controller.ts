import {Body,Controller,Delete,Get,HttpCode,Inject,Param,Post,Req,Res} from '@nestjs/common';
import type {Request,Response} from 'express';
import {z} from 'zod';
import {TutorPhotosService,photoInput,photoReview} from './tutor-photos.js';
import {sessionCookieName,type Config} from './config.js';
import {staffCookieName} from './staff.js';
import {ApiProblem} from './errors.js';
type PhotoRequest=Request&{correlationId:string};
const reason=z.strictObject({reason:z.string().trim().min(10).max(240)});
function parse<T>(schema:z.ZodType<T>,body:unknown):T{const result=schema.safeParse(body);if(!result.success)throw new ApiProblem(400,'VALIDATION_ERROR','Check the photo fields.');return result.data;}
function cookie(request:Request,name:string){const found=(request.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));return found.length===1?found[0].slice(name.length+1):undefined;}
function send(response:Response,bytes:Buffer){response.setHeader('Content-Type','image/jpeg');response.setHeader('Content-Disposition','inline; filename="tutor-photo.jpg"');response.send(bytes);}
@Controller('v1')
export class TutorPhotosController {
 constructor(@Inject(TutorPhotosService) private readonly photos:TutorPhotosService,@Inject('AUTH_CONFIG') private readonly config:Config){}
 private account(r:Request){return cookie(r,sessionCookieName(this.config));}
 private staff(r:Request){return cookie(r,staffCookieName(this.config));}
 @Get('me/tutor/photo') own(@Req() r:PhotoRequest){return this.photos.own(this.account(r));}
 @Post('me/tutor/photo') @HttpCode(201) upload(@Req() r:PhotoRequest,@Body() body:unknown){return this.photos.upload(this.account(r),parse(photoInput,body),r.correlationId);}
 @Get('me/tutor/photo/:id') async preview(@Req() r:PhotoRequest,@Param('id') id:string,@Res() response:Response){send(response,await this.photos.preview(this.account(r),parse(z.uuid(),id)));}
 @Delete('me/tutor/photo/:id') @HttpCode(204) remove(@Req() r:PhotoRequest,@Param('id') id:string,@Body() body:unknown){parse(z.strictObject({}),body);return this.photos.remove(this.account(r),parse(z.uuid(),id),r.correlationId);}
 @Get('staff/tutor-photos') queue(@Req() r:PhotoRequest){return this.photos.queue(this.account(r),this.staff(r));}
 @Post('staff/tutor-photos/:id/inspections') @HttpCode(200) async inspect(@Req() r:PhotoRequest,@Param('id') id:string,@Body() body:unknown,@Res() response:Response){send(response,await this.photos.inspect(this.account(r),this.staff(r),parse(z.uuid(),id),parse(reason,body).reason,r.correlationId));}
 @Post('staff/tutor-photos/:id/reviews') @HttpCode(200) review(@Req() r:PhotoRequest,@Param('id') id:string,@Body() body:unknown){return this.photos.review(this.account(r),this.staff(r),parse(z.uuid(),id),parse(photoReview,body),r.correlationId);}
}
