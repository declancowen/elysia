import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ArchiveIcon, BotIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { AgentAvatar } from "./AgentAvatar";
import { showAgentContextMenu } from "./agentContextMenu";
import { openAgentDialog } from "./agentDialogStore";
import { useAgentActions } from "./useAgentActions";
import { useAgents, type AgentRosterEntry } from "./useAgents";

export function AgentDetailsPopover({ projectRef }: { projectRef: ScopedProjectRef | null }) {
  const agents = useAgents();
  const current = agents.find(
    ({ project }) =>
      project.environmentId === projectRef?.environmentId && project.id === projectRef.projectId,
  );
  const active = agents.filter(({ project }) => !project.agentProfile!.archived);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const close = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={current ? `Manage ${current.project.title}` : "Agents"}
            title="Agents"
          />
        }
      >
        <BotIcon className="size-4" />
      </PopoverTrigger>
      <PopoverPopup width="md" align="end">
        <div className="space-y-4">
          {current ? (
            <AgentDetails agent={current} onClose={close} />
          ) : (
            <>
              <PopoverTitle>Agents</PopoverTitle>
              <div className="space-y-1">
                {active.map((agent) => (
                  <AgentListRow
                    key={`${agent.project.environmentId}:${agent.project.id}`}
                    agent={agent}
                    onClose={close}
                  />
                ))}
                {active.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Create an agent with its own role, conversation and memory.
                  </p>
                ) : null}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  close();
                  openAgentDialog();
                }}
              >
                <PlusIcon />
                Create agent
              </Button>
            </>
          )}
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                close();
                void navigate({ to: "/settings/archived" });
              }}
            >
              Archived agents
            </Button>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function AgentDetails({ agent, onClose }: { agent: AgentRosterEntry; onClose: () => void }) {
  const { project, busy } = agent;
  const profile = project.agentProfile!;
  const { pending, archive } = useAgentActions(agent);
  return (
    <>
      <div className="flex items-center gap-3">
        <AgentAvatar avatar={profile.avatar} />
        <div className="min-w-0 space-y-1 break-words">
          <PopoverTitle>{project.title}</PopoverTitle>
          {profile.title ? <p className="text-xs text-muted-foreground">{profile.title}</p> : null}
        </div>
      </div>
      {project.defaultModelSelection ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Default model</p>
          <p className="break-words text-sm">{project.defaultModelSelection.model}</p>
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Instructions</p>
        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm">
          {profile.instructions}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            onClose();
            openAgentDialog(scopeProjectRef(project.environmentId, project.id));
          }}
        >
          <PencilIcon />
          Edit agent
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || busy || profile.archived}
          onClick={() => {
            void archive().then((archived) => {
              if (archived) onClose();
            });
          }}
        >
          <ArchiveIcon />
          {pending ? "Archiving…" : "Archive"}
        </Button>
      </div>
      {busy ? (
        <p className="text-xs text-muted-foreground">
          Wait for the current task to finish before making changes.
        </p>
      ) : null}
    </>
  );
}

function AgentListRow({ agent, onClose }: { agent: AgentRosterEntry; onClose: () => void }) {
  const { project, thread } = agent;
  const { pending, openConversation } = useAgentActions(agent);
  const profile = project.agentProfile!;
  return (
    <button
      type="button"
      disabled={pending || !thread}
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        void showAgentContextMenu(scopeProjectRef(project.environmentId, project.id), {
          x: event.clientX,
          y: event.clientY,
        });
      }}
      onClick={() => {
        void openConversation().then((opened) => {
          if (opened) onClose();
        });
      }}
    >
      <AgentAvatar avatar={profile.avatar} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{project.title}</span>
        {profile.title ? (
          <span className="block truncate text-xs text-muted-foreground">{profile.title}</span>
        ) : null}
      </span>
    </button>
  );
}
