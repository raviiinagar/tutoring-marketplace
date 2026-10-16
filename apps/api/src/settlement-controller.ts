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
  SettlementReconciliation,
  reconciliationInput,
  bankInput,
  captureConfirmationInput,
} from "./settlement-reconciliation.js";
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
      "Check the reconciliation fields.",
    );
  return r.data;
}
@Controller("v1/staff/finance")
export class SettlementController {
  constructor(
    @Inject(SettlementReconciliation)
    private readonly records: SettlementReconciliation,
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
  @Post("reconciliation-runs") @HttpCode(200) start(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    return this.records.start(
      this.account(r),
      this.elevated(r),
      parse(reconciliationInput, body),
    );
  }
  @Get("reconciliation") view(@Req() r: Request, @Query() query: unknown) {
    return this.records.view(
      this.account(r),
      this.elevated(r),
      parse(z.strictObject({ reason: financeReason }), query).reason,
    );
  }
  @Post("bank-receipts") @HttpCode(200) bank(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    return this.records.bank(
      this.account(r),
      this.elevated(r),
      parse(bankInput, body),
    );
  }
  @Post("purchases/:id/capture-confirmations") @HttpCode(200) capture(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.records.confirmCapture(
      this.account(r),
      this.elevated(r),
      parse(z.uuid(), id),
      parse(captureConfirmationInput, body),
    );
  }
  @Post("reconciliation-runs/:id/retries") @HttpCode(200) retry(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.records.retry(
      this.account(r),
      this.elevated(r),
      parse(z.uuid(), id),
      parse(z.strictObject({ reason: financeReason }), body).reason,
    );
  }
  @Post("exceptions/:id/resolutions") @HttpCode(200) resolve(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.records.resolve(
      this.account(r),
      this.elevated(r),
      parse(z.uuid(), id),
      parse(z.strictObject({ reason: financeReason }), body).reason,
    );
  }
}
