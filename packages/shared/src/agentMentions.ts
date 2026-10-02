import {
  AgentDelegationActivityPayload,
  ComposerContextId,
  ProjectId,
  ThreadId,
  type OrchestrationMessage,
  type OrchestrationV2TurnItem,
  EventId,
  type AgentGetDelegationResult,
} from "@t3tools/contracts";
import {
  collectComposerContextReferences,
  formatComposerContextReference,
} from "./composerContextReferences.ts";

export function formatAgentMention(projectId: ProjectId, name: string): string {
  return formatComposerContextReference({
    kind: "agent",
    contextId: ComposerContextId.make(projectId),
    label: `@${name}`,
  });
}

/** Route by identity, never the editable name displayed in the prompt. */
export function mentionedAgentProjectIds(text: string): ProjectId[] {
  return [
    ...new Set(
      collectComposerContextReferences(text)
        .filter((reference) => reference.kind === "agent")
        .map((reference) => ProjectId.make(reference.contextId)),
    ),
  ];
}

export type DelegatedAgent = AgentDelegationActivityPayload & { activityId: EventId };

/** Keep each delegation linked to the durable notice in its source chat. */
export function delegatedAgentsFromTurnItems(
  items: ReadonlyArray<OrchestrationV2TurnItem>,
): DelegatedAgent[] {
  return items.flatMap((item) =>
    item.type === "system_notice" && item.agentDelegation
      ? [{ ...item.agentDelegation, activityId: EventId.make(item.id) }]
      : [],
  );
}

export function isAgentDelegationActive(status: AgentGetDelegationResult["status"]): boolean {
  return status === "queued" || status === "working" || status === "waiting";
}

/** Display the ask, keeping the provider's bounded reference context out of the transcript UI. */
export function agentTaskHandoff(message: Pick<OrchestrationMessage, "text" | "context">) {
  const fingerprint = /^\[Elysia handoff sha256:([a-f0-9]{64})\]\n\n/.exec(message.text)?.[1];
  if (!fingerprint) return null;
  const record = message.context?.records.find(
    (record) =>
      record.kind === "elysia-agent-delegation-source" &&
      record.contextId === `handoff_source_${fingerprint}`,
  );
  const payload = record && "payload" in record ? record.payload : null;
  const handoff =
    payload && typeof payload === "object" && "handoff" in payload ? payload.handoff : null;
  if (
    handoff &&
    typeof handoff === "object" &&
    "sourceThreadId" in handoff &&
    typeof handoff.sourceThreadId === "string" &&
    handoff.sourceThreadId &&
    "sourceThreadTitle" in handoff &&
    typeof handoff.sourceThreadTitle === "string" &&
    "ask" in handoff &&
    typeof handoff.ask === "string"
  ) {
    return {
      sourceThreadId: ThreadId.make(handoff.sourceThreadId),
      sourceThreadTitle: handoff.sourceThreadTitle,
      ask: handoff.ask,
    };
  }
  // Existing handoffs predate display metadata; their last delimiter separates the ask.
  const sourceThreadId = /^Origin chat: ([^\n]+)$/m.exec(message.text)?.[1];
  const marker = "\n\nCurrent request:\n\n";
  const start = message.text.lastIndexOf(marker);
  return sourceThreadId && start >= 0
    ? {
        sourceThreadId: ThreadId.make(sourceThreadId),
        sourceThreadTitle: "Thread",
        ask: message.text.slice(start + marker.length),
      }
    : null;
}
