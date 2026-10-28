import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PublicTraffic } from "@/components/public-traffic";
const route = vi.hoisted(() => ({
  state: { location: { pathname: "/" } },
  subscribe: vi.fn(() => () => {}),
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => route }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  Object.defineProperty(navigator, "doNotTrack", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "globalPrivacyControl", {
    value: undefined,
    configurable: true,
  });
});
it("respects browser DNT and Global Privacy Control without sending an observation", () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
  const first = render(<PublicTraffic />);
  expect(fetch).not.toHaveBeenCalled();
  first.unmount();
  Object.defineProperty(navigator, "doNotTrack", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true });
  render(<PublicTraffic />);
  expect(fetch).not.toHaveBeenCalled();
});
it("sends no credentials or private URL payload with a public observation", () => {
  route.state.location.pathname = "/";
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  render(<PublicTraffic />);
  expect(fetch).toHaveBeenCalledTimes(1);
  const init = fetch.mock.calls[0]![1]!;
  expect(init.credentials).toBe("omit");
  expect(Object.keys(JSON.parse(String(init.body))).sort()).toEqual([
    "event_id",
    "page",
    "session_id",
  ]);
});
