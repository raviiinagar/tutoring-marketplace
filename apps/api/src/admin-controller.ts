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
  AdminService,
  trafficInput,
  adminInput,
  accountSearchInput,
} from "./admin.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";
const parse = <T>(schema: z.ZodType<T>, body: unknown) => {
  const r = schema.safeParse(body);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      "Check the reporting fields.",
    );
  return r.data;
};
@Controller("v1")
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private cookie(r: Request, name: string) {
    const v = (r.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .filter((v) => v.startsWith(name + "="));
    return v.length === 1 ? v[0].slice(name.length + 1) : undefined;
  }
  @Post("public/traffic") @HttpCode(200) traffic(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    return this.admin.traffic(parse(trafficInput, body), r.ip || "unknown");
  }
  @Get("staff/admin/overview") overview(
    @Req() r: Request,
    @Query() q: unknown,
  ) {
    return this.admin.overview(
      this.cookie(r, sessionCookieName(this.config)),
      this.cookie(r, staffCookieName(this.config)),
      Number(parse(adminInput, q).days),
    );
  }
  @Post("staff/admin/accounts/search") @HttpCode(200) accounts(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    return this.admin.accounts(
      this.cookie(r, sessionCookieName(this.config)),
      this.cookie(r, staffCookieName(this.config)),
      parse(accountSearchInput, body),
    );
  }
}
