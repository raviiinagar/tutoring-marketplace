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
import { NotificationsService } from "./notifications.js";
import { financeReason } from "./refunds.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      "Check the delivery operation fields.",
    );
  return r.data;
}
@Controller("v1/staff/notifications")
export class NotificationStaffController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
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
  @Get() queue(@Req() r: Request, @Query() query: unknown) {
    return this.notifications.queue(
      this.account(r),
      this.elevated(r),
      parse(z.strictObject({ reason: financeReason }), query).reason,
    );
  }
  @Post(":id/retries") @HttpCode(200) retry(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.notifications.retry(
      this.account(r),
      this.elevated(r),
      parse(z.uuid(), id),
      parse(z.strictObject({ reason: financeReason }), body).reason,
    );
  }
  @Post(":id/provider-confirmations") @HttpCode(200) reconcile(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.strictObject({
        provider_reference: z.string().regex(/^SM[0-9a-fA-F]{32}$/),
        reason: financeReason,
      }),
      body,
    );
    return this.notifications.reconcileSms(
      this.account(r),
      this.elevated(r),
      parse(z.uuid(), id),
      input.provider_reference,
      input.reason,
    );
  }
}
