import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  SupportService,
  supportInput,
  supportAction,
  supportReason,
  refundAppealInput,
  supportMessageInput,
} from "./support.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";
function parse<T>(schema: z.ZodType<T>, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      r.error.issues[0]?.message || "Check support fields.",
    );
  return r.data;
}
@Controller("v1")
export class SupportController {
  constructor(
    @Inject(SupportService) private readonly support: SupportService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private cookie(r: Request, name: string) {
    const v = (r.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(name + "="));
    return v.length === 1 ? v[0].slice(name.length + 1) : undefined;
  }
  private account(r: Request) {
    return this.cookie(r, sessionCookieName(this.config));
  }
  private staff(r: Request) {
    return this.cookie(r, staffCookieName(this.config));
  }
  @Get("support-policy") policy() {
    return this.support.policy();
  }
  @Get("me/support-cases") list(@Req() r: Request) {
    return this.support.list(this.account(r));
  }
  @Post("me/support-cases") create(@Req() r: Request, @Body() b: unknown) {
    return this.support.create(this.account(r), parse(supportInput, b));
  }
  @Post("me/refund-cases/:id/appeals") refundAppeal(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.support.refundAppeal(
      this.account(r),
      parse(z.uuid(), id),
      parse(refundAppealInput, b),
    );
  }
  @Get("me/support-cases/:id") read(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.support.read(this.account(r), parse(z.uuid(), id));
  }
  @Post("me/support-cases/:id/messages") @HttpCode(200) message(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.support.message(
      this.account(r),
      parse(z.uuid(), id),
      parse(supportMessageInput, b),
    );
  }
  @Get("staff/support-cases") queue(@Req() r: Request, @Query() q: unknown) {
    const p = parse(
      z.strictObject({
        scope: z.enum(["SUPPORT", "FINANCE", "TRUST"]),
        reason: supportReason,
      }),
      q,
    );
    return this.support.queue(
      this.account(r),
      this.staff(r),
      p.scope,
      p.reason,
    );
  }
  @Post("staff/support-cases/:id/inspections") @HttpCode(200) inspect(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.support.inspect(
      this.account(r),
      this.staff(r),
      parse(z.uuid(), id),
      parse(z.strictObject({ reason: supportReason }), b).reason,
    );
  }
  @Post("staff/support-cases/:id/actions") @HttpCode(200) action(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.support.action(
      this.account(r),
      this.staff(r),
      parse(z.uuid(), id),
      parse(supportAction, b),
    );
  }
}
