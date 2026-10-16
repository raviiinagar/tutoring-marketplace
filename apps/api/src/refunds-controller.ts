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
import { RefundsService, financeReason, reserveInput } from "./refunds.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiProblem(400, "VALIDATION_ERROR", "Check the finance fields.");
  return result.data;
}
@Controller("v1")
export class RefundsController {
  constructor(
    @Inject(RefundsService) private readonly refunds: RefundsService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private cookie(r: Request, name: string) {
    const values = (r.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(name + "="));
    return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
  }
  private account(r: Request) {
    return this.cookie(r, sessionCookieName(this.config));
  }
  private elevated(r: Request) {
    return this.cookie(r, staffCookieName(this.config));
  }
  @Get("me/purchases/:id/refunds") detail(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.refunds.detail(this.account(r), parse(z.uuid(), id));
  }
  @Post("me/purchases/:id/cancellations") @HttpCode(200) cancel(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), body);
    return this.refunds.cancel(this.account(r), parse(z.uuid(), id));
  }
  @Post("staff/refund-reserve/funding") @HttpCode(200) funding(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    return this.refunds.funding(
      this.account(r),
      this.elevated(r),
      parse(reserveInput, body),
    );
  }
  @Get("staff/refunds") queue(@Req() r: Request, @Query() query: unknown) {
    return this.refunds.queue(
      this.account(r),
      this.elevated(r),
      parse(z.strictObject({ reason: financeReason }), query).reason,
    );
  }
  @Post("staff/refunds/:id/retries") @HttpCode(200) retry(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.refunds.retry(
      this.account(r),
      this.elevated(r),
      parse(z.uuid(), id),
      parse(z.strictObject({ reason: financeReason }), body).reason,
    );
  }
}
