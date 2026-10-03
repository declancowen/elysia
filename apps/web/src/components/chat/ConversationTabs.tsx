import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { useComposerDraftStore } from "../../composerDraftStore";
import {
  useConversationTabsStore,
  useAgentConversationTabsStore,
  type ConversationTab,
} from "../../conversationTabsStore";
import { ChannelIcon, MessageCircleIcon } from "../../icons";
import { useProject, useThreadShell } from "../../state/entities";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  type ThreadRouteTarget,
} from "../../threadRoutes";
import { AgentAvatar } from "../agents/AgentAvatar";
import { useAgentSidebarStore } from "../agents/agentSidebarStore";
import {
  WorkspaceTabStrip,
  WorkspaceTab,
  type WorkspaceTabControls,
} from "../workspace/WorkspaceTabStrip";

export function ConversationTabs() {
  const agentsActive = useAgentSidebarStore((state) => state.active);
  const workspace = useConversationTabsStore();
  const agents = useAgentConversationTabsStore();
  const { tabs, activeId, activate, close } = agentsActive ? agents : workspace;
  const navigate = useNavigate();
  const navigateTo = (target: ThreadRouteTarget) =>
    target.kind === "draft"
      ? navigate({ to: "/draft/$draftId", params: buildDraftThreadRouteParams(target.draftId) })
      : navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(target.threadRef),
        });
  return (
    <WorkspaceTabStrip
      tabs={tabs}
      activeId={activeId}
      label="Conversations"
      onSelect={(tab) => {
        activate(tab.id);
        void navigateTo(tab.target);
      }}
      onClose={(tab) => {
        const next = close(tab.id);
        if (next) void navigateTo(next);
      }}
      renderTab={(tab, controls) => <ConversationTabItem tab={tab} controls={controls} />}
    />
  );
}

function ConversationTabItem({
  tab,
  controls,
}: {
  tab: ConversationTab;
  controls: WorkspaceTabControls;
}) {
  const draft = useComposerDraftStore((store) =>
    tab.target.kind === "draft" ? store.getDraftSession(tab.target.draftId) : null,
  );
  const threadRef =
    tab.target.kind === "server"
      ? tab.target.threadRef
      : draft
        ? scopeThreadRef(draft.environmentId, draft.threadId)
        : null;
  const thread = useThreadShell(threadRef);
  const projectId = thread?.projectId ?? draft?.projectId;
  const project = useProject(
    threadRef && projectId ? scopeProjectRef(threadRef.environmentId, projectId) : null,
  );
  const profile = project?.agentProfile;
  const title = profile ? project.title : (thread?.title ?? "New chat");
  return (
    <WorkspaceTab
      {...controls}
      title={title}
      icon={
        profile?.group ? (
          <ChannelIcon aria-hidden className="size-4 shrink-0" />
        ) : profile ? (
          <AgentAvatar avatar={profile.avatar} className="size-4 shrink-0" />
        ) : (
          <MessageCircleIcon aria-hidden className="size-4 shrink-0" />
        )
      }
    />
  );
}
