import { useMemo } from "react";
import { agentThreadIsBusy, getAgentConversation, isAgentProject } from "../../agentPresentation";
import { useProjects, useThreadShells } from "../../state/entities";
import type { SidebarThreadSummary } from "../../types";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";

export function useAgents() {
  const projects = useProjects();
  const threads = useThreadShells();
  return useMemo(() => {
    const threadsByProject = new Map<string, SidebarThreadSummary[]>();
    for (const thread of threads) {
      const key = `${thread.environmentId}:${thread.projectId}`;
      const owned = threadsByProject.get(key);
      if (owned) owned.push(thread);
      else threadsByProject.set(key, [thread]);
    }
    return projects
      .filter(isAgentProject)
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((project) => {
        const owned = threadsByProject.get(`${project.environmentId}:${project.id}`) ?? [];
        return {
          project,
          thread: getAgentConversation(project, owned),
          busy: owned.some((thread) => agentThreadIsBusy(thread)),
        };
      });
  }, [projects, threads]);
}

export type AgentRosterEntry = ReturnType<typeof useAgents>[number];
