import type { AgentProfile, EnvironmentId, ProjectId } from "@elysiatools/contracts";
import type { AgentRosterEntry } from "./useAgents";

export function agentGroupCandidates(
  agents: readonly AgentRosterEntry[],
  environmentId: EnvironmentId | null,
) {
  return agents.filter(
    ({ project }) =>
      project.environmentId === environmentId &&
      project.agentProfile &&
      !project.agentProfile.archived &&
      !project.agentProfile.group,
  );
}

export function resolveAgentGroupSelection(
  name: string,
  agents: readonly AgentRosterEntry[],
  selectedIds: readonly ProjectId[],
  leadId: ProjectId | null,
) {
  const uniqueIds = new Set(selectedIds);
  if (
    !name.trim() ||
    uniqueIds.size < 2 ||
    uniqueIds.size > 32 ||
    uniqueIds.size !== selectedIds.length ||
    !leadId ||
    !uniqueIds.has(leadId)
  )
    return null;
  const members = agents.filter(({ project }) => uniqueIds.has(project.id));
  const lead = members.find(({ project }) => project.id === leadId);
  if (
    !lead ||
    members.length !== selectedIds.length ||
    members.some(
      ({ project }) =>
        project.environmentId !== lead.project.environmentId ||
        !project.agentProfile ||
        project.agentProfile.archived ||
        project.agentProfile.group,
    )
  )
    return null;
  return { members, lead };
}

export function makeAgentGroupProfile(
  lead: AgentRosterEntry,
  memberProjectIds: readonly ProjectId[],
  existing?: AgentProfile,
): AgentProfile {
  return {
    ...(existing ?? {
      title: "Agent channel",
      instructions:
        "Coordinate the agents in this channel to complete the user's request. Combine their findings into a clear, concise response.",
      avatar: lead.project.agentProfile!.avatar,
      notificationsEnabled: true,
      archived: false,
    }),
    group: { memberProjectIds, leadProjectId: lead.project.id },
  };
}
