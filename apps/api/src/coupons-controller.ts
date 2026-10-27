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
import { CouponsService, couponCode, campaignInput } from "./coupons.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      "Check the coupon fields. Use a 4-32 character code, discount from 1 to 100, and valid dates and usage limit.",
    );
  return r.data;
};
@Controller("v1")
export class CouponsController {
  constructor(
    @Inject(CouponsService) private readonly coupons: CouponsService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private cookie(r: Request, name: string) {
    const values = (r.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .filter((v) => v.startsWith(name + "="));
    return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
  }
  private account(r: Request) {
    return this.cookie(r, sessionCookieName(this.config));
  }
  private staff(r: Request) {
    return this.cookie(r, staffCookieName(this.config));
  }
  @Post("me/coupons/quote") @HttpCode(200) quote(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    return this.coupons.quote(
      this.account(r),
      parse(z.strictObject({ code: couponCode }), body).code,
    );
  }
  @Get("me/coupon-redemptions") history(@Req() r: Request) {
    return this.coupons.history(this.account(r));
  }
  @Post("me/coupon-redemptions/:id/cancellation") @HttpCode(200) cancel(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), body);
    return this.coupons.cancel(this.account(r), parse(z.uuid(), id));
  }
  @Get("staff/coupons") campaigns(@Req() r: Request) {
    return this.coupons.campaigns(this.account(r), this.staff(r));
  }
  @Post("staff/coupons") @HttpCode(201) create(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    return this.coupons.createCampaign(
      this.account(r),
      this.staff(r),
      parse(campaignInput, body),
    );
  }
  @Post("staff/coupons/:id/disable") @HttpCode(200) disable(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.coupons.disable(
      this.account(r),
      this.staff(r),
      parse(z.uuid(), id),
      parse(
        z.strictObject({ reason: z.string().trim().min(10).max(240) }),
        body,
      ).reason,
    );
  }
}
