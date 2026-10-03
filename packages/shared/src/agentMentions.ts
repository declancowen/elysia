import {
  AgentDelegationActivityPayload,
  ComposerContextId,
  ProjectId,
  ThreadId,
  type OrchestrationMessage,
  type OrchestrationV2TurnItem,
  EventId,
  type AgentGetDelegationResult,
  type AgentProfile,
  type OrchestrationV2ProjectedTurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
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

/** One member owns a group turn; the latest explicit mention overrides its lead. */
export function agentGroupResponder(
  group: NonNullable<AgentProfile["group"]>,
  text: string,
): ProjectId | null {
  const mentioned = collectComposerContextReferences(text)
    .filter((reference) => reference.kind === "agent")
    .map((reference) => ProjectId.make(reference.contextId));
  if (mentioned.some((id) => !group.memberProjectIds.includes(id))) return null;
  const target = mentioned.at(-1) ?? group.leadProjectId;
  return group.memberProjectIds.includes(target) ? target : null;
}

/** A group owns its member mentions, so the same request is not dispatched twice. */
export function agentHandoffTargets(
  text: string,
  groups: ReadonlyArray<{ id: ProjectId; group: NonNullable<AgentProfile["group"]> }>,
): ProjectId[] | null {
  const mentioned = mentionedAgentProjectIds(text);
  const taggedGroups = groups.filter(({ id }) => mentioned.includes(id));
  if (taggedGroups.length === 0) return mentioned;
  const target = taggedGroups[0]!;
  if (
    taggedGroups.length !== 1 ||
    mentioned.some((id) => id !== target.id && !target.group.memberProjectIds.includes(id))
  )
    return null;
  return [target.id];
}

export type DelegatedAgent = AgentDelegationActivityPayload & { activityId: EventId };

/** Channels display conversation content; handoff provenance remains in the canonical history. */
export function channelConversationItems(
  items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>,
  isChannel: boolean,
  jobs: ReadonlyArray<{
    job: DelegatedAgent;
    working: boolean;
    data: { status: AgentGetDelegationResult["status"] } | null;
  }> = [],
): ReadonlyArray<OrchestrationV2ProjectedTurnItem> {
  if (!isChannel) return items;
  const byActivity = new Map(jobs.map((job) => [job.job.activityId, job]));
  return items.flatMap((row) => {
    const item = row.item;
    if (item.type === "system_notice" && item.agentDelegation) {
      const job = byActivity.get(EventId.make(item.id));
      const status = job?.working ? null : (job?.data?.status ?? (job ? "unavailable" : null));
      const failed =
        status === "error" ||
        status === "unavailable" ||
        status === "interrupted" ||
        (job?.working === false && status !== null && isAgentDelegationActive(status));
      if (!failed) return [];
      const { agentDelegation, ...notice } = item;
      return [
        {
          ...row,
          item: {
            ...notice,
            message:
              status === "interrupted"
                ? `${agentDelegation.agentName}'s response was stopped.`
                : status === "error"
                  ? `${agentDelegation.agentName} could not finish this request. Try again.`
                  : `${agentDelegation.agentName} is unavailable. Restore the agent or try another channel member.`,
          },
        },
      ];
    }
    if (item.type !== "user_message") return [row];
    const handoff = agentTaskHandoff(item);
    if (
      !handoff &&
      !item.context?.records.some((record) => record.kind === "elysia-agent-delegation-source")
    )
      return [row];
    return [
      {
        ...row,
        item: {
          ...item,
          text: handoff?.ask ?? item.text,
          ...(item.context
            ? {
                context: {
                  ...item.context,
                  records: item.context.records.filter(
                    (record) => record.kind !== "elysia-agent-delegation-source",
                  ),
                },
              }
            : {}),
        },
      },
    ];
  });
}

/** Use the accepted member job's status, including failures, rather than guessing from a missing reply. */
export function channelWorkStartedAt(
  items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>,
  jobs: ReadonlyArray<{ job: DelegatedAgent; working: boolean }>,
): string | null {
  const working = new Set(jobs.filter((job) => job.working).map((job) => job.job.activityId));
  const notice = items.find(
    ({ item }) => item.type === "system_notice" && working.has(EventId.make(item.id)),
  )?.item;
  return notice ? DateTime.formatIso(notice.startedAt ?? notice.updatedAt) : null;
}

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
export function agentTaskHandoff(
  message: Pick<OrchestrationMessage, "text" | "context"> & {
    senderThreadId?: ThreadId | undefined;
  },
) {
  const fingerprint = /^\[Elysia handoff sha256:([a-f0-9]{64})\]\n\n/.exec(message.text)?.[1];
  if (!fingerprint && !message.senderThreadId) return null;
  const record = message.context?.records.find(
    (record) =>
      record.kind === "elysia-agent-delegation-source" &&
      (fingerprint
        ? record.contextId === `handoff_source_${fingerprint}`
        : /^handoff_source_[a-f0-9]{64}$/.test(record.contextId)),
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
    (fingerprint !== undefined || handoff.sourceThreadId === message.senderThreadId) &&
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
  if (!fingerprint) return null;
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
