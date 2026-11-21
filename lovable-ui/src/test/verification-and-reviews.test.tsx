import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type ConnectionDetail } from "@/lib/api";
import { reputationApi } from "@/lib/tutor-reputation-api";
import { VerificationFacts } from "@/components/verification-facts";
import { ConnectionDetails } from "@/components/connection-details";
import { PublicTutorReputation } from "@/components/public-tutor-reputation";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => {
    const href = to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? "");
    return <a href={href}>{children}</a>;
  },
}));

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

it.each([
  [true, true, ["Email verified", "Identity verified"]],
  [true, false, ["Email verified"]],
  [false, true, ["Identity verified"]],
])(
  "lists email (%s) and identity (%s) verification independently",
  (emailVerified, identityVerified, shown) => {
    render(<VerificationFacts emailVerified={emailVerified} identityVerified={identityVerified} />);
    const section = screen.getByRole("region", { name: "Verification" });
    const items = within(section).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual(shown);
    // Never a blanket claim about the profile, its subjects or experience.
    expect(section).not.toHaveTextContent(/profile verified|verified tutor|qualifications/i);
  },
);

it("shows nothing when the server reports no verification, or omits the facts", () => {
  const { container, rerender } = render(
    <VerificationFacts emailVerified={false} identityVerified={false} />,
  );
  expect(container).toBeEmptyDOMElement();
  rerender(<VerificationFacts />);
  expect(container).toBeEmptyDOMElement();
});

const detail = (changes: Partial<ConnectionDetail>): ConnectionDetail => ({
  id: "connection-one",
  request_id: "request-one",
  listing_id: "listing-one",
  offer: {
    title: "Physics with worked examples",
    description: "Fictional class",
    domain_id: "school",
    subject_id: "subject-physics",
    level_id: "level-class-10",
    language_ids: ["language-english"],
    teaching_mode: "ONLINE",
    rate_paise: 50000,
    rate_unit: "HOUR",
    currency: "INR",
    trial_kind: "NONE",
  },
  status: "ACTIVE",
  created_at: "2026-11-20T00:00:00Z",
  your_role: "TUTOR",
  learner_kind: "ADULT",
  learning_requirements: "Private learning goals",
  preferred_times: "Tuesday evenings",
  test_only: true,
  ...changes,
});
function showConnection(connection: ConnectionDetail) {
  vi.spyOn(api, "connection").mockResolvedValue({ ok: true, status: 200, data: { connection } });
  const contacts = vi.spyOn(api, "connectionContacts");
  render(<ConnectionDetails connectionId={connection.id} />);
  return contacts;
}

it("shows a Tutor only the adult Learner's email verification in an active Connection", async () => {
  const contacts = showConnection(
    detail({ peer_verification: { role: "ADULT_LEARNER", email_verified: true } }),
  );
  const section = await screen.findByRole("region", { name: "Verification" });
  expect(section).toHaveTextContent("Email verified");
  expect(section).not.toHaveTextContent("Identity verified");
  // The verification facts never reveal the address; that stays an explicit audited action.
  expect(contacts).not.toHaveBeenCalled();
  expect(screen.queryByText(/@/)).toBeNull();
});

it("shows a Learner the Tutor's email and identity verification with the same component", async () => {
  showConnection(
    detail({
      your_role: "PAYER",
      peer_verification: { role: "TUTOR", email_verified: true, identity_verified: true },
    }),
  );
  const section = await screen.findByRole("region", { name: "Verification" });
  expect(section).toHaveTextContent("Email verified");
  expect(section).toHaveTextContent("Identity verified");
});

it("keeps a Tutor's unverified identity off the Connection", async () => {
  showConnection(
    detail({
      your_role: "PAYER",
      peer_verification: { role: "TUTOR", email_verified: true, identity_verified: false },
    }),
  );
  const section = await screen.findByRole("region", { name: "Verification" });
  expect(section).not.toHaveTextContent("Identity verified");
});

it("shows no verification for a Guardian-represented Connection or a denied one", async () => {
  showConnection(detail({ learner_kind: "CHILD", peer_verification: null }));
  expect(await screen.findByRole("heading", { name: "Your conversation" })).toBeVisible();
  expect(screen.queryByRole("region", { name: /verification/i })).toBeNull();
  cleanup();
  vi.mocked(api.connection).mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 403, code: "CONTACT_BLOCKED", message: "Blocked." },
  });
  render(<ConnectionDetails connectionId="connection-one" />);
  expect(await screen.findByRole("heading", { name: "Conversation access" })).toBeVisible();
  expect(screen.queryByText("Email verified")).toBeNull();
});

it("names the public level and recommendations section Tutor reviews, keeping its anchor and link", async () => {
  vi.spyOn(reputationApi, "publicBadge").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      badge: "NEW",
      label: "New",
      recommendations: 1,
      meaning: "Eligible public profile",
      published_recommendations: [],
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <PublicTutorReputation profileId="profile-one" />
    </QueryClientProvider>,
  );
  const section = screen.getByRole("region", { name: "Tutor reviews" });
  expect(section).toHaveAttribute("id", "recommendations");
  expect(screen.queryByText("Tutor level & recommendations")).toBeNull();
  // Recommendations from people who know the Tutor stay distinct from Learner reviews.
  expect(section).toHaveTextContent(
    "Recommendations are endorsements from people who know the Tutor.",
  );
  expect(
    await within(section).findByText("1 recommendation from someone who knows this Tutor."),
  ).toBeVisible();
  expect(within(section).getByRole("link", { name: "Write a recommendation" })).toHaveAttribute(
    "href",
    "/recommendations/profile-one",
  );
});
