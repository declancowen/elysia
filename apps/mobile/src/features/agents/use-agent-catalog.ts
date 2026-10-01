import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useProjects, useThreadShells } from "../../state/entities";
import {
  selectAgentRoster,
  selectNonAgentProjectItems,
  selectRegularProjects,
} from "./agentPresentation";

export function useRegularProjects() {
  const projects = useProjects();
  return useMemo(() => selectRegularProjects(projects), [projects]);
}

export function useAgentCatalog() {
  const allProjects = useProjects();
  const allThreads = useThreadShells();
  const projects = useMemo(() => selectRegularProjects(allProjects), [allProjects]);
  const threads = useMemo(
    () => selectNonAgentProjectItems(allThreads, allProjects),
    [allProjects, allThreads],
  );
  const agents = useMemo(
    () => selectAgentRoster(allProjects, allThreads),
    [allProjects, allThreads],
  );
  return { projects, threads, agents };
}

export function useRegularProjectItems<
  T extends { readonly environmentId: EnvironmentId; readonly projectId: ProjectId },
>(items: ReadonlyArray<T>) {
  const projects = useProjects();
  return useMemo(() => selectNonAgentProjectItems(items, projects), [items, projects]);
}
