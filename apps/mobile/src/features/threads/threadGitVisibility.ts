import type { OrchestrationProjectShell } from "@t3tools/contracts";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";

/** Scratch chats and persistent agents have conversations, not project Git controls. */
export function threadHasProjectGitControls(
  project: Pick<OrchestrationProjectShell, "workspaceRoot" | "agentProfile"> | null,
  scratchWorkspaceRoot: string | null | undefined,
) {
  return (
    project !== null && !project.agentProfile && !isScratchProject(project, scratchWorkspaceRoot)
  );
}
