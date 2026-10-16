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
  FinanceService,
  refundCaseInput,
  refundReviewInput,
} from "./finance.js";
import { financeReason } from "./refunds.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      "Check the refund review fields.",
    );
  return result.data;
}
@Controller("v1")
export class FinanceController {
  constructor(
    @Inject(FinanceService) private readonly finance: FinanceService,
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
  @Post("me/purchases/:id/refund-cases") @HttpCode(201) create(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.finance.createCase(
      this.account(r),
      parse(z.uuid(), id),
      parse(refundCaseInput, body),
    );
  }
  @Get("me/purchases/:id/refund-cases") cases(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.finance.cases(this.account(r), parse(z.uuid(), id));
  }
  @Get("staff/refund-cases") queue(@Req() r: Request, @Query() query: unknown) {
    return this.finance.queue(
      this.account(r),
      this.elevated(r),
      parse(z.strictObject({ reason: financeReason }), query).reason,
    );
  }
  @Post("staff/refund-cases/:id/decisions") @HttpCode(200) review(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.finance.review(
      this.account(r),
      this.elevated(r),
      parse(z.uuid(), id),
      parse(refundReviewInput, body),
    );
  }
}
