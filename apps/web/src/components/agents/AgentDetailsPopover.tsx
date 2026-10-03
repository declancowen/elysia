import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useClientSettings } from "../../hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "../../logicalProject";
import { useNavigate } from "@tanstack/react-router";
import { ArchiveIcon, ArchiveX, BotIcon, CalendarClockIcon, Edit03Icon } from "~/icons";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { AgentAvatar } from "./AgentAvatar";
import { openAgentDialog } from "./agentDialogStore";
import { useAgentActions } from "./useAgentActions";
import { useAgents, type AgentRosterEntry } from "./useAgents";

export function AgentDetailsPopover({
  projectRef,
  defaultOpen = false,
  threadBoundaryRef,
}: {
  projectRef: ScopedProjectRef | null;
  defaultOpen?: boolean;
  threadBoundaryRef?: RefObject<HTMLElement | null>;
}) {
  const agents = useAgents();
  const current = agents.find(
    ({ project }) =>
      project.environmentId === projectRef?.environmentId && project.id === projectRef.projectId,
  );
  const [open, setOpen] = useState(defaultOpen);
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
      <PopoverPopup
        width="md"
        align="end"
        {...(threadBoundaryRef?.current
          ? {
              collisionBoundary:
                threadBoundaryRef.current.getAttribute("data-chat-column-maximized-away") === "true"
                  ? (threadBoundaryRef.current.closest<HTMLElement>(
                      "[data-chat-workspace-panels]",
                    ) ?? threadBoundaryRef.current)
                  : threadBoundaryRef.current,
              collisionPadding: 12,
              collisionAvoidance: { side: "shift", align: "shift", fallbackAxisSide: "none" },
              sticky: true,
            }
          : {})}
      >
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
  const navigate = useNavigate();
  const grouping = useClientSettings(selectProjectGroupingSettings);
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
        <div ref={labelRef} className="flex min-w-0 flex-1 flex-col gap-2 break-words">
          <PopoverTitle>{project.title}</PopoverTitle>
          {profile.title ? (
            <p className="w-fit rounded-md bg-foreground/15 px-1.5 py-0.5 text-2xs text-foreground">
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
      <div className="flex flex-wrap items-center gap-2">
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
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onClose();
            void navigate({
              to: "/settings/scheduled-tasks",
              search: {
                project: deriveLogicalProjectKeyFromSettings(project, grouping),
                machine: project.environmentId,
                checkout: undefined,
              },
            });
          }}
        >
          <CalendarClockIcon />
          Scheduled
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
