import { expect, it } from "vite-plus/test";
import { MessageId, RunId } from "@elysiatools/contracts";
import { withChannelReply } from "@elysiatools/shared/channelReplies";
import type { ChatMessage } from "~/types";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";
import { groupChannelTimeline } from "./channelTimeline";
const row = (
  id: string,
  role: "user" | "assistant",
  run: string,
  root?: string,
): Extract<MessagesTimelineRow, { kind: "message" }> => ({
  kind: "message",
  id,
  createdAt: "2026-10-04T00:00:00Z",
  durationStart: "2026-10-04T00:00:00Z",
  showAssistantMeta: false,
  showAssistantCopyButton: false,
  assistantCopyStreaming: false,
  message: {
    id: MessageId.make(id),
    role,
    runId: RunId.make(run),
    text: id,
    streaming: false,
    ...(root
      ? {
          context: withChannelReply(undefined, {
            replyToMessageId: MessageId.make(root),
            rootMessageId: MessageId.make(root),
          }),
        }
      : {}),
  } as ChatMessage,
});
it("keeps ordinary messages visible and folds only explicit replies into one level", () => {
  const parent = row("parent", "user", "first");
  const answer = row("answer", "assistant", "first");
  const other = row("other", "user", "other");
  const child = row("child", "user", "second", "parent");
  const response = row("response", "assistant", "second");
  const runs = [
    { id: parent.message.runId!, userMessageId: parent.message.id },
    { id: child.message.runId!, userMessageId: child.message.id },
    { id: other.message.runId!, userMessageId: other.message.id },
  ];
  const result = groupChannelTimeline([parent, answer, other, child, response], runs);
  expect(result.rows.map((item) => item.id)).toEqual(["parent", "answer", "other"]);
  expect(result.replies.get(parent.message.id)?.map((item) => item.id)).toEqual([
    "child",
    "response",
  ]);
  expect(groupChannelTimeline([child, response], runs).rows.map((item) => item.id)).toEqual([
    "child",
    "response",
  ]);
});

it("keeps an agent response as the parent when it is replied to", () => {
  const prompt = row("prompt", "user", "first");
  const answer = row("answer", "assistant", "first");
  const reply = row("reply", "user", "second", "answer");
  const result = groupChannelTimeline(
    [prompt, answer, reply, row("followup", "assistant", "second")],
    [
      { id: RunId.make("first"), userMessageId: prompt.message.id },
      { id: RunId.make("second"), userMessageId: reply.message.id },
    ],
  );
  expect(result.rows.map((item) => item.id)).toEqual(["prompt", "answer"]);
  expect(result.replies.get(answer.message.id)?.map((item) => item.id)).toEqual([
    "reply",
    "followup",
  ]);
});
