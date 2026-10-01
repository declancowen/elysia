import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useParams } from "@tanstack/react-router";
import { ArchiveIcon, MoreHorizontalIcon, PencilIcon, PlusIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { useSidebar } from "../ui/sidebar";
import { AgentAvatar } from "./AgentAvatar";
import { showAgentContextMenu } from "./agentContextMenu";
import { openAgentDialog } from "./agentDialogStore";
import { useAgentActions } from "./useAgentActions";
import { useAgents, type AgentRosterEntry } from "./useAgents";

export function AgentRoster() {
  const active = useAgents().filter(({ project }) => !project.agentProfile?.archived);
  return (
    <section aria-label="Agents" className="px-2 pb-2">
      <div className="flex h-8 items-center justify-between px-2.5">
        <span className="text-xs font-medium text-sidebar-muted-foreground/80">Agents</span>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Create new agent"
          onClick={() => openAgentDialog()}
        >
          <PlusIcon />
        </Button>
      </div>
      {active.map((agent) => (
        <AgentRow key={`${agent.project.environmentId}:${agent.project.id}`} {...agent} />
      ))}
      {active.length === 0 ? (
        <button
          type="button"
          className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => openAgentDialog()}
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
        });
      }}
      className={cn(
        "group flex items-center gap-1 rounded-lg",
        selected && "bg-sidebar-row-active text-sidebar-foreground",
      )}
    >
      <button
        type="button"
        disabled={!thread || profile.archived || pending}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          selected ? "hover:bg-sidebar-row-active" : "hover:bg-sidebar-row-hover",
        )}
        onClick={() => {
          void openConversation().then((opened) => {
            if (opened && isMobile) setOpenMobile(false);
          });
        }}
      >
        <AgentAvatar avatar={profile.avatar} />
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
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={pending}
              aria-label={`Actions for ${project.title}`}
            />
          }
        >
          <MoreHorizontalIcon />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem
            onClick={() => openAgentDialog(scopeProjectRef(project.environmentId, project.id))}
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
  );
}
