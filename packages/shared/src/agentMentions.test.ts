import * as DateTime from "effect/DateTime";
import {
  ComposerContextId,
  EventId,
  ProjectId,
  ThreadId,
  MessageId,
  TurnItemId,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  agentTaskHandoff,
  delegatedAgentsFromTurnItems,
  formatAgentMention,
  isAgentDelegationActive,
  mentionedAgentProjectIds,
} from "./agentMentions.ts";

describe("agent mentions", () => {
  it("preserves identity across renamed, repeated and escaped labels without treating prose or files as agents", () => {
    const id = ProjectId.make("7104a0e1-476e-492d-8912-18b18eab607b");
    const mention = formatAgentMention(id, "Friday [Research]");
    expect(
      mentionedAgentProjectIds(
        `${mention} ${formatAgentMention(id, "New name")} @Friday [file](t3-context://v1/file/other)`,
      ),
    ).toEqual([id]);
    expect(mentionedAgentProjectIds("@Friday check this file")).toEqual([]);
  });
  it("accepts only source task receipts with a validated target identity", () => {
    const payload = {
      agentProjectId: ProjectId.make("Friday"),
      agentThreadId: ThreadId.make("agent-chat"),
      agentName: "Friday",
      sourceMessageId: MessageId.make("source-request"),
      targetMessageId: MessageId.make("target-request"),
      targetTurnId: null,
    };
    const notice: OrchestrationV2TurnItem = {
      id: TurnItemId.make("ack"),
      type: "system_notice",
      threadId: ThreadId.make("source"),
      runId: null,
      nodeId: null,
      status: "completed",
      message: "Accepted",
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: 0,
      title: null,
      completedAt: null,
      startedAt: DateTime.makeUnsafe("2026-10-02T00:00:00.000Z"),
      updatedAt: DateTime.makeUnsafe("2026-10-02T00:00:00.000Z"),
      agentDelegation: payload,
    };
    const jobs = delegatedAgentsFromTurnItems([{ ...notice, agentDelegation: undefined }, notice]);
    expect(jobs).toEqual([{ ...payload, activityId: EventId.make("ack") }]);
    expect(isAgentDelegationActive("waiting")).toBe(true);
    expect(isAgentDelegationActive("completed")).toBe(false);
    expect(isAgentDelegationActive("error")).toBe(false);
  });
});

it("displays only a delegated ask with its source, preferring durable metadata over reference prose", () => {
  const hash = "a".repeat(64);
  const text = `[Elysia handoff sha256:${hash}]\n\nOrigin chat: source\n\nRecent excerpt: private context\n\nCurrent request:\n\nCheck the release`;
  expect(agentTaskHandoff({ text })).toEqual({
    sourceThreadId: "source",
    sourceThreadTitle: "Thread",
    ask: "Check the release",
  });
  expect(agentTaskHandoff({ text: "Current request:\n\nordinary message" })).toBeNull();
  expect(agentTaskHandoff({ text: `[Elysia handoff sha256:${hash}]\n\nmalformed` })).toBeNull();
  const message = {
    text,
    context: {
      version: 1 as const,
      records: [
        {
          version: 1 as const,
          kind: "elysia-agent-delegation-source",
          contextId: ComposerContextId.make(`handoff_source_${hash}`),
          label: "Original request",
          payload: {
            handoff: {
              sourceThreadId: "source",
              sourceThreadTitle: "Release checks",
              ask: "Ask containing\n\nCurrent request:\n\na literal marker",
            },
          },
        },
      ],
    },
  };
  expect(agentTaskHandoff(message)?.ask).toContain("Ask containing");
  expect(agentTaskHandoff(message)?.sourceThreadTitle).toBe("Release checks");
});
