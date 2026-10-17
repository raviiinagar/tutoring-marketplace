import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  Operations,
  operationsQuery,
  checkoutControl,
  replayInput,
  observationInput,
  recoveryRelease,
} from "./operations.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      "Check the operations fields.",
    );
  return r.data;
}
@Controller("v1/staff/operations")
export class OperationsController {
  constructor(
    @Inject(Operations) private readonly ops: Operations,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private cookies(r: Request) {
    const cookie = (name: string) => {
      const v = (r.headers.cookie || "")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.startsWith(name + "="));
      return v.length === 1 ? v[0].slice(name.length + 1) : undefined;
    };
    return [
      cookie(sessionCookieName(this.config)),
      cookie(staffCookieName(this.config)),
    ] as const;
  }
  @Get() report(@Req() r: Request, @Query() q: unknown) {
    return this.ops.report(...this.cookies(r), parse(operationsQuery, q));
  }
  @Post("checkout") @HttpCode(200) checkout(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.ops.checkout(...this.cookies(r), parse(checkoutControl, b));
  }
  @Post("recovery-releases") @HttpCode(200) releaseRecovery(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.ops.releaseRecovery(
      ...this.cookies(r),
      parse(recoveryRelease, b),
    );
  }
  @Post("replays") @HttpCode(200) replay(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.ops.replay(...this.cookies(r), parse(replayInput, b));
  }
  @Post("observations") @HttpCode(200) observe(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.ops.observe(...this.cookies(r), parse(observationInput, b));
  }
}
