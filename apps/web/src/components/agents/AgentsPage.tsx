import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import { useEffect, useRef } from "react";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useAllEnvironmentProjectSnapshotsReady } from "../../state/entities";
import { useAgentActions } from "./useAgentActions";
import { useAgentConversationPreviews } from "./useAgentConversationPreviews";
import type { AgentRosterEntry } from "./useAgents";
import { isElectron } from "../../env";
import { useEscapeToGoBack } from "../../hooks/useNavigateBack";
import { BotIcon, ChannelIcon } from "../../icons";
import { Button } from "../ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { AgentGroupDialog } from "./AgentGroupDialog";
import {
  closeAgentDialog,
  openAgentDialog,
  openChannelDialog,
  useAgentDialogStore,
} from "./agentDialogStore";
import { useAgents } from "./useAgents";

export function AgentsPage({ editingGroupRef }: { editingGroupRef?: ScopedProjectRef }) {
  useEscapeToGoBack();
  const agents = useAgents();
  const hasAgents = agents.some(({ project }) => !project.agentProfile!.archived);
  const ready = useAllEnvironmentProjectSnapshotsReady();
  const { previews, loading } = useAgentConversationPreviews(agents);
  const recent = agents
    .filter(({ project, thread }) => !project.agentProfile!.archived && thread)
    .toSorted((left, right) =>
      (
        previews.get(
          scopedProjectKey({
            environmentId: right.project.environmentId,
            projectId: right.project.id,
          }),
        )?.updatedAt ?? right.thread!.updatedAt
      ).localeCompare(
        previews.get(
          scopedProjectKey({
            environmentId: left.project.environmentId,
            projectId: left.project.id,
          }),
        )?.updatedAt ?? left.thread!.updatedAt,
      ),
    )[0];
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
      {!editingGroupRef && ready && !loading && recent ? (
        <OpenRecentConversation agent={recent} />
      ) : null}
      <WorkspacePageHeader electron={isElectron} />
      {ready && !hasAgents && !editingGroupRef ? (
        <Empty>
          <BotIcon aria-hidden className="size-16 text-muted-foreground/60" />
          <EmptyHeader>
            <EmptyTitle>No agents or channels</EmptyTitle>
            <EmptyDescription>Create an agent or channel to start a conversation.</EmptyDescription>
          </EmptyHeader>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => openAgentDialog()}>
              <BotIcon />
              Create agent
            </Button>
            <Button size="sm" variant="outline" onClick={() => openChannelDialog()}>
              <ChannelIcon />
              Create channel
            </Button>
          </div>
        </Empty>
      ) : (
        <WorkspacePageContainer width="expanded">
          <h1 className="text-xl font-medium">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Choose an agent or channel from the sidebar.
          </p>
        </WorkspacePageContainer>
      )}
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

function OpenRecentConversation({ agent }: { agent: AgentRosterEntry }) {
  const { openConversation } = useAgentActions(agent);
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void openConversation();
  }, [openConversation]);
  return null;
}
