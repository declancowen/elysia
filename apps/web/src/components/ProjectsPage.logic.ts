import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import type { EnvironmentId } from "@t3tools/contracts";

import { isAgentProject } from "../agentPresentation";
import { sortThreads, getThreadSortTimestamp } from "../lib/threadSort";
import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import type { ThreadShell } from "../types";
import { filterSidebarV2VisibleThreads, getProjectSortTimestamp } from "./Sidebar.logic";

export function buildProjectsPageRows(
  groups: readonly SidebarProjectSnapshot[],
  threads: readonly ThreadShell[],
  search: string,
  scratchWorkspaceRootFor: (environmentId: EnvironmentId) => string | null,
) {
  const query = search.trim().toLocaleLowerCase();
  const threadsByProject = new Map<string, ThreadShell[]>();
  for (const thread of filterSidebarV2VisibleThreads(threads, null)) {
    const key = scopedProjectKey({
      environmentId: thread.environmentId,
      projectId: thread.projectId,
    });
    const projectThreads = threadsByProject.get(key) ?? [];
    projectThreads.push(thread);
    threadsByProject.set(key, projectThreads);
  }
  return groups
    .filter(
      (group) =>
        group.memberProjects.every(
          (member) =>
            !isAgentProject(member) &&
            !isScratchProject(member, scratchWorkspaceRootFor(member.environmentId)),
        ) &&
        (!query ||
          [group.displayName, ...group.memberProjects.map((member) => member.workspaceRoot)].some(
            (value) => value.toLocaleLowerCase().includes(query),
          )),
    )
    .map((project) => {
      const projectThreads = sortThreads(
        project.memberProjectRefs.flatMap(
          (ref) => threadsByProject.get(scopedProjectKey(ref)) ?? [],
        ),
        "updated_at",
      );
      return {
        project,
        threads: projectThreads,
        updatedAt: getProjectSortTimestamp(project, projectThreads, "updated_at"),
      };
    })
    .toSorted(
      (left, right) =>
        right.updatedAt - left.updatedAt ||
        left.project.displayName.localeCompare(right.project.displayName),
    );
}

export function projectThreadUpdatedAt(thread: ThreadShell): string {
  const timestamp = getThreadSortTimestamp(thread, "updated_at");
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : thread.updatedAt;
}
