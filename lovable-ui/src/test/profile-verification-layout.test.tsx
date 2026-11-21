import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TutorProfileLayout } from "@/components/tutor-profile-layout";
import { VerificationFacts } from "@/components/verification-facts";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/account/ui", () => ({
  SiteHeader: () => <header />,
  SiteFooter: () => <footer />,
}));
afterEach(cleanup);

it("shows a Tutor's verification beside the photo, in the summary panel (owner, 21 Nov 2026)", () => {
  render(
    <TutorProfileLayout
      name="Fictional Tutor"
      title="Learn Physics with Fictional Tutor"
      subjects={["Physics"]}
      navigation={[{ id: "about", label: "About" }]}
      verification={<VerificationFacts compact emailVerified identityVerified={false} />}
      summary={<p>Hourly rate</p>}
    >
      <section id="about">About</section>
    </TutorProfileLayout>,
  );
  const panel = screen.getByRole("complementary", { name: "Fictional Tutor's Tutor summary" });
  const facts = within(panel).getByRole("region", { name: "Verification" });
  expect(within(facts).getByText("Email verified")).toBeVisible();
  expect(within(facts).queryByText("Identity verified")).toBeNull();
});
