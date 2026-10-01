import { useMemo } from "react";
import { selectRegularProjects } from "../agentPresentation";
import { useProjects } from "../state/entities";

/** Ordinary project pickers exclude agent workspaces without changing the entity store. */
export function useRegularProjects() {
  const projects = useProjects();
  return useMemo(() => selectRegularProjects(projects), [projects]);
}
