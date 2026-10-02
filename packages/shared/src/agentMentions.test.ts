import { EventId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  delegatedAgentsFromActivities,
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
    const activity = {
      id: EventId.make("ack"),
      kind: "agent.delegated",
      tone: "info" as const,
      summary: "Accepted",
      turnId: null,
      createdAt: "2026-10-02T00:00:00.000Z",
      payload: {
        agentProjectId: "Friday",
        agentThreadId: "agent-chat",
        agentName: "Friday",
        sourceMessageId: "source-request",
        targetMessageId: "target-request",
        targetTurnId: null,
      },
    };
    const jobs = delegatedAgentsFromActivities([
      { ...activity, kind: "task.progress" },
      { ...activity, payload: { ...activity.payload, targetMessageId: null } },
      activity,
    ]);
    expect(jobs).toEqual([{ ...activity.payload, activityId: activity.id }]);
    expect(isAgentDelegationActive("waiting")).toBe(true);
    expect(isAgentDelegationActive("completed")).toBe(false);
    expect(isAgentDelegationActive("error")).toBe(false);
  });
});
