import { scopeProjectRef } from "@elysiatools/client-runtime/environment";
import { EnvironmentId, ProjectId } from "@elysiatools/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { AgentEditorPage, AgentChannelEditorPage } from "../components/agents/AgentDialog";
import { AgentsPage } from "../components/agents/AgentsPage";
import { useProject } from "../state/entities";

type AgentEditorSearch = {
  environmentId?: EnvironmentId;
  projectId?: ProjectId;
  create?: boolean;
  channel?: boolean;
};

export const Route = createFileRoute("/_chat/agents")({
  validateSearch: (raw: Record<string, unknown>): AgentEditorSearch => {
    const environmentId = typeof raw.environmentId === "string" ? raw.environmentId.trim() : "";
    const projectId = typeof raw.projectId === "string" ? raw.projectId.trim() : "";
    return environmentId && projectId
      ? { environmentId: EnvironmentId.make(environmentId), projectId: ProjectId.make(projectId) }
      : raw.create === true
        ? { create: true, ...(raw.channel === true ? { channel: true } : {}) }
        : {};
  },
  component: AgentEditorRoute,
});

function AgentEditorRoute() {
  const { environmentId, projectId, create, channel } = Route.useSearch();
  const projectRef = environmentId && projectId ? scopeProjectRef(environmentId, projectId) : null;
  const project = useProject(projectRef);
  if (projectRef && project?.agentProfile?.group)
    return <AgentsPage editingGroupRef={projectRef} />;
  if (!projectRef && !create) return <AgentsPage />;
  if (!projectRef && channel) return <AgentChannelEditorPage />;
  return (
    <AgentEditorPage
      key={projectRef ? `${environmentId}:${projectId}` : "new"}
      projectRef={projectRef}
    />
  );
}
