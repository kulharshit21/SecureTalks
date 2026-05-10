import { describe, expect, test } from "vitest";

import { conversationMemberCanSeeAttachmentRow } from "@/lib/attachments-access";

describe("attachments access helper", () => {
  test("non-member cannot see attachment metadata", () => {
    const ok = conversationMemberCanSeeAttachmentRow({
      attachmentMessageConversationId: "conv-a",
      activeMemberConversationIds: new Set(["conv-other"]),
    });
    expect(ok).toBe(false);
  });

  test("active member can see attachment metadata", () => {
    const ok = conversationMemberCanSeeAttachmentRow({
      attachmentMessageConversationId: "conv-a",
      activeMemberConversationIds: new Set(["conv-a", "conv-b"]),
    });
    expect(ok).toBe(true);
  });
});
