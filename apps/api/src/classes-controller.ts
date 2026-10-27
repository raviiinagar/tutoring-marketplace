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
  ClassesService,
  createClassInput,
  editClassInput,
  classRevisionInput,
} from "./classes.js";
import { sessionCookieName, type Config } from "./config.js";
import { ApiProblem } from "./errors.js";
type ActorRequest = Request & { correlationId: string };
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      result.error.issues[0]?.message || "Check the class fields.",
    );
  return result.data;
}
@Controller("v1/me/connections/:connection/classes")
export class ClassesController {
  constructor(
    @Inject(ClassesService) private readonly classes: ClassesService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private token(r: Request) {
    const prefix = sessionCookieName(this.config) + "=",
      matches = (r.headers.cookie || "")
        .split(";")
        .map((v) => v.trim())
        .filter((v) => v.startsWith(prefix));
    return matches.length === 1 ? matches[0].slice(prefix.length) : undefined;
  }
  @Get() list(@Req() r: ActorRequest, @Param("connection") id: string) {
    return this.classes.list(this.token(r), parse(z.uuid(), id));
  }
  @Post() @HttpCode(201) create(
    @Req() r: ActorRequest,
    @Param("connection") id: string,
    @Body() body: unknown,
  ) {
    return this.classes.create(
      this.token(r),
      parse(z.uuid(), id),
      parse(createClassInput, body),
      r.correlationId,
    );
  }
  @Post(":id") @HttpCode(200) edit(
    @Req() r: ActorRequest,
    @Param("connection") connection: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.classes.edit(
      this.token(r),
      parse(z.uuid(), connection),
      parse(z.uuid(), id),
      parse(editClassInput, body),
      r.correlationId,
    );
  }
  @Post(":id/cancellation") @HttpCode(200) cancel(
    @Req() r: ActorRequest,
    @Param("connection") connection: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.classes.cancel(
      this.token(r),
      parse(z.uuid(), connection),
      parse(z.uuid(), id),
      parse(classRevisionInput, body).revision,
      r.correlationId,
    );
  }
  @Post(":id/join") @HttpCode(200) join(
    @Req() r: ActorRequest,
    @Param("connection") connection: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), body);
    return this.classes.join(
      this.token(r),
      parse(z.uuid(), connection),
      parse(z.uuid(), id),
      r.correlationId,
    );
  }
}
