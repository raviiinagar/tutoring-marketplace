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
  MarketplaceMetrics,
  searchObservation,
  metricsInput,
} from "./marketplace-metrics.js";
import { ApiProblem } from "./errors.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      "Check the structured search or reporting interval.",
    );
  return r.data;
}
@Controller("v1")
export class MarketplaceMetricsController {
  constructor(
    @Inject(MarketplaceMetrics) private readonly metrics: MarketplaceMetrics,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private cookie(r: Request, name: string) {
    const values = (r.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(name + "="));
    return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
  }
  @Post("discovery/searches") @HttpCode(200) search(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    return this.metrics.search(
      parse(searchObservation, body),
      r.ip || "unknown",
    );
  }
  @Get("staff/marketplace-metrics") dashboard(
    @Req() r: Request,
    @Query() query: unknown,
  ) {
    return this.metrics.dashboard(
      this.cookie(r, sessionCookieName(this.config)),
      this.cookie(r, staffCookieName(this.config)),
      parse(metricsInput, query),
    );
  }
}
