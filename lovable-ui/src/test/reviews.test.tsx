import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReviewForm, PublicReviews } from "@/components/reviews";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires an explicit interaction attestation and rating before sending feedback for moderation", async () => {
  let writes = 0;
  let sent: Record<string, unknown> | undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (init?.method === "POST") {
      writes++;
      sent = JSON.parse(String(init.body));
      return Response.json({ review: { status: "PENDING" } });
    }
    return Response.json({
      eligible: true,
      eligible_at: "2026-10-17T00:00:00Z",
      review: null,
      policy_version: "review-v1",
      policy: "The same policy applies to positive and negative feedback.",
    });
  });
  render(<ReviewForm connectionId="connection" />);
  const submit = await screen.findByRole("button", { name: "Submit review for moderation" });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  expect(writes).toBe(0);
  fireEvent.change(screen.getByLabelText("Your rating"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Your feedback"), {
    target: { value: "The explanations were rushed and several questions were left unanswered." },
  });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("I had an actual interaction with this Tutor."));
  fireEvent.click(submit);
  await waitFor(() => expect(writes).toBe(1));
  expect(sent?.["rating"]).toBe(1);
  expect(sent?.["interaction_attested"]).toBe(true);
});
it("shows honest zero-review state without inventing stars or verified attendance", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      reviews: [],
      summary: { count: 0, average: null },
      next_cursor: null,
      disclaimer: "Lesson attendance is not independently verified.",
    }),
  );
  render(<PublicReviews listingId="listing" />);
  expect(await screen.findByText("No published reviews yet.")).toBeTruthy();
  expect(screen.queryByText(/5.0/)).toBeNull();
  expect(screen.getByText("Lesson attendance is not independently verified.")).toBeTruthy();
});
