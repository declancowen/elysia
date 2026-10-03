import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { selectAgentRoster } from "../agents/agentPresentation";
import type { ComposerCommandItem } from "./ComposerCommandPopover";

/** A handoff always targets the saved conversation, never a new backing chat. */
export function composerAgentMentionItems(input: {
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly environmentId: EnvironmentId | null;
  readonly sourceThreadId: ThreadId | null;
  readonly query: string;
}): Extract<ComposerCommandItem, { type: "agent" }>[] {
  if (
    !input.environmentId ||
    !input.sourceThreadId ||
    !input.threads.some(
      (thread) =>
        thread.environmentId === input.environmentId &&
        thread.id === input.sourceThreadId &&
        thread.archivedAt === null,
    )
  )
    return [];
  const source = input.threads.find(
    (thread) => thread.environmentId === input.environmentId && thread.id === input.sourceThreadId,
  );
  const group = input.projects.find(
    (project) => project.environmentId === input.environmentId && project.id === source?.projectId,
  )?.agentProfile?.group;
  const query = input.query.trim().toLocaleLowerCase();
  return selectAgentRoster(input.projects, input.threads).flatMap(({ project, conversation }) => {
    if (
      project.environmentId !== input.environmentId ||
      !conversation ||
      (group && !group.memberProjectIds.includes(project.id)) ||
      conversation.id !== project.agentProfile.conversationThreadId ||
      conversation.id === input.sourceThreadId ||
      (query &&
        ![project.title, project.agentProfile.title ?? ""].some((value) =>
          value.toLocaleLowerCase().includes(query),
        ))
    )
      return [];
    return [
      {
        id: `agent:${project.id}`,
        type: "agent" as const,
        projectId: project.id,
        avatar: project.agentProfile.avatar,
        isGroup: Boolean(project.agentProfile.group),
        label: project.title,
        description: group
          ? "Ask this agent"
          : project.agentProfile.group
            ? "Channel"
            : (project.agentProfile.title ?? "Agent"),
      },
    ];
  });
}
