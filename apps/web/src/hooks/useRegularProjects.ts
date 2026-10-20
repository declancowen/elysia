import { selectRegularProjects } from "../agentPresentation";
import { useProjects } from "../state/entities";
import { isScratchProject } from "@elysiatools/client-runtime/state/projects";
import { useEnvironments } from "../state/environments";

/** Keep scratch for chat ownership; project pickers opt out of the internal workspace. */
export function useRegularProjects(includeScratch = true) {
  const projects = useProjects();
  const { environments } = useEnvironments();
  return selectRegularProjects(projects).filter(
    (project) =>
      includeScratch ||
      !isScratchProject(
        project,
        environments.find((entry) => entry.environmentId === project.environmentId)?.serverConfig
          ?.scratchWorkspaceRoot,
      ),
  );
}
