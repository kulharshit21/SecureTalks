/**
 * Mirrors attachment SELECT RLS: visible only if the message sits in a conversation
 * the caller is an active member of. Used in tests (policy logic summary).
 */
export function conversationMemberCanSeeAttachmentRow(params: {
  attachmentMessageConversationId: string;
  activeMemberConversationIds: ReadonlySet<string>;
}): boolean {
  return params.activeMemberConversationIds.has(params.attachmentMessageConversationId);
}
