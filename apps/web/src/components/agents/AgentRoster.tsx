import { useConversationRowClick } from "../../hooks/useConversationRowClick";
import { scopeThreadRef, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useParams } from "@tanstack/react-router";
import { ArchiveIcon, Edit03Icon, MoreHorizontalIcon } from "~/icons";
import { cn } from "../../lib/utils";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { useSidebar } from "../ui/sidebar";
import { SidebarSectionHeader, useSidebarSectionExpansion } from "../sidebar/SidebarSectionHeader";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useAgentSidebarPreferences } from "./agentSidebarPreferences";
import { AgentCreateMenu } from "./AgentCreateMenu";
import { useThreadActions } from "../../hooks/useThreadActions";
import { PinIcon } from "../../icons";
import { ChannelIcon } from "../../icons";
import { AgentAvatar } from "./AgentAvatar";
import { showAgentContextMenu } from "./agentContextMenu";
import { openAgentDialog } from "./agentDialogStore";
import { useAgentActions } from "./useAgentActions";
import { useAgents, type AgentRosterEntry } from "./useAgents";

export function AgentRoster({ inset = true }: { inset?: boolean }) {
  const active = useAgents().filter(({ project }) => !project.agentProfile?.archived);
  const hidden = useAgentSidebarPreferences((s) => s.hideEmptySection);
  const params = useParams({ strict: false });
  const { expanded, setExpanded } = useSidebarSectionExpansion("sidebar-agents");
  const { isMobile, setOpenMobile } = useSidebar();
  const createAgent = () => {
    setExpanded(true);
    openAgentDialog();
    if (isMobile) setOpenMobile(false);
  };
  if (hidden && active.length === 0) return null;

  return (
    <section
      aria-label="Agents"
      data-sidebar="group"
      className={cn("flex flex-col py-2", inset && "px-2")}
    >
      <SidebarSectionHeader
        label="Agents"
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      >
        <AgentCreateMenu small sections={false} onCreate={() => setExpanded(true)} />
      </SidebarSectionHeader>
      <div className="space-y-1">
        {(expanded
          ? active
          : active.filter(
              ({ project, thread }) =>
                params.environmentId === project.environmentId && thread?.id === params.threadId,
            )
        )
          .filter(({ thread }) => !thread?.pinnedAt)
          .toSorted((a, b) =>
            (b.thread?.updatedAt ?? b.project.updatedAt).localeCompare(
              a.thread?.updatedAt ?? a.project.updatedAt,
            ),
          )
          .map((agent) => (
            <AgentRow key={`${agent.project.environmentId}:${agent.project.id}`} {...agent} />
          ))}
      </div>
      {expanded && active.length === 0 ? (
        <button
          type="button"
          className="w-full cursor-pointer rounded-lg px-2.5 py-2 text-left text-xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={createAgent}
        >
          No agents yet
        </button>
      ) : null}
    </section>
  );
}

export function AgentRow(agent: AgentRosterEntry) {
  const { project, thread, busy } = agent;
  const { pinThread, confirmAndUnpinThread } = useThreadActions();
  const profile = project.agentProfile!;
  const params = useParams({ strict: false });
  const { isMobile, setOpenMobile } = useSidebar();
  const { pending, openConversation, archive } = useAgentActions(agent);
  const selected = params.environmentId === project.environmentId && thread?.id === params.threadId;
  const conversationClick = useConversationRowClick(
    () => {
      void openConversation().then((opened) => {
        if (opened && isMobile) setOpenMobile(false);
      });
    },
    () => {
      void openConversation({ newTab: true }).then((opened) => {
        if (opened && isMobile) setOpenMobile(false);
      });
    },
  );
  const status = thread ? resolveSidebarThreadStatus(thread) : "ready";
  return (
    <div
      data-agent-avatar-hover
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void showAgentContextMenu(
          scopeProjectRef(project.environmentId, project.id),
          {
            x: event.clientX,
            y: event.clientY,
          },
          !!profile.group,
          () => openConversation({ newTab: true }),
        ).then((opened) => {
          if (opened && isMobile) setOpenMobile(false);
        });
      }}
      className={cn(
        "group/agent-row relative flex w-full items-center rounded-md",
        selected
          ? "bg-sidebar-row-active text-sidebar-foreground hover:bg-sidebar-row-active"
          : "hover:bg-sidebar-row-hover",
      )}
    >
      <button
        type="button"
        disabled={!thread || profile.archived}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md pl-2.5 pr-14 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        )}
        {...conversationClick}
      >
        {profile.group ? (
          <ChannelIcon className="size-4" />
        ) : (
          <AgentAvatar avatar={profile.avatar} className="size-4" working={status === "working"} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-sidebar-foreground">{project.title}</span>
        </span>
        {busy ? (
          <span className="text-xs text-sidebar-muted-foreground">
            {status === "working" ? "Working" : status === "waiting" ? "Monitoring" : "Needs input"}
          </span>
        ) : null}
      </button>
      <div className="absolute top-1/2 right-0.5 flex -translate-y-1/2 items-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                disabled={pending || busy}
                aria-label={`Archive ${project.title}`}
                className={cn(
                  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60",
                  !selected &&
                    "opacity-0 max-sm:opacity-100 group-hover/agent-row:opacity-100 group-focus-within/agent-row:opacity-100",
                )}
                onClick={() => {
                  void archive();
                }}
              />
            }
          >
            <ArchiveIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup side="top">
            {profile.group ? "Archive channel" : "Archive agent"}
          </TooltipPopup>
        </Tooltip>
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                disabled={pending}
                aria-label={`Actions for ${project.title}`}
              />
            }
          >
            <MoreHorizontalIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem
              disabled={!thread}
              onClick={() => {
                if (thread) {
                  const target = scopeThreadRef(project.environmentId, thread.id);
                  void (thread.pinnedAt ? confirmAndUnpinThread(target) : pinThread(target));
                }
              }}
            >
              <PinIcon />
              {thread?.pinnedAt ? "Unpin" : "Pin"} {profile.group ? "channel" : "agent"}
            </MenuItem>
            <MenuItem
              onClick={() => {
                openAgentDialog(scopeProjectRef(project.environmentId, project.id));
                if (isMobile) setOpenMobile(false);
              }}
            >
              <Edit03Icon />
              {profile.group ? "Edit channel" : "Edit agent"}
            </MenuItem>
            <MenuItem
              disabled={busy}
              onClick={() => {
                void archive();
              }}
            >
              <ArchiveIcon />
              {profile.group ? "Archive channel" : "Archive agent"}
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  );
}

export function WorkspacePinnedAgents() {
  const agents = useAgents().filter(
    ({ project, thread }) => !project.agentProfile?.archived && thread?.pinnedAt,
  );
  return (
    <div className="space-y-1">
      {agents
        .toSorted((a, b) => (b.thread?.pinnedAt ?? "").localeCompare(a.thread?.pinnedAt ?? ""))
        .map((agent) => (
          <AgentRow key={`${agent.project.environmentId}:${agent.project.id}`} {...agent} />
        ))}
    </div>
  );
}
