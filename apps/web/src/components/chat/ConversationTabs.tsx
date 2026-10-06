import { useParams, useSearch, useLocation } from "@tanstack/react-router";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useConversationTabNavigation } from "../../hooks/useConversationTabNavigation";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useConversationTabsStore, type ConversationTab } from "../../conversationTabsStore";
import {
  ChannelIcon,
  GitPullRequestArrowIcon,
  MessageCircleIcon,
  Files01Icon,
  TaskEdit02Icon,
  Clock3Icon,
  FolderIcon,
  SettingsIcon,
  BotIcon,
  ChartNoAxesColumnIncreasingIcon,
} from "../../icons";
import { clearAgentCreationDraft, useAgentDialogStore } from "../agents/agentDialogStore";
import { useProject, useThreadShell } from "../../state/entities";
import { AgentAvatar } from "../agents/AgentAvatar";
import {
  WorkspaceTabStrip,
  WorkspaceTab,
  type WorkspaceTabControls,
} from "../workspace/WorkspaceTabStrip";

export function ConversationTabs() {
  const { tabs, activeId, activate, close } = useConversationTabsStore();
  const navigateTo = useConversationTabNavigation();
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const pathname = useLocation({ select: (location) => location.pathname });
  const selected = tabs.find((tab) => {
    const target = tab.target;
    if (target.kind === "scheduled")
      return pathname === "/settings/scheduled-tasks" && tab.id === activeId;
    if (target.kind === "surface")
      return (
        pathname === target.path &&
        ["project", "machine", "checkout"].every(
          (key) =>
            search[key as keyof typeof search] ===
            target.search?.[key as keyof NonNullable<typeof target.search>],
        )
      );
    if (target.kind === "agent-create")
      return (
        pathname === "/agents" &&
        search.create === true &&
        Boolean(search.channel) === Boolean(target.channel)
      );
    if (target.kind === "page")
      return target.id ? pathname === `/pages/${target.id}` : pathname === "/pages";
    if (target.kind === "task") return pathname === "/tasks" && (search.task ?? null) === target.id;
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
        if (
          tab.target.kind === "agent-create" &&
          !useConversationTabsStore.getState().isOpen(tab.target)
        )
          clearAgentCreationDraft(tab.target.channel);
        if (next) void navigateTo(next);
      }}
      renderTab={(tab, controls) =>
        tab.target.kind === "surface" ? (
          <WorkspaceTab
            {...controls}
            title={tab.target.title}
            icon={
              tab.target.path === "/usage" ? (
                <ChartNoAxesColumnIncreasingIcon className="size-4" />
              ) : tab.target.path === "/projects" || tab.target.search?.project ? (
                <FolderIcon className="size-4" />
              ) : tab.target.path === "/agents" ? (
                <BotIcon className="size-4" />
              ) : (
                <SettingsIcon className="size-4" />
              )
            }
          />
        ) : tab.target.kind === "scheduled" ? (
          <WorkspaceTab
            {...controls}
            title={
              tab.target.selection.kind === "empty"
                ? "Scheduled"
                : (tab.target.selection.task?.title ?? "New task")
            }
            icon={<Clock3Icon className="size-4" />}
          />
        ) : tab.target.kind === "agent-create" ? (
          <AgentCreationTab channel={Boolean(tab.target.channel)} controls={controls} />
        ) : tab.target.kind === "page" || tab.target.kind === "task" ? (
          <WorkspaceTab
            {...controls}
            title={tab.target.title}
            icon={
              tab.target.kind === "page" ? (
                <Files01Icon aria-hidden className="size-4" />
              ) : (
                <TaskEdit02Icon aria-hidden className="size-4" />
              )
            }
          />
        ) : tab.target.kind === "pull-request" ? (
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

function AgentCreationTab({
  channel,
  controls,
}: {
  channel?: boolean;
  controls: WorkspaceTabControls;
}) {
  const avatar = useAgentDialogStore((state) => state.creationDraft?.avatar);
  return (
    <WorkspaceTab
      {...controls}
      title={channel ? "New channel" : "New agent"}
      icon={
        channel ? (
          <ChannelIcon aria-hidden className="size-4" />
        ) : (
          <AgentAvatar
            avatar={avatar ?? { preset: "square", color: "#28B4FF" }}
            className="size-4"
          />
        )
      }
    />
  );
}

function ConversationTabItem({
  target,
  controls,
}: {
  target: Exclude<
    ConversationTab["target"],
    { kind: "pull-request" | "page" | "task" | "agent-create" | "surface" | "scheduled" }
  >;
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
