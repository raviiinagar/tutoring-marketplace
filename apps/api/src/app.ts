import "reflect-metadata";
import { Body, Catch, Controller, Delete, Get, HttpCode, HttpException, Inject, Module, Param, Post, Req, Res, type ArgumentsHost, type ExceptionFilter, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { raw, json, type Request, type Response } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { RegistrationSchema, LoginSchema, VerificationSchema, RecoverySchema, PasswordResetSchema, RolesSchema } from "@tutoring/contracts";
import { z } from "zod";
import { AuthService } from "./auth.js";
import { sessionCookieName, type Config } from "./config.js";
import { Database } from "./database.js";
import { ApiProblem } from "./errors.js";
import {StaffService} from './staff.js';
import {StaffController} from './staff-controller.js';
import {LearnersService} from './learners.js';
import {LearnersController} from './learners-controller.js';
import {guardianVerifier,type GuardianVerifier} from './guardian-verifier.js';
import {CatalogueService} from './catalogue.js';
import {CatalogueController} from './catalogue-controller.js';
import {TutorsService} from './tutors.js';
import {TutorsController} from './tutors-controller.js';
import {evidenceScanner,type EvidenceScanner} from './evidence-scanner.js';
import {ListingsService} from './listings.js';
import {ListingsController} from './listings-controller.js';
import {DiscoveryService} from './discovery.js';
import {DiscoveryController} from './discovery-controller.js';
import {AvailabilityService} from './availability.js';
import {AvailabilityController} from './availability-controller.js';
import {ContactRequestsService} from './contact-requests.js';
import {ContactRequestsController} from './contact-requests-controller.js';
import {ConnectionsService} from './connections.js';
import {ConnectionsController} from './connections-controller.js';
import {TutorPhotosService} from './tutor-photos.js';
import {TutorPhotosController} from './tutor-photos-controller.js';
import {ChatService} from './chat.js';
import {ChatController} from './chat-controller.js';
import {ChatRealtime} from './chat-realtime.js';
import {SafetyService} from './safety.js';
import {SafetyController} from './safety-controller.js';
import {RefundsService} from './refunds.js';
import {RefundsController} from './refunds-controller.js';
import {supportsRefunds} from './payment-provider.js';
import {PaidAccess} from './paid-access.js';
import {PaymentEvents} from './payment-events.js';
import {PaymentsService} from './payments.js';
import {PaymentsController} from './payments-controller.js';
import {RazorpayProvider,type PaymentProvider} from './payment-provider.js';

const CONFIG = "AUTH_CONFIG";
type AuthRequest = Request & { correlationId: string };
const peer = (request: Request) => request.ip || "unknown";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiProblem(400,"VALIDATION_ERROR","Please check the form fields.",z.flattenError(result.error).fieldErrors as Record<string,string[]>);
  return result.data;
}
function sessionToken(request: Request, config: Config): string | undefined {
  const name = sessionCookieName(config);
  const matches = (request.headers.cookie || "").split(";").map(value=>value.trim()).filter(value=>value.startsWith(name+"="));
  if (matches.length !== 1) return undefined;
  return matches[0].slice(name.length+1);
}
@Catch()
class ProblemsFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<AuthRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : (error as {status?:number})?.status || 500;
    let body: Record<string,unknown> = {code:"INTERNAL_ERROR",message:"Unable to complete the request."};
    if (error instanceof ApiProblem) body = error.getResponse() as Record<string,unknown>;
    else if (status===404) body={code:"NOT_FOUND",message:"Not found."};
    else if (status===400) body={code:"INVALID_REQUEST",message:"Invalid request body."};
    else if (status===413) body={code:"REQUEST_TOO_LARGE",message:"Request body is too large."};
    if (status>=500) console.error("Request failed; correlation "+request.correlationId);
    if (status===429) response.setHeader("Retry-After","900");
    response.status(status).json({...body,correlation_id:request.correlationId || randomUUID()});
  }
}
@Controller("v1")
class AccountController {
  constructor(@Inject(AuthService) private readonly auth: AuthService,@Inject(CONFIG) private readonly config: Config,@Inject(Database) private readonly database: Database) {}
  @Get("health")
  async health() {
    await this.database.pool.query("SELECT 1");
    return {status:"ok"};
  }
  @Post("auth/registrations")
  @HttpCode(202)
  register(@Body() body: unknown,@Req() request: AuthRequest) {
    return this.auth.register(parse(RegistrationSchema,body),peer(request),request.correlationId);
  }
  @Post("auth/verifications")
  @HttpCode(200)
  verify(@Body() body: unknown,@Req() request: AuthRequest) {
    return this.auth.verify(parse(VerificationSchema,body).token,peer(request),request.correlationId);
  }
  @Post("auth/verification-emails")
  @HttpCode(202)
  resend(@Body() body: unknown,@Req() request: AuthRequest) {
    const input=parse(z.object({email:RegistrationSchema.shape.email}).strict(),body);
    return this.auth.resend(input.email,peer(request));
  }
  @Post("auth/sessions")
  @HttpCode(200)
  async login(@Body() body: unknown,@Req() request: AuthRequest,@Res({passthrough:true}) response: Response) {
    const result = await this.auth.login(parse(LoginSchema,body),peer(request),request.correlationId);
    response.cookie(sessionCookieName(this.config),result.token,{
      httpOnly:true,secure:this.config.mode==="production",sameSite:"lax",path:"/",
      expires:result.expires,
    });
    return {user:result.user};
  }
  @Get("me")
  async me(@Req() request: AuthRequest) { return {user:await this.auth.account(sessionToken(request,this.config))}; }
  @Post('auth/recovery-emails')
  @HttpCode(202)
  recovery(@Body() body: unknown,@Req() request: AuthRequest) {
    return this.auth.requestRecovery(parse(RecoverySchema,body).email,peer(request));
  }
  @Post('auth/password-resets')
  @HttpCode(200)
  reset(@Body() body: unknown,@Req() request: AuthRequest) {
    const input = parse(PasswordResetSchema,body);
    return this.auth.resetPassword(input.token,input.password,peer(request),request.correlationId);
  }
  @Post('me/roles')
  @HttpCode(200)
  roles(@Body() body: unknown,@Req() request: AuthRequest) {
    return this.auth.changeRoles(sessionToken(request,this.config),parse(RolesSchema,body).roles,request.correlationId);
  }
  @Get('auth/sessions')
  sessions(@Req() request: AuthRequest) { return this.auth.sessions(sessionToken(request,this.config)); }
  @Delete('auth/sessions/others')
  @HttpCode(204)
  revokeOthers(@Req() request: AuthRequest) {
    return this.auth.revokeSessions(sessionToken(request,this.config),'others',request.correlationId);
  }
  @Delete('auth/sessions/by-id/:id')
  @HttpCode(204)
  revoke(@Param('id') id: string,@Req() request: AuthRequest) {
    return this.auth.revokeSessions(sessionToken(request,this.config),parse(z.uuid(),id),request.correlationId);
  }
  @Delete("auth/sessions/current")
  @HttpCode(204)
  async logout(@Req() request: AuthRequest,@Res({passthrough:true}) response: Response) {
    await this.auth.logout(sessionToken(request,this.config),request.correlationId);
    response.clearCookie(sessionCookieName(this.config),{httpOnly:true,secure:this.config.mode==="production",sameSite:"lax",path:"/"});
  }
}
@Controller("dev")
class DevelopmentMailController {
  constructor(@Inject(CONFIG) private readonly config: Config) {}
  @Get("mail")
  async inbox(@Req() request: Request) {
    if (this.config.mode==="production" || this.config.mailTransport!=="capture" ||
        !["127.0.0.1","::1","::ffff:127.0.0.1"].includes(peer(request)))
      throw new ApiProblem(404,"NOT_FOUND","Not found.");
    const filenames = await readdir(this.config.mailDir).catch(()=>[]);
    const messages = await Promise.all(filenames.filter(name=>/^[a-f0-9-]{36}\.json$/.test(name)).map(async name=>JSON.parse(await readFile(join(this.config.mailDir,name),"utf8"))));
    return {development_only:true,messages:messages.sort((a,b)=>b.captured_at.localeCompare(a.captured_at))};
  }
}
export async function createApplication(config: Config,database: Database,now:()=>Date=()=>new Date(),verifier:GuardianVerifier|undefined=guardianVerifier(config),scanner:EvidenceScanner|undefined=evidenceScanner(config),paymentProvider:PaymentProvider|undefined=config.payments?new RazorpayProvider(config.payments):undefined): Promise<INestApplication> {
  const auth = new AuthService(database,config,now);
  const staff = new StaffService(database,config,auth,now);
  const learners=new LearnersService(database,config,auth,staff,verifier,now);
  const catalogue=new CatalogueService(database,staff);
  const tutors=new TutorsService(database,config,auth,staff,scanner,now);
  const listings=new ListingsService(database,auth,staff,catalogue,tutors,now);
  const discovery=new DiscoveryService(database,config,now);
  const availability=new AvailabilityService(database,config,discovery,listings,now);
  const paidAccess=new PaidAccess(config,now);
  const refunds=new RefundsService(database,config,auth,staff,supportsRefunds(paymentProvider)?paymentProvider:undefined,now);
  const contactRequests=new ContactRequestsService(database,config,auth,learners,listings,paidAccess,discovery,now);
  const connections=new ConnectionsService(database,config,auth,learners,listings,tutors,paidAccess,now);
  const photos=new TutorPhotosService(database,config,auth,staff,scanner,now);
  const chat=new ChatService(connections,config,database,now);
  const realtime=new ChatRealtime(chat,config);
  const safety=new SafetyService(database,auth,config,staff,now);
  const paymentEvents=new PaymentEvents(database,config,paymentProvider,now);
  const payments=new PaymentsService(database,config,auth,learners,listings,paidAccess,paymentProvider,now);
  @Module({
    controllers:[RefundsController,PaymentsController,SafetyController,ChatController,AccountController,StaffController,LearnersController,CatalogueController,TutorsController,ListingsController,DiscoveryController,AvailabilityController,ContactRequestsController,ConnectionsController,TutorPhotosController,...(config.mode!=="production"&&config.mailTransport==="capture"?[DevelopmentMailController]:[])],
    providers:[{provide:RefundsService,useValue:refunds},{provide:PaymentEvents,useValue:paymentEvents},{provide:PaymentsService,useValue:payments},{provide:SafetyService,useValue:safety},{provide:ChatRealtime,useValue:realtime},{provide:ChatService,useValue:chat},{provide:TutorPhotosService,useValue:photos},{provide:AuthService,useValue:auth},{provide:StaffService,useValue:staff},{provide:LearnersService,useValue:learners},{provide:CatalogueService,useValue:catalogue},{provide:TutorsService,useValue:tutors},{provide:ListingsService,useValue:listings},{provide:DiscoveryService,useValue:discovery},{provide:AvailabilityService,useValue:availability},{provide:ContactRequestsService,useValue:contactRequests},{provide:ConnectionsService,useValue:connections},{provide:CONFIG,useValue:config},{provide:Database,useValue:database}],
  }) class ApplicationModule {}
  const app = await NestFactory.create(ApplicationModule,{logger:false,bodyParser:false});
  const express = app.getHttpAdapter().getInstance();
  express.disable("x-powered-by");
  express.set("trust proxy",false);
  app.use((request: AuthRequest,response: Response,next:()=>void)=>{
    request.correlationId=randomUUID();
    response.setHeader("X-Correlation-Id",request.correlationId);
    response.setHeader("Cache-Control","no-store");
    next();
  });
  app.use(helmet());
  app.enableCors({credentials:true,origin:(origin: string | undefined,callback: (error: Error | null,allow: boolean)=>void)=>callback(null,!origin||config.allowedOrigins.includes(origin))});
  app.use((request:AuthRequest,response:Response,next:()=>void)=>{
    if (request.method==='POST'&&request.path==='/v1/payments/razorpay/webhooks') {next();return;}
    if (["POST","PUT","PATCH","DELETE"].includes(request.method)) {
      if (!request.headers.origin || !config.allowedOrigins.includes(request.headers.origin)) {
        response.status(403).json({code:"ORIGIN_NOT_ALLOWED",message:"Request origin is not allowed.",correlation_id:request.correlationId});return;
      }
      if (!request.is("application/json")) {
        response.status(415).json({code:"JSON_REQUIRED",message:"Use application/json.",correlation_id:request.correlationId});return;
      }
    }
    next();
  });
  const webhookRaw=raw({type:'application/json',limit:'64kb'});
  app.use((request:Request,response:Response,next:()=>void)=>{if(request.method==='POST'&&request.path==='/v1/payments/razorpay/webhooks'){webhookRaw(request,response,next);}else next();});
  const formJson=json({limit:'8kb',strict:true});const uploadJson=json({limit:'1400kb',strict:true});
  app.use((request:Request,response:Response,next:()=>void)=>{if(request.path==='/v1/payments/razorpay/webhooks'&&request.method==='POST'){next();return;}(['/v1/me/tutor/evidence','/v1/me/tutor/photo'].includes(request.path)&&request.method==='POST'?uploadJson:formJson)(request,response,next);});
  app.useGlobalFilters(new ProblemsFilter());
  await app.init();
  return app;
}

