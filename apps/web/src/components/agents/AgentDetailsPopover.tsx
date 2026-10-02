import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ArchiveIcon, ArchiveX, BotIcon, Edit03Icon } from "~/icons";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { AgentAvatar } from "./AgentAvatar";
import { openAgentDialog } from "./agentDialogStore";
import { useAgentActions } from "./useAgentActions";
import { useAgents, type AgentRosterEntry } from "./useAgents";

export function AgentDetailsPopover({ projectRef }: { projectRef: ScopedProjectRef | null }) {
  const agents = useAgents();
  const current = agents.find(
    ({ project }) =>
      project.environmentId === projectRef?.environmentId && project.id === projectRef.projectId,
  );
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const close = () => setOpen(false);
  if (!current) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Manage ${current.project.title}`}
            title="Agents"
          />
        }
      >
        <BotIcon className="size-4" />
      </PopoverTrigger>
      <PopoverPopup width="md" align="end">
        <div className="space-y-4">
          <AgentDetails agent={current} onClose={close} />
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                close();
                void navigate({ to: "/settings/archived" });
              }}
            >
              <ArchiveX />
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
  const labelRef = useRef<HTMLDivElement>(null);
  const [avatarSize, setAvatarSize] = useState(profile.title ? 34 : 14);
  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    const measure = () => {
      const height = Math.ceil(label.getBoundingClientRect().height);
      if (height > 0) setAvatarSize(Math.min(height, 64));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div className="flex items-center gap-3" data-agent-avatar-hover>
        <div className="flex shrink-0 items-center justify-center">
          <AgentAvatar
            avatar={profile.avatar}
            style={{ width: avatarSize, height: avatarSize }}
            working={busy}
          />
        </div>
        <div ref={labelRef} className="min-w-0 flex-1 space-y-1 break-words">
          <PopoverTitle>{project.title}</PopoverTitle>
          {profile.title ? (
            <p className="w-fit rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
              {profile.title}
            </p>
          ) : null}
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
          <Edit03Icon />
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
