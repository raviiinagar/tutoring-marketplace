import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/connections_/$connectionId")({
  ssr: false,
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/connections",
      search: {
        conversation: params.connectionId,
        view: location.hash === "classes" ? "classes" : "details",
      },
      replace: true,
    });
  },
});
