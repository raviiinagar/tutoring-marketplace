import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { inboxSearch } from "@/routes/connections";

it.each([
  ["/chat/00000000-0000-4000-8000-000000000001", undefined],
  ["/connections/00000000-0000-4000-8000-000000000001", "details"],
  ["/connections/00000000-0000-4000-8000-000000000001#classes", "classes"],
])("keeps legacy deep link %s by redirecting into the selected inbox", async (url, view) => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient: new QueryClient() },
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/connections");
  expect(router.state.location.search).toEqual({
    conversation: "00000000-0000-4000-8000-000000000001",
    ...(view ? { view } : {}),
  });
});
it("validates optional inbox selection without accepting arbitrary view or non-string IDs", () => {
  expect(inboxSearch({ conversation: "one", view: "classes" })).toEqual({
    conversation: "one",
    view: "classes",
  });
  expect(inboxSearch({ conversation: ["one"], view: "contacts" })).toEqual({
    conversation: undefined,
    view: undefined,
  });
});
