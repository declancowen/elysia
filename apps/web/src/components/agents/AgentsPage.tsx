import type { ScopedProjectRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { isElectron } from "../../env";
import { useEscapeToGoBack } from "../../hooks/useNavigateBack";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { AgentGroupDialog } from "./AgentGroupDialog";
import { closeAgentDialog, useAgentDialogStore } from "./agentDialogStore";
import { useAgents } from "./useAgents";

export function AgentsPage({ editingGroupRef }: { editingGroupRef?: ScopedProjectRef }) {
  useEscapeToGoBack();
  const agents = useAgents();
  const navigate = useNavigate();
  const returnHref = useAgentDialogStore((state) => state.returnHref);
  const editingGroup = editingGroupRef
    ? agents.find(
        ({ project }) =>
          project.id === editingGroupRef.projectId &&
          project.environmentId === editingGroupRef.environmentId,
      )
    : undefined;
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden">
      <WorkspacePageHeader electron={isElectron} />
      <WorkspacePageContainer width="expanded">
        <h1 className="text-xl font-medium">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Choose an agent or channel from the sidebar.
        </p>
      </WorkspacePageContainer>
      {editingGroup ? (
        <AgentGroupDialog
          key={`${editingGroup.project.environmentId}:${editingGroup.project.id}`}
          agents={agents}
          existing={editingGroup}
          onClose={() => {
            closeAgentDialog();
            void navigate({ href: returnHref ?? "/agents" });
          }}
        />
      ) : null}
    </SidebarInset>
  );
}
