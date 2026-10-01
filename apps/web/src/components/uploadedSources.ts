import type { ChatAttachment, ChatMessage } from "~/types";

/** Latest uploads first, preserving attachment order within a message. */
export function uploadedSources(
  messages: ReadonlyArray<Pick<ChatMessage, "role" | "attachments">>,
): ChatAttachment[] {
  const sources = new Map<string, ChatAttachment>();
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role !== "user") continue;
    for (const attachment of message.attachments ?? []) {
      if (!sources.has(attachment.id)) sources.set(attachment.id, attachment);
    }
  }
  return [...sources.values()];
}
