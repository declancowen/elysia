import {
  AgentDelegationActivityPayload,
  ComposerContextId,
  ProjectId,
  type EventId,
  type OrchestrationThreadActivity,
  type AgentGetDelegationResult,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
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
const decodeDelegationPayload = Schema.decodeUnknownOption(AgentDelegationActivityPayload);

/** The source activity is the durable link to this task, not the agent's other chats. */
export function delegatedAgentsFromActivities(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): DelegatedAgent[] {
  return activities.flatMap((activity) => {
    if (activity.kind !== "agent.delegated") return [];
    const payload = decodeDelegationPayload(activity.payload);
    return Option.isSome(payload) ? [{ ...payload.value, activityId: activity.id }] : [];
  });
}

export function isAgentDelegationActive(status: AgentGetDelegationResult["status"]): boolean {
  return status === "queued" || status === "working" || status === "waiting";
}
