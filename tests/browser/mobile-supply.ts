import { expect, request, type APIRequestContext } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { totp } from "../../apps/api/src/totp";

const execute = promisify(execFile);
/** Real reviewed public supply, created outside the measured interval through public APIs. */
export async function mobileSupply(origin: string) {
  const url = new URL(origin);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Mobile fixtures require isolated loopback browser stack");
  const contexts: APIRequestContext[] = [];
  const password = "Fictional-mobile-performance-321!";
  const post = async (
    client: APIRequestContext,
    path: string,
    body: unknown,
    status = 200,
  ) => {
    const response = await client.post(path, { data: body });
    expect(response.status(), path).toBe(status);
    return response.json();
  };
  const actor = async () => {
    const client = await request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { Origin: origin },
    });
    contexts.push(client);
    const email = `mobile-${randomUUID()}@example.test`;
    await post(
      client,
      "/v1/auth/registrations",
      { display_name: "Fictional mobile adult", email, password },
      202,
    );
    let link = "";
    await expect
      .poll(async () => {
        const inbox = await (await client.get("/dev/mail")).json();
        link =
          inbox.messages.find((m: { to: string }) => m.to === email)
            ?.verification_url || "";
        return !!link;
      })
      .toBe(true);
    await post(client, "/v1/auth/verifications", {
      token: new URL(link).hash.slice(7),
    });
    await post(client, "/v1/auth/sessions", { email, password });
    return { client, email };
  };
  try {
    const reviewer = await actor();
    await execute(
      process.execPath,
      [
        "--env-file=.local/browser-tests.env",
        "node_modules/tsx/dist/cli.mjs",
        "--tsconfig",
        "apps/api/tsconfig.json",
        "apps/api/src/staff-operator.ts",
        "grant",
        "--email",
        reviewer.email,
        "--environment",
        "development",
        "--scopes",
        "TRUST",
        "--reason",
        "Fictional mobile performance fixture",
      ],
      { timeout: 30000 },
    );
    const enrollment = await post(
      reviewer.client,
      "/v1/staff/mfa/enrollments",
      { password },
    );
    await post(reviewer.client, "/v1/staff/mfa/confirmations", {
      code: totp(enrollment.secret, new Date()),
    });
    const ids: string[] = [];
    for (let n = 0; n < 2; n++) {
      const teacher = await actor();
      await post(teacher.client, "/v1/me/roles", { roles: ["TUTOR"] });
      await post(teacher.client, "/v1/me/tutor", {
        display_name: "Fictional mobile Tutor " + n,
        biography:
          "Patient Physics explanations with structured worked examples for school learners.",
        birth_date: "1990-01-01",
        adult_confirmed: true,
      });
      for (const kind of ["IDENTITY", "QUALIFICATION"]) {
        const file = await post(
          teacher.client,
          "/v1/me/tutor/evidence",
          {
            media_type: "application/pdf",
            data: Buffer.from(
              "%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n",
            ).toString("base64"),
          },
          201,
        );
        await post(
          teacher.client,
          "/v1/me/tutor/claims",
          {
            kind,
            description: "Fictional mobile performance evidence " + kind,
            evidence_id: file.evidence.id,
            ...(kind === "QUALIFICATION"
              ? { subject_id: "subject-physics" }
              : {}),
          },
          201,
        );
      }
      await post(teacher.client, "/v1/me/tutor/submissions", {});
      const tutor = await (await teacher.client.get("/v1/me/tutor")).json();
      for (const claim of tutor.claims)
        await post(
          reviewer.client,
          "/v1/staff/tutor-claims/" + claim.id + "/reviews",
          {
            outcome: "APPROVE",
            checked_item: "Fictional mobile identity and Subject checked",
            reason: "Isolated mobile performance verification only",
            adult_identity_confirmed: true,
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          },
        );
      // Deterministic textured fictional image, not a real adult or identity document.
      const pixels = Buffer.alloc(320 * 400 * 3);
      let seed = n + 1;
      for (let i = 0; i < pixels.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        pixels[i] = seed >>> 24;
      }
      const photo = await sharp(pixels, {
        raw: { width: 320, height: 400, channels: 3 },
      })
        .withMetadata({
          exif: { IFD0: { ImageDescription: "FICTIONAL-TUTOR-EVIDENCE" } },
        })
        .jpeg({ quality: 80 })
        .toBuffer();
      const uploaded = await post(
        teacher.client,
        "/v1/me/tutor/photo",
        {
          media_type: "image/jpeg",
          data: photo.toString("base64"),
          public_consent: true,
        },
        201,
      );
      await post(
        reviewer.client,
        "/v1/staff/tutor-photos/" + uploaded.photo.id + "/reviews",
        {
          outcome: "APPROVE",
          reason: "Fictional image for isolated mobile performance only",
        },
      );
      for (const level of [
        "level-class-9",
        "level-class-10",
        "level-class-11",
      ]) {
        let listing = (
          await post(
            teacher.client,
            "/v1/me/listings",
            {
              title: "Fictional Physics practice " + level + " " + n,
              description:
                "Clear school Physics explanations with structured practice and worked examples.",
              domain_id: "school",
              subject_id: "subject-physics",
              level_id: level,
              curriculum_id: "curriculum-cbse",
              language_ids: ["language-english"],
              currency: "INR",
              teaching_mode: "ONLINE",
              rate_paise: 50000,
              rate_unit: "HOUR",
              trial_kind: "NONE",
            },
            201,
          )
        ).listing;
        listing = (
          await post(
            teacher.client,
            "/v1/me/listings/" + listing.id + "/actions/SUBMIT",
            { revision: listing.revision },
          )
        ).listing;
        listing = (
          await post(
            reviewer.client,
            "/v1/staff/listings/" + listing.id + "/reviews",
            {
              revision: listing.revision,
              outcome: "APPROVE",
              reason: "Exact fictional mobile Physics offer checked",
            },
          )
        ).listing;
        ids.push(listing.id);
      }
    }
    const publicResult = await (
      await reviewer.client.get("/v1/discovery?subject_id=subject-physics")
    ).json();
    expect(
      publicResult.offers.filter(
        (o: { id: string; tutor: { photo_url?: string } }) =>
          ids.includes(o.id) && !!o.tutor.photo_url,
      ),
    ).toHaveLength(6);
  } finally {
    await Promise.all(contexts.map((c) => c.dispose()));
  }
}
