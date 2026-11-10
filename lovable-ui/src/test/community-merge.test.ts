import { expect, it } from "vitest";
import type { CommunityMessage } from "@/lib/api";
import { mergeCommunityMessages } from "@/lib/community-merge";

const message = (
  id: string,
  minute: number,
  extra: Partial<CommunityMessage> = {},
): CommunityMessage => ({
  id,
  channel_id: "channel",
  author: { nickname: "Member", team: false, own: false },
  body: "Message " + id,
  status: "VISIBLE",
  pinned: false,
  reply_to: null,
  reactions: [],
  change_seq: minute,
  created_at: new Date(Date.UTC(2026, 10, 10, 10, minute)).toISOString(),
  ...extra,
});

it("replaces shown messages, appends new ones and ignores changes to unloaded older messages", () => {
  const shown = [message("b", 5), message("c", 6)];
  const merged = mergeCommunityMessages(shown, [
    message("a", 1, { body: "older, not loaded" }),
    message("b", 5, { reactions: [{ emoji: "HEART", count: 1, mine: false }] }),
    message("d", 7),
  ]);
  expect(merged.map((m) => m.id)).toEqual(["b", "c", "d"]);
  expect(merged[0]!.reactions).toHaveLength(1);
});

it("drops the quote from replies when the original is deleted or removed", () => {
  const shown = [
    message("a", 1),
    message("b", 2, { reply_to: { id: "a", nickname: "Member", excerpt: "Message a" } }),
  ];
  const merged = mergeCommunityMessages(shown, [
    message("a", 1, { status: "REMOVED_BY_STAFF", body: null }),
  ]);
  expect(merged[0]!.body).toBeNull();
  expect(merged[1]!.reply_to).toEqual({ id: "a", nickname: "Member", excerpt: null });
});
