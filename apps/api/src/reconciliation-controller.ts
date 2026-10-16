import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ReconciliationService } from "./reconciliation.js";
import { sessionCookieName, type Config } from "./config.js";
import { ApiProblem } from "./errors.js";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      "Check the payment history fields.",
    );
  return r.data;
}
@Controller("v1")
export class ReconciliationController {
  constructor(
    @Inject(ReconciliationService)
    private readonly records: ReconciliationService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private account(r: Request) {
    const name = sessionCookieName(this.config);
    const values = (r.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(name + "="));
    return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
  }
  @Get("me/payment-history") history(
    @Req() r: Request,
    @Query() query: unknown,
  ) {
    return this.records.history(
      this.account(r),
      parse(z.strictObject({ cursor: z.uuid().optional() }), query).cursor,
    );
  }
  @Get("me/purchases/:id/receipt") receipt(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.records.receipt(this.account(r), parse(z.uuid(), id));
  }
}
