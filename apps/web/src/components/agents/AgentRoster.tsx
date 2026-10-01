import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useParams } from "@tanstack/react-router";
import { ArchiveIcon, MoreHorizontalIcon, PencilIcon, PlusIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { useSidebar } from "../ui/sidebar";
import { SidebarSectionHeader, useSidebarSectionExpansion } from "../sidebar/SidebarSectionHeader";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { AgentAvatar } from "./AgentAvatar";
import { showAgentContextMenu } from "./agentContextMenu";
import { openAgentDialog } from "./agentDialogStore";
import { useAgentActions } from "./useAgentActions";
import { useAgents, type AgentRosterEntry } from "./useAgents";

export function AgentRoster({ inset = true }: { inset?: boolean }) {
  const active = useAgents().filter(({ project }) => !project.agentProfile?.archived);
  const { expanded, setExpanded } = useSidebarSectionExpansion("sidebar-agents");
  const { isMobile, setOpenMobile } = useSidebar();
  const createAgent = () => {
    setExpanded(true);
    openAgentDialog();
    if (isMobile) setOpenMobile(false);
  };
  return (
    <section aria-label="Agents" className={cn("pb-3", inset && "px-2")}>
      <SidebarSectionHeader
        label="Agents"
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      >
        <Button
          type="button"
          size="icon-xs"
          variant="ghost-muted"
          aria-label="Create new agent"
          onClick={createAgent}
        >
          <PlusIcon />
        </Button>
      </SidebarSectionHeader>
      {expanded &&
        active.map((agent) => (
          <AgentRow key={`${agent.project.environmentId}:${agent.project.id}`} {...agent} />
        ))}
      {expanded && active.length === 0 ? (
        <button
          type="button"
          className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={createAgent}
        >
          Create your first agent
        </button>
      ) : null}
    </section>
  );
}

function AgentRow(agent: AgentRosterEntry) {
  const { project, thread, busy } = agent;
  const profile = project.agentProfile!;
  const params = useParams({ strict: false });
  const { isMobile, setOpenMobile } = useSidebar();
  const { pending, openConversation, archive } = useAgentActions(agent);
  const selected = params.environmentId === project.environmentId && thread?.id === params.threadId;
  const status = thread ? resolveSidebarThreadStatus(thread) : "ready";
  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void showAgentContextMenu(scopeProjectRef(project.environmentId, project.id), {
          x: event.clientX,
          y: event.clientY,
        }).then((opened) => {
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
        disabled={!thread || profile.archived || pending}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md pl-2.5 pr-14 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        )}
        onClick={() => {
          void openConversation().then((opened) => {
            if (opened && isMobile) setOpenMobile(false);
          });
        }}
      >
        <AgentAvatar avatar={profile.avatar} className="size-4" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-sidebar-foreground">{project.title}</span>
          {profile.title ? (
            <span className="block truncate text-xs text-sidebar-muted-foreground">
              {profile.title}
            </span>
          ) : null}
        </span>
        {busy ? (
          <span className="text-xs text-sidebar-muted-foreground">
            {status === "working"
              ? "Working"
              : status === "monitoring"
                ? "Monitoring"
                : "Needs input"}
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
                  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-icon-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60",
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
          <TooltipPopup side="top">Archive agent</TooltipPopup>
        </Tooltip>
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-icon-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                disabled={pending}
                aria-label={`Actions for ${project.title}`}
              />
            }
          >
            <MoreHorizontalIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem
              onClick={() => {
                openAgentDialog(scopeProjectRef(project.environmentId, project.id));
                if (isMobile) setOpenMobile(false);
              }}
            >
              <PencilIcon />
              Edit agent
            </MenuItem>
            <MenuItem
              disabled={busy}
              onClick={() => {
                void archive();
              }}
            >
              <ArchiveIcon />
              Archive agent
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  );
}
