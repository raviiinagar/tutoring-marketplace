import { createFileRoute } from "@tanstack/react-router";
import { ChatRoom } from "@/components/chat-room";
export const Route = createFileRoute("/chat/$connectionId")({
  ssr: false,
  component: Chat,
  head: () => ({
    meta: [
      { title: "Private chat — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});
function Chat() {
  const { connectionId } = Route.useParams();
  return <ChatRoom key={connectionId} connectionId={connectionId} />;
}
