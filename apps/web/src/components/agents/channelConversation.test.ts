import {
  ComposerContextId,
  OrchestrationV2TurnItem,
  ThreadId,
  type OrchestrationV2ProjectedTurnItem,
} from "@elysiatools/contracts";
import {
  agentTaskHandoff,
  channelConversationItems,
  channelWorkStartedAt,
  delegatedAgentsFromTurnItems,
} from "@elysiatools/shared/agentMentions";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import { expect, it } from "vite-plus/test";
import { deriveTimelineEntriesFromVisibleTurnItems } from "../../session-logic";
import { deriveMessagesTimelineRows } from "../chat/MessagesTimeline.logic";

const at = "2026-10-03T00:00:00.000Z";
const decode = Schema.decodeUnknownSync(OrchestrationV2TurnItem);
const base = {
  threadId: "channel-chat",
  runId: null,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 0,
  status: "completed",
  title: null,
  startedAt: DateTime.makeUnsafe(at),
  completedAt: DateTime.makeUnsafe(at),
  updatedAt: DateTime.makeUnsafe(at),
};
const request = decode({
  ...base,
  id: "ask",
  type: "user_message",
  messageId: "ask",
  text: "Please check this",
  attachments: [],
  inputIntent: "turn_start",
  createdBy: "user",
  creationSource: "web",
  senderThreadId: "project-chat",
  context: {
    version: 1,
    records: [
      {
        version: 1,
        kind: "elysia-agent-delegation-source",
        contextId: ComposerContextId.make(`handoff_source_${"a".repeat(64)}`),
        label: "Original request",
        payload: {
          handoff: {
            sourceThreadId: "project-chat",
            sourceThreadTitle: "Project",
            ask: "Please check this",
          },
        },
      },
    ],
  },
});
const ack = decode({
  ...base,
  id: "ack",
  type: "system_notice",
  message: "I got it",
  agentDelegation: {
    agentProjectId: "member",
    agentThreadId: "member-chat",
    agentName: "Friday",
    sourceMessageId: "ask",
    targetMessageId: "member-ask",
    targetTurnId: null,
  },
});
const reply = decode({
  ...base,
  id: "reply",
  type: "assistant_message",
  messageId: "reply",
  text: "Checked",
  attachments: [],
  streaming: false,
  senderThreadId: "member-chat",
});
const warning = decode({
  ...base,
  id: "warning",
  type: "system_notice",
  message: "A real warning",
});
const items: OrchestrationV2ProjectedTurnItem[] = [request, ack, reply, warning].map(
  (item, displayOrder) => ({
    sourceThreadId: ThreadId.make("channel-chat"),
    sourceItemId: item.id,
    position: displayOrder,
    visibility: "local",
    item,
  }),
);
const entries = (channel: boolean) =>
  deriveTimelineEntriesFromVisibleTurnItems({
    visibleTurnItems: channelConversationItems(items, channel),
    optimisticMessages: [],
    attachmentUrlById: new Map(),
  });

it("renders a channel as ordinary user/member messages while retaining real warnings and canonical provenance", () => {
  const channel = entries(true);
  expect(channel.filter((entry) => entry.kind === "work").map((entry) => entry.id)).toEqual([
    "warning",
  ]);
  const messages = channel.flatMap((entry) => (entry.kind === "message" ? [entry.message] : []));
  expect(messages.map((message) => [message.role, message.text])).toEqual([
    ["user", "Please check this"],
    ["assistant", "Checked"],
  ]);
  expect(agentTaskHandoff(messages[0]!)).toBeNull();
  expect(messages[1]!.senderThreadId).toBe("member-chat");
  expect(request.type === "user_message" && request.context?.records).toHaveLength(1);
  const project = entries(false);
  expect(project.some((entry) => entry.kind === "work" && entry.entry.agentDelegation)).toBe(true);
  const projectMessage = project.flatMap((entry) =>
    entry.kind === "message" ? [entry.message] : [],
  )[0]!;
  expect(agentTaskHandoff(projectMessage)?.sourceThreadId).toBe("project-chat");
  expect(channelConversationItems(items, false)).toBe(items);
});

it("shows the normal runless working row until the canonical member job settles, without an ack card", () => {
  const job = delegatedAgentsFromTurnItems([ack])[0]!;
  const started = channelWorkStartedAt(items, [{ job, working: true }]);
  expect(started).toBe(at);
  const visible = entries(true);
  const derive = (working: boolean) =>
    deriveMessagesTimelineRows({
      timelineEntries: visible,
      isWorking: working,
      runlessWorkActive: working,
      activeTurnStartedAt: working ? started : null,
      runningRunId: null,
      turnDiffSummaries: [],
      supportsConversationRollback: false,
    });
  expect(derive(true).some((row) => row.kind === "working")).toBe(true);
  expect(derive(false).some((row) => row.kind === "working")).toBe(false);
  expect(channelWorkStartedAt(items, [{ job, working: false }])).toBeNull();
});

it("normalizes a legacy native handoff into the ask without changing canonical history", () => {
  const raw = `[Elysia handoff sha256:${"a".repeat(64)}]\n\nOrigin chat: project-chat\n\nRecent excerpt: native context\n\nCurrent request:\n\nCheck the release`;
  const legacy = decode({
    ...base,
    id: "legacy",
    type: "user_message",
    messageId: "legacy",
    text: raw,
    attachments: [],
    inputIntent: "turn_start",
    createdBy: "user",
    creationSource: "web",
  });
  const original = { ...items[0]!, item: legacy };
  const normalized = channelConversationItems([original], true)[0]!.item;
  expect(normalized.type === "user_message" && normalized.text).toBe("Check the release");
  expect(normalized.type === "user_message" && agentTaskHandoff(normalized)).toBeNull();
  expect(legacy.type === "user_message" && legacy.text).toBe(raw);
  expect(channelConversationItems([original], false)[0]).toBe(original);
});

it.each(["error", "unavailable", "interrupted"] as const)(
  "reports %s as a normal channel notice instead of silently losing a member request",
  (status) => {
    const job = delegatedAgentsFromTurnItems([ack])[0]!;
    const projected = channelConversationItems(items, true, [
      { job, working: false, data: { status } },
    ]);
    const notice = projected.find(({ item }) => item.id === ack.id)?.item;
    expect(notice?.type).toBe("system_notice");
    expect(notice?.type === "system_notice" && notice.agentDelegation).toBeUndefined();
    expect(notice?.type === "system_notice" && notice.message).toContain("Friday");
    expect(channelWorkStartedAt(items, [{ job, working: false }])).toBeNull();
    expect(
      channelConversationItems(items, false, [{ job, working: false, data: { status } }]),
    ).toBe(items);
  },
);
