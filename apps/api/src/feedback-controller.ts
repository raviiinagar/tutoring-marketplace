import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { FeedbackService, feedbackInput, feedbackAction, feedbackQueueQuery, feedbackReason, boardQuery } from "./feedback.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiProblem(400, "VALIDATION_ERROR", result.error.issues[0]?.message || "Check the feedback fields.");
  return result.data;
}
function cookie(request: Request, name: string) {
  const found = (request.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(name + "="));
  return found.length === 1 ? found[0].slice(name.length + 1) : undefined;
}
function send(response: Response, bytes: Buffer) {
  response.setHeader("Content-Type", "image/jpeg");
  response.setHeader("Content-Disposition", 'inline; filename="feedback-screenshot.jpg"');
  response.setHeader("Cache-Control", "no-store");
  response.send(bytes);
}
const empty = z.strictObject({});
const reasonBody = z.strictObject({ reason: feedbackReason });

@Controller("v1")
export class FeedbackController {
  constructor(
    @Inject(FeedbackService) private readonly feedback: FeedbackService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private account(r: Request) {
    return cookie(r, sessionCookieName(this.config));
  }
  private staff(r: Request) {
    return cookie(r, staffCookieName(this.config));
  }
  @Get("feedback-policy") policy() {
    return this.feedback.policy();
  }
  @Get("me/feedback") list(@Req() r: Request) {
    return this.feedback.list(this.account(r));
  }
  @Post("me/feedback") create(@Req() r: Request, @Body() body: unknown) {
    return this.feedback.create(this.account(r), parse(feedbackInput, body));
  }
  @Get("me/feedback/:id") read(@Req() r: Request, @Param("id") id: string) {
    return this.feedback.read(this.account(r), parse(z.uuid(), id));
  }
  @Get("me/feedback/:id/screenshot") async screenshot(@Req() r: Request, @Param("id") id: string, @Res() response: Response) {
    send(response, await this.feedback.ownScreenshot(this.account(r), parse(z.uuid(), id)));
  }
  @Get("feedback/board") board(@Req() r: Request, @Query() query: unknown) {
    return this.feedback.board(this.account(r), parse(boardQuery, query));
  }
  @Post("feedback/board/:id/votes") @HttpCode(200) vote(@Req() r: Request, @Param("id") id: string, @Body() body: unknown) {
    parse(empty, body);
    return this.feedback.vote(this.account(r), parse(z.uuid(), id), true);
  }
  @Delete("feedback/board/:id/votes") unvote(@Req() r: Request, @Param("id") id: string, @Body() body: unknown) {
    parse(empty, body ?? {});
    return this.feedback.vote(this.account(r), parse(z.uuid(), id), false);
  }
  @Get("staff/feedback") queue(@Req() r: Request, @Query() query: unknown) {
    return this.feedback.queue(this.account(r), this.staff(r), parse(feedbackQueueQuery, query));
  }
  @Post("staff/feedback/:id/inspections") @HttpCode(200) inspect(@Req() r: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.feedback.inspect(this.account(r), this.staff(r), parse(z.uuid(), id), parse(reasonBody, body).reason);
  }
  @Post("staff/feedback/:id/screenshot-inspections") @HttpCode(200) async staffScreenshot(
    @Req() r: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    send(response, await this.feedback.staffScreenshot(this.account(r), this.staff(r), parse(z.uuid(), id), parse(reasonBody, body).reason));
  }
  @Post("staff/feedback/:id/actions") @HttpCode(200) action(@Req() r: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.feedback.action(this.account(r), this.staff(r), parse(z.uuid(), id), parse(feedbackAction, body));
  }
}
