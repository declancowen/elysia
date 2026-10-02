import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import type { Project, SidebarThreadSummary } from "./types";

type ProjectIdentity = Pick<Project, "environmentId" | "id" | "agentProfile">;
type ProjectItem = { readonly environmentId: EnvironmentId; readonly projectId: ProjectId };

export function isAgentProject(project: Pick<Project, "agentProfile">): boolean {
  return project.agentProfile != null;
}

export function selectRegularProjects<T extends ProjectIdentity>(projects: ReadonlyArray<T>): T[] {
  return projects.filter((project) => !isAgentProject(project));
}

/** Presentation only: native ChatView still reads every project and thread from the raw store. */
export function selectNonAgentProjectItems<T extends ProjectItem>(
  items: ReadonlyArray<T>,
  projects: ReadonlyArray<ProjectIdentity>,
): T[] {
  const agentKeys = new Set(
    projects.filter(isAgentProject).map((project) => `${project.environmentId}:${project.id}`),
  );
  return items.filter((item) => !agentKeys.has(`${item.environmentId}:${item.projectId}`));
}

export function getAgentConversation<
  T extends Pick<
    SidebarThreadSummary,
    "environmentId" | "projectId" | "id" | "createdAt" | "archivedAt"
  >,
>(project: ProjectIdentity, threads: ReadonlyArray<T>): T | null {
  const candidates = threads.filter(
    (thread) => thread.environmentId === project.environmentId && thread.projectId === project.id,
  );
  const savedId = project.agentProfile?.conversationThreadId;
  return (
    candidates.find((thread) => thread.id === savedId) ??
    candidates
      .filter((thread) => thread.archivedAt === null)
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0] ??
    candidates.toSorted(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )[0] ??
    null
  );
}

/** Idle provider sessions can be edited; work or outstanding requests cannot. */
export function agentThreadIsBusy(
  thread: Pick<
    SidebarThreadSummary,
    "runtime" | "pendingBackgroundTasks" | "hasPendingApprovals" | "hasPendingUserInput"
  >,
): boolean {
  return (
    thread.hasPendingApprovals ||
    thread.hasPendingUserInput ||
    thread.pendingBackgroundTasks.length > 0 ||
    ["preparing", "queued", "starting", "running", "waiting"].includes(thread.runtime?.status ?? "")
  );
}
