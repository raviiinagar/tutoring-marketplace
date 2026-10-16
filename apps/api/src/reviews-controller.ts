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
  ReviewsService,
  reviewInput,
  moderationInput,
  reviewReason,
} from "./reviews.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      r.error.issues[0]?.message || "Check review fields.",
    );
  return r.data;
}
@Controller("v1")
export class ReviewsController {
  constructor(
    @Inject(ReviewsService) private readonly reviews: ReviewsService,
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
  @Get("me/connections/:id/review") context(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.reviews.context(this.account(r), parse(z.uuid(), id));
  }
  @Post("me/connections/:id/review") submit(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.reviews.submit(
      this.account(r),
      parse(z.uuid(), id),
      parse(reviewInput, b),
    );
  }
  @Get("me/reviews") own(@Req() r: Request) {
    return this.reviews.own(this.account(r));
  }
  @Post("me/reviews/:id/withdrawals") @HttpCode(200) withdraw(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.reviews.withdraw(
      this.account(r),
      parse(z.uuid(), id),
      parse(z.strictObject({ revision: z.number().int().positive() }), b)
        .revision,
    );
  }
  @Get("staff/reviews") queue(@Req() r: Request, @Query() q: unknown) {
    return this.reviews.queue(
      this.account(r),
      this.elevated(r),
      parse(z.strictObject({ reason: reviewReason }), q).reason,
    );
  }
  @Post("staff/reviews/:id/inspections") @HttpCode(200) inspect(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.reviews.inspect(
      this.account(r),
      this.elevated(r),
      parse(z.uuid(), id),
      parse(z.strictObject({ reason: reviewReason }), b).reason,
    );
  }
  @Post("staff/reviews/:id/decisions") @HttpCode(200) moderate(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.reviews.moderate(
      this.account(r),
      this.elevated(r),
      parse(z.uuid(), id),
      parse(moderationInput, b),
    );
  }

  @Post("me/reviews/:id/appeals") appeal(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.reviews.appeal(
      this.account(r),
      parse(z.uuid(), id),
      parse(
        z.strictObject({
          request_key: z.uuid(),
          revision: z.number().int().positive(),
          description: z.string().trim().min(10).max(2000),
        }),
        b,
      ),
    );
  }
}
