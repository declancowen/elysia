import type { OrchestrationProjectShell } from "@elysiatools/contracts";
import { isScratchProject } from "@elysiatools/client-runtime/state/projects";

/** Scratch chats and persistent agents have conversations, not project Git controls. */
export function threadHasProjectGitControls(
  project: Pick<OrchestrationProjectShell, "workspaceRoot" | "agentProfile"> | null,
  scratchWorkspaceRoot: string | null | undefined,
) {
  return (
    project !== null && !project.agentProfile && !isScratchProject(project, scratchWorkspaceRoot)
  );
}
