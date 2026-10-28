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
  PaymentsService,
  purchaseInput,
  confirmationInput,

} from "./payments.js";
import { sessionCookieName, type Config } from "./config.js";
import { PaymentEvents } from "./payment-events.js";
import { ApiProblem } from "./errors.js";
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiProblem(400, "VALIDATION_ERROR", "Check the checkout fields.");
  return result.data;
}
@Controller("v1")
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(PaymentEvents) private readonly events: PaymentEvents,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private token(r: Request) {
    const matches = (r.headers.cookie || "")
      .split(";")
      .map((value) => value.trim())
      .filter((value) =>
        value.startsWith(sessionCookieName(this.config) + "="),
      );
    return matches.length === 1
      ? matches[0].slice(matches[0].indexOf("=") + 1)
      : undefined;
  }
  @Post("payments/razorpay/webhooks") @HttpCode(202) webhook(
    @Req() r: Request,
    @Body() body: Buffer,
  ) {
    return this.events.ingest(
      body,
      r.get("x-razorpay-event-id") || "",
      r.get("x-razorpay-signature") || "",
    );
  }
  @Post("me/purchases/:id/confirmation") @HttpCode(200) confirm(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.payments.confirm(
      this.token(r),
      parse(z.uuid(), id),
      parse(confirmationInput, body),
    );
  }
  @Get('me/tutor/pro') pro(@Req() r:Request){return this.payments.pro(this.token(r));}
  @Post('me/tutor/pro/purchases') @HttpCode(200) buyPro(@Req() r:Request&{correlationId:string},@Body() body:unknown){return this.payments.createPro(this.token(r),parse(z.strictObject({request_key:z.uuid(),policy_version:z.literal('tutor-pro-v1'),coupon_code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{3,31}$/).optional()}),body),r.correlationId);}
  @Get("payments/policy") policy() {
    return this.payments.policy();
  }
  @Get("me/purchases/current") current(@Req() r: Request) {
    return this.payments.current(this.token(r));
  }
  @Get("me/purchases/:id") detail(@Req() r: Request, @Param("id") id: string) {
    return this.payments.detail(this.token(r), parse(z.uuid(), id));
  }
  @Post("me/purchases") @HttpCode(200) create(
    @Req() r: Request & { correlationId: string },
    @Body() body: unknown,
  ) {
    return this.payments.create(
      this.token(r),
      parse(purchaseInput, body),
      r.correlationId,
    );
  }
}
