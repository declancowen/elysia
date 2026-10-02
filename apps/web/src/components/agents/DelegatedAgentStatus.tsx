import { AgentAvatar } from "./AgentAvatar";
import type { DelegatedAgentView } from "./useDelegatedAgents";

export function DelegatedAgentStatus({ agents }: { agents: ReadonlyArray<DelegatedAgentView> }) {
  const working = agents.filter((agent) => agent.working);
  const visible = working.length > 0 ? working : agents;
  const failed = agents.filter((agent) => agent.data?.status === "error").length;
  const completed = agents.filter((agent) => agent.data?.status === "completed").length;
  const stopped = agents.filter((agent) => agent.data?.status === "interrupted").length;
  const unavailable = agents.length - working.length - failed - completed - stopped;
  const settledLabel = [
    [completed, "finished"],
    [failed, "failed"],
    [stopped, "stopped"],
    [unavailable, "unavailable"],
  ]
    .filter(([count]) => count)
    .map(([count, label]) => `${count} ${label}`)
    .join(" · ");
  if (agents.length === 0) return null;
  return (
    <span
      className="flex min-h-6 min-w-0 items-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <span className="flex shrink-0 items-center gap-1" aria-hidden>
        {visible
          .slice(0, 3)
          .map(({ job, project, working }) =>
            project?.agentProfile ? (
              <AgentAvatar
                key={job.activityId}
                avatar={project.agentProfile.avatar}
                working={working}
                className="size-4"
              />
            ) : null,
          )}
      </span>
      <span className="min-w-0 truncate">
        {visible.length === 1
          ? `${visible[0]!.name} ${working.length ? (visible[0]!.data?.status === "waiting" ? "needs input" : "is working") : visible[0]!.data?.status === "completed" ? "finished" : visible[0]!.data?.status === "error" ? "failed" : visible[0]!.data?.status === "interrupted" ? "stopped" : "is unavailable"}`
          : working.length
            ? `${working.length} working`
            : settledLabel}
      </span>
    </span>
  );
}
