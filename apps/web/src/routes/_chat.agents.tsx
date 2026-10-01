import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { AgentEditorPage } from "../components/agents/AgentDialog";

type AgentEditorSearch = { environmentId?: EnvironmentId; projectId?: ProjectId };

export const Route = createFileRoute("/_chat/agents")({
  validateSearch: (raw: Record<string, unknown>): AgentEditorSearch => {
    const environmentId = typeof raw.environmentId === "string" ? raw.environmentId.trim() : "";
    const projectId = typeof raw.projectId === "string" ? raw.projectId.trim() : "";
    return environmentId && projectId
      ? { environmentId: EnvironmentId.make(environmentId), projectId: ProjectId.make(projectId) }
      : {};
  },
  component: AgentEditorRoute,
});

function AgentEditorRoute() {
  const { environmentId, projectId } = Route.useSearch();
  const projectRef = environmentId && projectId ? scopeProjectRef(environmentId, projectId) : null;
  return (
    <AgentEditorPage
      key={projectRef ? `${environmentId}:${projectId}` : "new"}
      projectRef={projectRef}
    />
  );
}
