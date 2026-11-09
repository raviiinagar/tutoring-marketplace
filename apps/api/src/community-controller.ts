import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  CommunityService,
  joinInput,
  nicknameInput,
  postInput,
  historyQuery,
  reactionInput,
  reportInput,
  moderationInput,
  muteInput,
  channelCreate,
  channelUpdate,
  staffReason,
} from "./community.js";
import { CommunityRealtime } from "./community-realtime.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiProblem(400, "VALIDATION_ERROR", result.error.issues[0]?.message || "Check the community fields.");
  return result.data;
}
function cookie(request: Request, name: string) {
  const found = (request.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(name + "="));
  return found.length === 1 ? found[0].slice(name.length + 1) : undefined;
}
const empty = z.strictObject({});
const id = z.uuid();

@Controller("v1")
export class CommunityController {
  constructor(
    @Inject(CommunityService) private readonly community: CommunityService,
    @Inject(CommunityRealtime) private readonly realtime: CommunityRealtime,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private account(r: Request) {
    return cookie(r, sessionCookieName(this.config));
  }
  private staff(r: Request) {
    return cookie(r, staffCookieName(this.config));
  }
  @Get("community-policy") policy() {
    return this.community.policy();
  }
  @Get("community") overview(@Req() r: Request) {
    return this.community.overview(this.account(r));
  }
  @Post("community/membership") @HttpCode(200) join(@Req() r: Request, @Body() body: unknown) {
    return this.community.join(this.account(r), parse(joinInput, body));
  }
  @Post("community/membership/nickname") @HttpCode(200) rename(@Req() r: Request, @Body() body: unknown) {
    return this.community.rename(this.account(r), parse(nicknameInput, body));
  }
  @Delete("community/membership") leave(@Req() r: Request, @Body() body: unknown) {
    parse(empty, body ?? {});
    return this.community.leave(this.account(r));
  }
  @Get("community/channels/:id/messages") history(@Req() r: Request, @Param("id") channel: string, @Query() query: unknown) {
    return this.community.history(this.account(r), parse(id, channel), parse(historyQuery, query));
  }
  @Get("community/channels/:id/pins") pins(@Req() r: Request, @Param("id") channel: string) {
    return this.community.pins(this.account(r), parse(id, channel));
  }
  @Get("community/channels/:id/events") async events(
    @Req() r: Request,
    @Param("id") channel: string,
    @Query() query: unknown,
    @Res() response: Response,
  ) {
    if (r.headers.origin && !this.config.allowedOrigins.includes(r.headers.origin))
      throw new ApiProblem(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed.");
    const input = parse(z.strictObject({ after: z.coerce.number().int().min(0) }), query);
    const token = this.account(r);
    await this.realtime.open(token, token ?? "", parse(id, channel), input.after, response);
  }
  @Post("community/channels/:id/messages") @HttpCode(201) post(@Req() r: Request, @Param("id") channel: string, @Body() body: unknown) {
    return this.community.post(this.account(r), this.staff(r), parse(id, channel), parse(postInput, body));
  }
  @Delete("community/messages/:id") remove(@Req() r: Request, @Param("id") message: string, @Body() body: unknown) {
    parse(empty, body ?? {});
    return this.community.remove(this.account(r), parse(id, message));
  }
  @Post("community/messages/:id/reactions") @HttpCode(200) react(@Req() r: Request, @Param("id") message: string, @Body() body: unknown) {
    return this.community.react(this.account(r), parse(id, message), parse(reactionInput, body).emoji, true);
  }
  @Delete("community/messages/:id/reactions") unreact(@Req() r: Request, @Param("id") message: string, @Body() body: unknown) {
    return this.community.react(this.account(r), parse(id, message), parse(reactionInput, body).emoji, false);
  }
  @Post("community/messages/:id/reports") @HttpCode(200) report(@Req() r: Request, @Param("id") message: string, @Body() body: unknown) {
    return this.community.report(this.account(r), parse(id, message), parse(reportInput, body));
  }
  @Get("staff/community/reports") reports(@Req() r: Request, @Query() query: unknown) {
    return this.community.reports(this.account(r), this.staff(r), parse(z.strictObject({ reason: staffReason }), query).reason);
  }
  @Post("staff/community/messages/:id/actions") @HttpCode(200) moderate(@Req() r: Request, @Param("id") message: string, @Body() body: unknown) {
    return this.community.moderate(this.account(r), this.staff(r), parse(id, message), parse(moderationInput, body));
  }
  @Get("staff/community/mutes") mutes(@Req() r: Request) {
    return this.community.mutes(this.account(r), this.staff(r));
  }
  @Post("staff/community/mutes") @HttpCode(200) mute(@Req() r: Request, @Body() body: unknown) {
    return this.community.setMute(this.account(r), this.staff(r), parse(muteInput, body));
  }
  @Get("staff/community/channels") channels(@Req() r: Request) {
    return this.community.staffChannels(this.account(r), this.staff(r));
  }
  @Post("staff/community/channels") @HttpCode(201) createChannel(@Req() r: Request, @Body() body: unknown) {
    return this.community.createChannel(this.account(r), this.staff(r), parse(channelCreate, body));
  }
  @Post("staff/community/channels/:id") @HttpCode(200) updateChannel(@Req() r: Request, @Param("id") channel: string, @Body() body: unknown) {
    return this.community.updateChannel(this.account(r), this.staff(r), parse(id, channel), parse(channelUpdate, body));
  }
}
