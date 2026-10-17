import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  Query,
  Delete,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  PrivacyService,
  privacyRequest,
  privacyVerification,
  receiptName,
} from "./privacy.js";
import { sessionCookieName, type Config } from "./config.js";
import { ApiProblem } from "./errors.js";
import { staffCookieName } from "./staff.js";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      "Check privacy request fields.",
    );
  return r.data;
}
@Controller("v1")
export class PrivacyController {
  constructor(
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private cookie(r: Request, name: string) {
    const v = (r.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(name + "="));
    return v.length === 1 ? v[0].slice(name.length + 1) : undefined;
  }
  private account(r: Request) {
    return this.cookie(r, sessionCookieName(this.config));
  }
  @Get("privacy-policy") policy() {
    return this.privacy.policy();
  }
  @Get("me/privacy") state(@Req() r: Request) {
    return this.privacy.state(
      this.account(r),
      this.cookie(r, receiptName(this.config)),
    );
  }
  @Post("me/privacy/verifications") @HttpCode(200) async verify(
    @Req() r: Request,
    @Body() b: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.privacy.verify(
      this.account(r),
      parse(privacyVerification, b),
    );
    response.cookie(receiptName(this.config), result.receipt, {
      httpOnly: true,
      secure: this.config.mode === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 86400000,
    });
    return { proof: result.proof, expires_at: result.expires_at };
  }
  @Post("me/privacy/requests") @HttpCode(202) request(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    return this.privacy.request(this.account(r), parse(privacyRequest, b));
  }
  @Post("me/privacy/requests/:id/download") @HttpCode(200) async download(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
    @Res() response: Response,
  ) {
    const result = await this.privacy.download(
      this.account(r),
      parse(z.uuid(), id),
      parse(
        z.strictObject({
          verification: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        }),
        b,
      ).verification,
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="personal-data.json"',
    );
    response.json(result);
  }
  @Post("staff/privacy/retained/:id/inspections") @HttpCode(200) inspect(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.privacy.inspectRetained(
      this.account(r),
      this.cookie(r, staffCookieName(this.config)),
      parse(z.uuid(), id),
      parse(z.strictObject({ reason: z.string().trim().min(10).max(240) }), b)
        .reason,
    );
  }
  @Post("staff/privacy/retained/:id/holds") @HttpCode(200) hold(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.privacy.hold(
      this.account(r),
      this.cookie(r, staffCookieName(this.config)),
      parse(z.uuid(), id),
      parse(
        z.strictObject({
          operation: z.enum(["HOLD", "RELEASE"]),
          reason: z.string().trim().min(10).max(240),
          reference: z.string().trim().min(10).max(240).optional(),
          hold_id: z.uuid().optional(),
        }),
        b,
      ),
    );
  }
  @Get("staff/privacy") queue(@Req() r: Request, @Query() q: unknown) {
    const input = parse(
      z.strictObject({
        scope: z.enum(["SUPPORT", "TRUST", "FINANCE"]),
        reason: z.string().trim().min(10).max(240),
      }),
      q,
    );
    return this.privacy.queue(
      this.account(r),
      this.cookie(r, staffCookieName(this.config)),
      input.scope,
      input.reason,
    );
  }
  @Post("staff/privacy/requests/:id/external-completions")
  @HttpCode(200)
  external(@Req() r: Request, @Param("id") id: string, @Body() b: unknown) {
    const input = parse(
      z.strictObject({
        reason: z.string().trim().min(10).max(240),
        reference: z.string().trim().min(10).max(240),
      }),
      b,
    );
    return this.privacy.completeExternal(
      this.account(r),
      this.cookie(r, staffCookieName(this.config)),
      parse(z.uuid(), id),
      input.reason,
      input.reference,
    );
  }
  @Post("staff/privacy/requests/:id/retries") @HttpCode(200) retry(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.privacy.retry(
      this.account(r),
      this.cookie(r, staffCookieName(this.config)),
      parse(z.uuid(), id),
      parse(z.strictObject({ reason: z.string().trim().min(10).max(240) }), b)
        .reason,
    );
  }
  @Delete("me/privacy/receipt") @HttpCode(204) async forget(
    @Req() r: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.privacy.forgetReceipt(this.cookie(r, receiptName(this.config)));
    response.clearCookie(receiptName(this.config), {
      httpOnly: true,
      secure: this.config.mode === "production",
      sameSite: "lax",
      path: "/",
    });
  }
}
