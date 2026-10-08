import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@elysiatools/client-runtime/state/shell";
import type { EnvironmentId, ProjectId } from "@elysiatools/contracts";

type ProjectIdentity = Pick<EnvironmentProject, "environmentId" | "id" | "agentProfile">;
type ProjectItem = { readonly environmentId: EnvironmentId; readonly projectId: ProjectId };

export interface AgentRosterEntry {
  readonly project: EnvironmentProject & {
    readonly agentProfile: NonNullable<EnvironmentProject["agentProfile"]>;
  };
  readonly conversation: EnvironmentThreadShell | null;
}

export function selectRegularProjects<T extends ProjectIdentity>(projects: ReadonlyArray<T>): T[] {
  return projects.filter((project) => project.agentProfile == null);
}

/** Filter navigation only; native chat continues to read the complete entity store. */
export function selectNonAgentProjectItems<T extends ProjectItem>(
  items: ReadonlyArray<T>,
  projects: ReadonlyArray<ProjectIdentity>,
): T[] {
  const agentKeys = new Set(
    projects
      .filter((project) => project.agentProfile != null)
      .map((project) => `${project.environmentId}:${project.id}`),
  );
  return items.filter((item) => !agentKeys.has(`${item.environmentId}:${item.projectId}`));
}

export function selectAgentRoster(
  projects: ReadonlyArray<EnvironmentProject>,
  threads: ReadonlyArray<EnvironmentThreadShell>,
): AgentRosterEntry[] {
  return projects.flatMap((project) => {
    const agentProfile = project.agentProfile;
    if (!agentProfile || agentProfile.archived) return [];
    const candidates = threads.filter(
      (thread) =>
        thread.environmentId === project.environmentId &&
        thread.projectId === project.id &&
        thread.archivedAt === null,
    );
    const conversation =
      candidates.find((thread) => thread.id === agentProfile.conversationThreadId) ??
      candidates.sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )[0] ??
      null;
    return [{ project: { ...project, agentProfile }, conversation }];
  });
}
