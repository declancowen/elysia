import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useProjects, useThreadShells, useNavigationThreadShells } from "../../state/entities";
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
  const navigationThreads = useNavigationThreadShells();
  const projects = useMemo(() => selectRegularProjects(allProjects), [allProjects]);
  const threads = useMemo(
    () => selectNonAgentProjectItems(navigationThreads, allProjects),
    [allProjects, navigationThreads],
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
