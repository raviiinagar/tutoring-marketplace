import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  NotificationsService,
  notificationPreferencesInput,
} from "./notifications.js";
import { sessionCookieName, type Config } from "./config.js";
import { ApiProblem } from "./errors.js";
@Controller("v1/me")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private token(r: Request) {
    const name = sessionCookieName(this.config);
    const values = (r.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(name + "="));
    return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
  }
  @Get("notifications") list(@Req() r: Request) {
    return this.notifications.list(this.token(r));
  }
  @Get("notification-preferences") preferences(@Req() r: Request) {
    return this.notifications.preferences(this.token(r));
  }
  @Post("notification-preferences") @HttpCode(200) update(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    const input = notificationPreferencesInput.safeParse(body);
    if (!input.success)
      throw new ApiProblem(
        400,
        "VALIDATION_ERROR",
        "Check notification preferences and the current notice version.",
      );
    return this.notifications.updatePreferences(this.token(r), input.data);
  }
}
