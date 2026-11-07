import { createFileRoute, redirect } from "@tanstack/react-router";

// Notification/email URLs remain valid; there is only one messaging UI.
export const Route = createFileRoute("/chat/$connectionId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/connections",
      search: { conversation: params.connectionId },
      replace: true,
    });
  },
});
