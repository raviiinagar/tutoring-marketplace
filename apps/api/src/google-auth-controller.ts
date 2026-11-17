import { Controller, Get, Inject, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { GoogleSignIn, googleBindingCookie } from "./google-auth.js";
import { sessionCookieName, type Config } from "./config.js";

type GoogleRequest = Request & { correlationId: string };
function cookie(request: Request, name: string) {
  const found = (request.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(name + "="));
  return found.length === 1 ? found[0].slice(name.length + 1) : undefined;
}

/** ADR0020. Browser navigations, not API calls: both Google routes answer with redirects. */
@Controller("v1/auth")
export class GoogleSignInController {
  constructor(
    @Inject(GoogleSignIn) private readonly google: GoogleSignIn,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private options(expires: Date, path = "/") {
    return { httpOnly: true, secure: this.config.mode === "production", sameSite: "lax" as const, path, expires };
  }

  @Get("providers") providers() {
    return { google: this.google.enabled };
  }

  @Get("google/start") async start(@Req() r: GoogleRequest, @Query("return_to") returnTo: unknown, @Res() response: Response) {
    const result = await this.google.start(returnTo, r.ip || "unknown");
    if ("binding" in result && result.binding)
      response.cookie(googleBindingCookie, result.binding, this.options(result.bindingExpires, "/v1/auth/google"));
    response.redirect(302, result.location);
  }

  @Get("google/callback") async callback(@Req() r: GoogleRequest, @Query() query: Record<string, unknown>, @Res() response: Response) {
    const outcome = await this.google.callback(query, cookie(r, googleBindingCookie), r.ip || "unknown", r.correlationId);
    response.clearCookie(googleBindingCookie, { httpOnly: true, secure: this.config.mode === "production", sameSite: "lax", path: "/v1/auth/google" });
    if (outcome.session) response.cookie(sessionCookieName(this.config), outcome.session.token, this.options(outcome.session.expires));
    response.redirect(302, outcome.location);
  }
}
