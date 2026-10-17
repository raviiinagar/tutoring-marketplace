import { Controller, Get, Inject, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { PublicPages } from "./public-pages.js";
@Controller("v1/public")
export class PublicPagesController {
  constructor(@Inject(PublicPages) private readonly pages: PublicPages) {}
  @Get("home") home() {
    return this.pages.index();
  }
  @Get("teachers/:slug") teacher(@Param("slug") slug: string) {
    return this.pages.teacher(slug);
  }
  @Get("categories/:domain/:subject") category(
    @Param("domain") domain: string,
    @Param("subject") subject: string,
  ) {
    return this.pages.category(domain, subject);
  }
  @Get("sitemap") async sitemap(@Res() response: Response) {
    response.type("application/xml").send(await this.pages.sitemap());
  }
  @Get("robots") robots(@Res() response: Response) {
    response.type("text/plain").send(this.pages.robots());
  }
}
