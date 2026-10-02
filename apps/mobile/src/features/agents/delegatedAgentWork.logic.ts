import type { AgentGetDelegationResult } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { isAgentDelegationActive } from "@t3tools/shared/agentMentions";

export function delegationShellRevision(
  shell: Pick<
    EnvironmentThreadShell,
    "updatedAt" | "latestTurn" | "session" | "hasPendingApprovals" | "hasPendingUserInput"
  > | null,
): string | null {
  return shell === null
    ? null
    : JSON.stringify([
        shell.updatedAt,
        shell.latestTurn?.turnId,
        shell.latestTurn?.state,
        shell.session?.status,
        shell.session?.activeTurnId,
        shell.hasPendingApprovals,
        shell.hasPendingUserInput,
      ]);
}

export function delegatedAgentStatusLabel(status: AgentGetDelegationResult["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "working":
      return "Working";
    case "waiting":
      return "Needs input";
    case "completed":
      return "Completed";
    case "interrupted":
      return "Stopped";
    case "error":
      return "Failed";
    case "unavailable":
      return "Unavailable";
  }
}

export function delegatedAgentsStatusLabel(
  statuses: ReadonlyArray<AgentGetDelegationResult["status"]>,
) {
  const working = statuses.filter(isAgentDelegationActive).length;
  if (working) return `${working} ${working === 1 ? "agent" : "agents"} working`;
  const state = statuses.includes("error")
    ? "Failed"
    : statuses.includes("unavailable")
      ? "Unavailable"
      : statuses.includes("interrupted")
        ? "Stopped"
        : "Completed";
  return `${statuses.length} agents · ${state}`;
}

/** Only active tasks follow their agent shell; later unrelated work must not refresh old results. */
export function delegationShellRevisionToRefresh(input: {
  readonly previousRevision: string | null;
  readonly currentRevision: string | null;
  readonly status: AgentGetDelegationResult["status"] | null;
  readonly pending: boolean;
  readonly cachedActiveOnMount?: boolean;
}) {
  return (
    input.status !== null &&
    isAgentDelegationActive(input.status) &&
    !input.pending &&
    (input.cachedActiveOnMount === true ||
      (input.currentRevision !== input.previousRevision && input.currentRevision !== null))
  );
}
