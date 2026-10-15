import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  SafetyService,
  reportInput,
  safetyPurpose,
  safetyAction,
  appealInput,
} from "./safety.js";
import { staffCookieName } from "./staff.js";
import { sessionCookieName, type Config } from "./config.js";
import { ApiProblem } from "./errors.js";
type ActorRequest = Request & { correlationId: string };
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      "Check the safety form fields.",
    );
  return r.data;
}
function cookie(r: Request, name: string) {
  const values = (r.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(name + "="));
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
}
@Controller("v1")
export class SafetyController {
  constructor(
    @Inject(SafetyService) private readonly safety: SafetyService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private account(r: Request) {
    return cookie(r, sessionCookieName(this.config));
  }
  private kind(r: Request) {
    return r.path.startsWith("/v1/me/connections/")
      ? ("connection" as const)
      : ("request" as const);
  }
  @Get(["me/connections/:id/safety", "me/contact-requests/:id/safety"]) context(
    @Req() r: ActorRequest,
    @Param("id") id: string,
  ) {
    return this.safety.context(
      this.account(r),
      parse(z.uuid(), id),
      this.kind(r),
    );
  }
  @Post([
    "me/connections/:id/safety/block",
    "me/contact-requests/:id/safety/block",
  ])
  @HttpCode(200)
  block(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.safety.block(
      this.account(r),
      parse(z.uuid(), id),
      this.kind(r),
      parse(z.strictObject({ blocked: z.boolean() }), body).blocked,
      r.correlationId,
    );
  }
  @Post([
    "me/connections/:id/safety/reports",
    "me/contact-requests/:id/safety/reports",
  ])
  @HttpCode(201)
  report(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.safety.report(
      this.account(r),
      parse(z.uuid(), id),
      this.kind(r),
      parse(reportInput, body),
      r.correlationId,
    );
  }
  @Get("me/safety") own(@Req() r: ActorRequest) {
    return this.safety.own(this.account(r));
  }
  @Post("me/safety-cases/:id/appeals") @HttpCode(201) appeal(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.safety.appeal(
      this.account(r),
      parse(z.uuid(), id),
      parse(appealInput, body),
      r.correlationId,
    );
  }
  @Get("staff/safety-cases") queue(@Req() r: ActorRequest) {
    return this.safety.queue(
      this.account(r),
      cookie(r, staffCookieName(this.config)),
    );
  }
  @Post("staff/safety-cases/:id/inspections") @HttpCode(200) inspect(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.safety.inspect(
      this.account(r),
      cookie(r, staffCookieName(this.config)),
      parse(z.uuid(), id),
      parse(safetyPurpose, body).reason,
      r.correlationId,
    );
  }
  @Post("staff/safety-cases/:id/actions") @HttpCode(200) action(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.safety.action(
      this.account(r),
      cookie(r, staffCookieName(this.config)),
      parse(z.uuid(), id),
      parse(safetyAction, body),
      r.correlationId,
    );
  }
}
