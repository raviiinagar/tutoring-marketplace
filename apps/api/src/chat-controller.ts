import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Query,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  ChatService,
  chatMessageInput,
  chatReadInput,
  chatHistoryInput,
} from "./chat.js";
import { sessionCookieName, type Config } from "./config.js";
import { ApiProblem } from "./errors.js";
import { ChatRealtime } from "./chat-realtime.js";
type ActorRequest = Request & { correlationId: string };
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiProblem(400, "VALIDATION_ERROR", "Check the chat fields.");
  return result.data;
}
@Controller("v1/me/connections")
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
    @Inject(ChatRealtime) private readonly realtime: ChatRealtime,
  ) {}
  private token(r: Request) {
    const prefix = sessionCookieName(this.config) + "=";
    const found = (r.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .filter((v) => v.startsWith(prefix));
    return found.length === 1 ? found[0].slice(prefix.length) : undefined;
  }
  @Post(":id/messages") @HttpCode(201) send(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.chat.send(
      this.token(r),
      parse(z.uuid(), id),
      parse(chatMessageInput, body),
      r.correlationId,
    );
  }
  @Get(":id/messages") history(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    return this.chat.history(
      this.token(r),
      parse(z.uuid(), id),
      parse(chatHistoryInput, query),
    );
  }
  @Post(":id/read-position") @HttpCode(200) read(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.chat.markRead(
      this.token(r),
      parse(z.uuid(), id),
      parse(chatReadInput, body).sequence,
    );
  }
  @Get(":id/events") async events(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Query() query: unknown,
    @Res() response: Response,
  ) {
    if (
      r.headers.origin &&
      !this.config.allowedOrigins.includes(r.headers.origin)
    )
      throw new ApiProblem(
        403,
        "ORIGIN_NOT_ALLOWED",
        "Request origin is not allowed.",
      );
    const input = parse(chatHistoryInput, query);
    if (input.before !== undefined || input.limit !== undefined)
      throw new ApiProblem(
        400,
        "INVALID_CURSOR",
        "Use an after cursor for realtime.",
      );
    const header = r.headers["last-event-id"];
    const after =
      header === undefined
        ? (input.after ?? 0)
        : parse(chatHistoryInput, { after: header }).after!;
    await this.realtime.open(
      this.token(r),
      parse(z.uuid(), id),
      after,
      response,
    );
  }
}
