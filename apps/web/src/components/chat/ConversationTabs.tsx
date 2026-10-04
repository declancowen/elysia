import { useParams, useSearch, useLocation } from "@tanstack/react-router";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useConversationTabNavigation } from "../../hooks/useConversationTabNavigation";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useConversationTabsStore, type ConversationTab } from "../../conversationTabsStore";
import { ChannelIcon, GitPullRequestArrowIcon, MessageCircleIcon } from "../../icons";
import { useProject, useThreadShell } from "../../state/entities";
import { AgentAvatar } from "../agents/AgentAvatar";
import {
  WorkspaceTabStrip,
  WorkspaceTab,
  type WorkspaceTabControls,
} from "../workspace/WorkspaceTabStrip";

export function ConversationTabs() {
  const { tabs, activate, close } = useConversationTabsStore();
  const navigateTo = useConversationTabNavigation();
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const pathname = useLocation({ select: (location) => location.pathname });
  const selected = tabs.find((tab) => {
    const target = tab.target;
    if (target.kind === "pull-request")
      return (
        pathname === "/pull-requests" &&
        search.repository === target.repository &&
        search.number === target.number &&
        (search.selectedEnvironmentId === undefined ||
          search.selectedEnvironmentId === target.environmentId) &&
        (search.selectedProjectId === undefined || search.selectedProjectId === target.projectId) &&
        (search.selectedHost === undefined ||
          search.selectedHost.toLowerCase() === target.host.toLowerCase())
      );
    if (target.kind === "draft") return params.draftId === target.draftId;
    return (
      params.environmentId === target.threadRef.environmentId &&
      params.threadId === target.threadRef.threadId
    );
  });
  return (
    <WorkspaceTabStrip
      tabs={tabs}
      activeId={selected?.id ?? null}
      label="Conversations"
      onSelect={(tab) => {
        activate(tab.id);
        void navigateTo(tab.target);
      }}
      onClose={(tab) => {
        const next = close(tab.id);
        if (next) void navigateTo(next);
      }}
      renderTab={(tab, controls) =>
        tab.target.kind === "pull-request" ? (
          <WorkspaceTab
            {...controls}
            title={`#${tab.target.number}`}
            icon={<GitPullRequestArrowIcon aria-hidden className="size-4 shrink-0" />}
          />
        ) : (
          <ConversationTabItem target={tab.target} controls={controls} />
        )
      }
    />
  );
}

function ConversationTabItem({
  target,
  controls,
}: {
  target: Exclude<ConversationTab["target"], { kind: "pull-request" }>;
  controls: WorkspaceTabControls;
}) {
  const draft = useComposerDraftStore((store) =>
    target.kind === "draft" ? store.getDraftSession(target.draftId) : null,
  );
  const threadRef =
    target.kind === "server"
      ? target.threadRef
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
