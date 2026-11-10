import type { CommunityMessage } from "@/lib/api";

// Changes arrive newest-change-last. Replace messages already shown; append new ones in posting order;
// ignore changes to older messages that aren't loaded yet.
export function mergeCommunityMessages(current: CommunityMessage[], incoming: CommunityMessage[]) {
  const next = [...current];
  for (const message of incoming) {
    const index = next.findIndex((item) => item.id === message.id);
    if (index >= 0) next[index] = message;
    else if (!next.length || message.created_at >= next[0]!.created_at) next.push(message);
  }
  // A deleted or removed message must not stay quoted in the replies already on screen.
  const gone = new Set(
    incoming.filter((message) => message.status !== "VISIBLE").map((message) => message.id),
  );
  return gone.size
    ? next.map((item) =>
        item.reply_to && gone.has(item.reply_to.id) && item.reply_to.excerpt !== null
          ? { ...item, reply_to: { ...item.reply_to, excerpt: null } }
          : item,
      )
    : next;
}
