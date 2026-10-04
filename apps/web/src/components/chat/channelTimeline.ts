import { readChannelReply, type ChannelRunReference } from "@t3tools/shared/channelReplies";
import type { MessageId } from "@t3tools/contracts";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";

/** Flatten every reply under its root while keeping work and metadata with that reply. */
export function groupChannelTimeline(
  rows: MessagesTimelineRow[],
  runs: ReadonlyArray<ChannelRunReference>,
) {
  const messages = rows.flatMap((row) => (row.kind === "message" ? [row.message] : []));
  const rootIds = new Set(messages.map((message) => message.id));
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const rootsByRun = new Map(
    runs.map((run) => [
      run.id,
      readChannelReply(messagesById.get(run.userMessageId)?.context)?.rootMessageId ??
        run.userMessageId,
    ]),
  );
  const replies = new Map<MessageId, MessagesTimelineRow[]>();
  const top: MessagesTimelineRow[] = [];
  for (const row of rows) {
    const message = row.kind === "message" || row.kind === "assistant-meta" ? row.message : null;
    const runId =
      message?.runId ??
      ("runId" in row
        ? row.runId
        : row.kind === "event"
          ? row.projectedItem.item.runId
          : row.kind === "work" || row.kind === "work-live"
            ? row.groupedEntries[0]?.runId
            : row.kind === "proposed-plan"
              ? row.proposedPlan.runId
              : null);
    const root = message
      ? (readChannelReply(message.context)?.rootMessageId ??
        (message.role === "assistant" && message.runId
          ? rootsByRun.get(message.runId)
          : undefined) ??
        message.id)
      : runId
        ? rootsByRun.get(runId)
        : undefined;
    if (root && rootIds.has(root) && (row.kind !== "message" || row.message.id !== root)) {
      const children = replies.get(root) ?? [];
      children.push(row);
      replies.set(root, children);
    } else top.push(row);
  }
  return { rows: top, replies };
}
