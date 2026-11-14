import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { AssistedOnboardingService, assistAction, assistQueueQuery, assistRequestInput } from "./tutor-onboarding-assist.js";
import { TutorsService, tutorIntroInput } from "./tutors.js";
import { TutorPresenceService, presenceInput } from "./tutor-presence.js";
import { TutorPhotosService, photoInput } from "./tutor-photos.js";
import { ListingsService, offerInput, editOfferInput, versionInput } from "./listings.js";
import { sessionCookieName, type Config } from "./config.js";
import { staffCookieName } from "./staff.js";
import { ApiProblem } from "./errors.js";

type AssistRequest = Request & { correlationId: string };
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiProblem(
      400,
      "VALIDATION_ERROR",
      result.error.issues[0]?.message || "Check the highlighted fields.",
      z.flattenError(result.error).fieldErrors as Record<string, string[]>,
    );
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
const publicationInput = z.strictObject({
  expected_public_revision: z.number().int().positive(),
  action: z.enum(["PUBLISH", "PAUSE"]),
});
const listingAction = z.enum(["PUBLISH", "PAUSE", "RESUME", "ARCHIVE"]);

/**
 * ADR0018 assisted Tutor onboarding. The Tutor asks for help under /v1/me; Support staff
 * work the queue and act for the Tutor under /v1/staff/tutor-onboarding/:id/as-tutor/...,
 * which mirrors the Tutor's own /v1/me/... routes and reuses the same services.
 */
@Controller("v1")
export class AssistedOnboardingController {
  constructor(
    @Inject(AssistedOnboardingService) private readonly assist: AssistedOnboardingService,
    @Inject(TutorsService) private readonly tutors: TutorsService,
    @Inject(TutorPresenceService) private readonly presence: TutorPresenceService,
    @Inject(TutorPhotosService) private readonly photos: TutorPhotosService,
    @Inject(ListingsService) private readonly listings: ListingsService,
    @Inject("AUTH_CONFIG") private readonly config: Config,
  ) {}
  private account(r: Request) {
    return cookie(r, sessionCookieName(this.config));
  }
  private staff(r: Request) {
    return cookie(r, staffCookieName(this.config));
  }
  private as(r: AssistRequest, id: string, action: string) {
    return this.assist.delegate(this.account(r), this.staff(r), parse(z.uuid(), id), action, r.correlationId);
  }

  // The Tutor's side.
  @Get("me/tutor/onboarding-help") own(@Req() r: AssistRequest) {
    return this.assist.own(this.account(r));
  }
  @Post("me/tutor/onboarding-help") @HttpCode(201) create(@Req() r: AssistRequest, @Body() body: unknown) {
    return this.assist.create(this.account(r), parse(assistRequestInput, body), r.correlationId);
  }
  @Delete("me/tutor/onboarding-help") cancel(@Req() r: AssistRequest, @Body() body: unknown) {
    parse(empty, body);
    return this.assist.cancel(this.account(r), r.correlationId);
  }

  // The staff queue.
  @Get("staff/tutor-onboarding") queue(@Req() r: AssistRequest, @Query() q: unknown) {
    return this.assist.queue(this.account(r), this.staff(r), parse(assistQueueQuery, q), r.correlationId);
  }
  @Post("staff/tutor-onboarding/:id/actions") @HttpCode(200) action(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.assist.action(this.account(r), this.staff(r), parse(z.uuid(), id), parse(assistAction, body), r.correlationId);
  }

  // Staff acting for the Tutor: the same services and rules as the Tutor's own routes.
  @Get("staff/tutor-onboarding/:id/as-tutor/tutor") tutor(@Req() r: AssistRequest, @Param("id") id: string) {
    return this.tutors.own(this.as(r, id, "VIEW_PROFILE"));
  }
  @Post("staff/tutor-onboarding/:id/as-tutor/tutor/introduction") @HttpCode(200) introduction(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.tutors.saveIntroduction(this.as(r, id, "SAVE_INTRODUCTION"), parse(tutorIntroInput, body), r.correlationId);
  }
  @Post("staff/tutor-onboarding/:id/as-tutor/tutor/publication") @HttpCode(200) publication(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parse(publicationInput, body);
    return this.tutors.publication(this.as(r, id, "PROFILE_" + input.action), input, r.correlationId);
  }
  @Get("staff/tutor-onboarding/:id/as-tutor/tutor/presence") ownPresence(@Req() r: AssistRequest, @Param("id") id: string) {
    return this.presence.own(this.as(r, id, "VIEW_PRESENCE"));
  }
  @Post("staff/tutor-onboarding/:id/as-tutor/tutor/presence") @HttpCode(200) savePresence(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const v = presenceInput.safeParse(body);
    if (!v.success) throw new ApiProblem(400, "INVALID_PRESENCE", v.error.issues[0]?.message || "Check the location and weekly hours.");
    return this.presence.save(this.as(r, id, "SAVE_PRESENCE"), v.data, r.correlationId);
  }
  @Get("staff/tutor-onboarding/:id/as-tutor/tutor/photo") photo(@Req() r: AssistRequest, @Param("id") id: string) {
    return this.photos.own(this.as(r, id, "VIEW_PHOTO"));
  }
  @Post("staff/tutor-onboarding/:id/as-tutor/tutor/photo") @HttpCode(201) upload(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.photos.upload(this.as(r, id, "UPLOAD_PHOTO"), parse(photoInput, body), r.correlationId);
  }
  @Get("staff/tutor-onboarding/:id/as-tutor/tutor/photo/:photoId") async preview(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Res() response: Response,
  ) {
    const bytes = await this.photos.preview(this.as(r, id, "VIEW_PHOTO"), parse(z.uuid(), photoId));
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Disposition", 'inline; filename="tutor-photo.jpg"');
    response.setHeader("Cache-Control", "no-store");
    response.send(bytes);
  }
  @Delete("staff/tutor-onboarding/:id/as-tutor/tutor/photo/:photoId") @HttpCode(204) removePhoto(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Body() body: unknown,
  ) {
    parse(empty, body);
    return this.photos.remove(this.as(r, id, "REMOVE_PHOTO"), parse(z.uuid(), photoId), r.correlationId);
  }
  @Get("staff/tutor-onboarding/:id/as-tutor/listings") ownListings(@Req() r: AssistRequest, @Param("id") id: string) {
    return this.listings.own(this.as(r, id, "VIEW_ADS"));
  }
  @Post("staff/tutor-onboarding/:id/as-tutor/listings") @HttpCode(201) createListing(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.listings.create(this.as(r, id, "CREATE_AD"), parse(offerInput, body), r.correlationId);
  }
  @Post("staff/tutor-onboarding/:id/as-tutor/listings/:listingId") @HttpCode(200) editListing(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Param("listingId") listingId: string,
    @Body() body: unknown,
  ) {
    return this.listings.edit(this.as(r, id, "EDIT_AD"), parse(z.uuid(), listingId), parse(editOfferInput, body), r.correlationId);
  }
  @Post("staff/tutor-onboarding/:id/as-tutor/listings/:listingId/actions/:action") @HttpCode(200) listingAction(
    @Req() r: AssistRequest,
    @Param("id") id: string,
    @Param("listingId") listingId: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ) {
    const operation = parse(listingAction, action);
    return this.listings.ownerAction(
      this.as(r, id, "AD_" + operation),
      parse(z.uuid(), listingId),
      operation,
      parse(versionInput, body).revision,
      r.correlationId,
    );
  }
}
