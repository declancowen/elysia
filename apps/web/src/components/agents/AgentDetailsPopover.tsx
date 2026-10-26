import { scopeProjectRef } from "@elysiatools/client-runtime/environment";
import { observeResize } from "~/lib/observeResize";
import type { ScopedProjectRef } from "@elysiatools/contracts";
import { useClientSettings } from "../../hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "../../logicalProject";
import { useNavigate } from "@tanstack/react-router";
import { ArchiveIcon, ArchiveX, BubblesIcon, ClockIcon, Edit03Icon, ChannelIcon } from "~/icons";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { usePanelAnimationSettings } from "../../panelAnimations";
import { useStableCallback } from "../../hooks/useStableCallback";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { AgentAvatar } from "./AgentAvatar";
import { openAgentDialog } from "./agentDialogStore";
import { useAgentActions } from "./useAgentActions";
import { ClearAgentChatButton } from "./ClearAgentChatButton";
import { useAgents, type AgentRosterEntry } from "./useAgents";

export function AgentDetailsPopover({
  projectRef,
  defaultOpen = false,
  threadBoundaryRef,
  open: controlledOpen,
  onOpenChange,
  wide = false,
}: {
  projectRef: ScopedProjectRef | null;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  wide?: boolean;
  threadBoundaryRef?: RefObject<HTMLElement | null>;
}) {
  const { active: animated, durationMs } = usePanelAnimationSettings();
  const agents = useAgents();
  const current = agents.find(
    ({ project }) =>
      project.environmentId === projectRef?.environmentId && project.id === projectRef.projectId,
  );
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [collisionBoundary, setCollisionBoundary] = useState<HTMLElement | null>(null);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onOpenChange?.(value);
  };
  const anchorRef = useRef<HTMLSpanElement>(null);
  const attachAnchor = useStableCallback((element: HTMLSpanElement | null) => {
    anchorRef.current = element;
    if (!element) {
      setCollisionBoundary(null);
      return;
    }
    const boundary =
      threadBoundaryRef?.current ??
      element?.closest<HTMLElement>("[data-chat-column-maximized-away]") ??
      null;
    setCollisionBoundary(
      boundary?.closest<HTMLElement>("[data-chat-workspace-panels]") ?? boundary,
    );
  });
  const navigate = useNavigate();
  const close = () => setOpen(false);
  if (!current) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(value, details) => {
        if (
          wide &&
          !value &&
          details.reason === "outside-press" &&
          details.event.target instanceof Element &&
          details.event.target.closest("[data-thread-overview-trigger]")
        ) {
          details.cancel();
          return;
        }
        setOpen(value);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            data-agent-details-trigger
            aria-label={`Manage ${current.project.title}`}
            title="Agents"
          />
        }
      >
        {current.project.agentProfile?.group ? (
          <ChannelIcon className="size-4" />
        ) : (
          <BubblesIcon className="size-4" />
        )}
      </PopoverTrigger>
      {threadBoundaryRef ? (
        <span
          ref={attachAnchor}
          aria-hidden
          className="pointer-events-none absolute top-full right-3 size-0"
        />
      ) : null}
      <PopoverPopup
        width="md"
        variant="floating"
        style={{ transitionDuration: animated ? `${durationMs}ms` : "0ms" }}
        align="end"
        {...(threadBoundaryRef ? { anchor: anchorRef, sideOffset: 12 } : {})}
        {...(collisionBoundary
          ? {
              collisionBoundary,
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
              {current.project.agentProfile?.group ? "Archived channels" : "Archived agents"}
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
  const members = useAgents().filter(
    ({ project: member }) =>
      member.environmentId === project.environmentId &&
      profile.group?.memberProjectIds.includes(member.id),
  );
  const { pending, archive } = useAgentActions(agent);
  const navigate = useNavigate();
  const grouping = useClientSettings(selectProjectGroupingSettings);
  const labelRef = useRef<HTMLDivElement>(null);
  const [avatarSize, setAvatarSize] = useState(profile.title ? 34 : 14);
  // oxlint-disable-next-line elysia/react-effect-budget -- Match the avatar to the committed label DOM height and own its resize observation.
  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    const measure = () => {
      const height = Math.ceil(label.getBoundingClientRect().height);
      if (height > 0) setAvatarSize(Math.min(height, 64));
    };
    measure();
    return observeResize(label, measure);
  }, []);
  return (
    <>
      <div className="flex items-center gap-3" data-agent-avatar-hover>
        <div className="flex shrink-0 items-center justify-center">
          {profile.group ? (
            <ChannelIcon className="size-5" />
          ) : (
            <AgentAvatar
              avatar={profile.avatar}
              style={{ width: avatarSize, height: avatarSize }}
              working={busy}
            />
          )}
        </div>
        <div ref={labelRef} className="flex min-w-0 flex-1 flex-col gap-2 break-words">
          <PopoverTitle>{project.title}</PopoverTitle>
          {profile.title && !profile.group ? (
            <p className="w-fit rounded-md bg-foreground/15 px-1.5 py-0.5 text-2xs text-foreground">
              {profile.title}
            </p>
          ) : null}
        </div>
      </div>
      {profile.group ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Members</p>
          <ul className="space-y-2">
            {members.map(({ project: member }) => (
              <li key={member.id} className="flex items-center gap-2 text-sm">
                <AgentAvatar avatar={member.agentProfile!.avatar} className="size-5" />
                {member.title}
              </li>
            ))}
          </ul>
        </div>
      ) : project.defaultModelSelection ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Default model</p>
          <p className="break-words text-sm">{project.defaultModelSelection.model}</p>
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {profile.group ? "Channel description" : "Instructions"}
        </p>
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
          {profile.group ? "Edit channel" : "Edit agent"}
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
          {pending ? "Archiving…" : profile.group ? "Archive channel" : "Archive agent"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
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
          <ClockIcon />
          Scheduled
        </Button>
        {agent.thread ? (
          <ClearAgentChatButton
            key={agent.thread.id}
            target={{
              projectId: project.id,
              threadRef: { environmentId: project.environmentId, threadId: agent.thread.id },
              name: project.title,
              channel: !!profile.group,
            }}
          />
        ) : null}
      </div>
      {busy ? (
        <p className="text-xs text-muted-foreground">
          Wait for the current task to finish before making changes.
        </p>
      ) : null}
    </>
  );
}
