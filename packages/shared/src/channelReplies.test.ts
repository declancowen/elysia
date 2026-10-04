import { describe, expect, it } from "vite-plus/test";
import { MessageId, RunId } from "@t3tools/contracts";
import { channelReplyTarget, readChannelReply, withChannelReply } from "./channelReplies.js";
const parent = { id: MessageId.make("parent"), role: "user", runId: RunId.make("first") };
const child = {
  id: MessageId.make("child"),
  role: "user",
  runId: RunId.make("second"),
  context: withChannelReply(undefined, { replyToMessageId: parent.id, rootMessageId: parent.id }),
};
const answer = { id: MessageId.make("answer"), role: "assistant", runId: child.runId };
const runs = [
  { id: parent.runId, userMessageId: parent.id },
  { id: child.runId, userMessageId: child.id },
];
describe("channel replies", () => {
  it("keeps replies to children and their agent responses under one root", () => {
    for (const message of [parent, child, answer])
      expect(channelReplyTarget(message, [parent, child, answer], runs)).toEqual({
        replyToMessageId: message.id,
        rootMessageId: parent.id,
      });
  });
  it("replaces a reference without losing unrelated context and ignores malformed payloads", () => {
    const old = withChannelReply(undefined, {
      replyToMessageId: parent.id,
      rootMessageId: parent.id,
    });
    const updated = withChannelReply(old, { replyToMessageId: child.id, rootMessageId: parent.id });
    expect(updated.records).toHaveLength(1);
    expect(readChannelReply(updated)?.replyToMessageId).toBe(child.id);
    expect(
      readChannelReply({
        ...old,
        records: [{ ...old.records[0]!, payload: { rootMessageId: parent.id } }],
      }),
    ).toBeNull();
    expect(readChannelReply(undefined)).toBeNull();
  });
});
