import {
  ChannelReply,
  ComposerContextId,
  type MessageId,
  type RunId,
  type OrchestrationMessageContext,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";

export const CHANNEL_REPLY_KIND = "elysia-channel-reply";
const decodeReply = Schema.decodeUnknownOption(ChannelReply);
export function readChannelReply(
  context: OrchestrationMessageContext | undefined,
): ChannelReply | null {
  const record = context?.records.find((record) => record.kind === CHANNEL_REPLY_KIND);
  const decoded = decodeReply(record && "payload" in record ? record.payload : undefined);
  return Option.getOrNull(decoded);
}
export function withChannelReply(
  context: OrchestrationMessageContext | undefined,
  reply: ChannelReply,
): OrchestrationMessageContext {
  return {
    version: 1,
    records: [
      ...(context?.records.filter((record) => record.kind !== CHANNEL_REPLY_KIND) ?? []),
      {
        version: 1,
        kind: CHANNEL_REPLY_KIND,
        contextId: ComposerContextId.make("channel_reply"),
        label: "Replying to message",
        payload: reply,
      },
    ],
  };
}
export interface ChannelMessageReference {
  readonly id: MessageId;
  readonly role: string;
  readonly runId: RunId | null;
  readonly context?: OrchestrationMessageContext | undefined;
}
export interface ChannelRunReference {
  readonly id: RunId;
  readonly userMessageId: MessageId;
}
/** Replies to a child (including an agent response) retain the original root. */
export function channelReplyTarget(
  message: ChannelMessageReference,
  messages: ReadonlyArray<ChannelMessageReference>,
  runs: ReadonlyArray<ChannelRunReference>,
): ChannelReply {
  const requestId =
    message.role === "assistant"
      ? runs.find((run) => run.id === message.runId)?.userMessageId
      : undefined;
  const request = requestId ? messages.find((candidate) => candidate.id === requestId) : undefined;
  const rootMessageId =
    readChannelReply(message.context)?.rootMessageId ??
    readChannelReply(request?.context)?.rootMessageId ??
    message.id;
  return { replyToMessageId: message.id, rootMessageId };
}
