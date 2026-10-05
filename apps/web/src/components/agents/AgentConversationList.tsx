import { useConversationTabsStore } from "../../conversationTabsStore";
import { useState } from "react";
import { useConversationRowClick } from "../../hooks/useConversationRowClick";
import {
  scopedProjectKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { AgentConversationPreviewsResult } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { agentTaskHandoff } from "@t3tools/shared/agentMentions";
import {
  ArchiveIcon,
  Edit03Icon,
  MoreHorizontalIcon,
  SquareArrowOutUpRightIcon,
} from "../../icons";
import { stripInlineContextReferences } from "../../lib/composerContextReferences";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Spinner } from "../ui/spinner";
import { useSidebar } from "../ui/sidebar";
import { useSidebarRowDrag } from "../sidebar/SidebarOrderedList";
import { AgentSidebarSections, AgentOrganizationMenuItems } from "./AgentSidebarOrganization";
import { AgentGroupAvatar } from "./AgentGroupAvatar";
import { AgentAvatar } from "./AgentAvatar";
import { openAgentDialog } from "./agentDialogStore";
import { setAgentSidebarActive } from "./agentSidebarStore";
import { useAgentActions } from "./useAgentActions";
import type { AgentRosterEntry } from "./useAgents";
import { useAgentConversationPreviews } from "./useAgentConversationPreviews";

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

export function AgentConversationList({
  agents,
  ready,
  query = "",
}: {
  agents: readonly AgentRosterEntry[];
  ready: boolean;
  query?: string;
}) {
  const { previews, loading, failed } = useAgentConversationPreviews(agents);
  const previewFor = ({ project }: AgentRosterEntry) =>
    previews.get(scopedProjectKey(scopeProjectRef(project.environmentId, project.id)));
  const search = query.trim().toLocaleLowerCase();
  const active = agents
    .filter(
      ({ project }) =>
        !project.agentProfile!.archived &&
        (!search ||
          `${project.title} ${project.agentProfile!.title ?? ""}`
            .toLocaleLowerCase()
            .includes(search)),
    )
    .toSorted((left, right) =>
      (
        previewFor(right)?.updatedAt ??
        right.thread?.updatedAt ??
        right.project.updatedAt
      ).localeCompare(
        previewFor(left)?.updatedAt ?? left.thread?.updatedAt ?? left.project.updatedAt,
      ),
    );
  if (!ready && !active.length)
    return (
      <div
        role="status"
        className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-muted-foreground"
      >
        <Spinner size="sm" />
        Loading agents…
      </div>
    );
  if (!active.length)
    return (
      <p className="px-3 py-2 text-sm text-sidebar-muted-foreground">
        {search ? "No matching agents." : "No agents yet."}
      </p>
    );
  return (
    <AgentSidebarSections
      agents={active}
      updatedAt={(agent) =>
        previewFor(agent)?.updatedAt ?? agent.thread?.updatedAt ?? agent.project.updatedAt
      }
      renderRow={(agent, pinned) => (
        <AgentConversationRow
          agent={agent}
          agents={agents}
          preview={previewFor(agent)}
          loading={loading}
          failed={failed}
          pinned={pinned}
        />
      )}
    />
  );
}

function AgentConversationRow({
  agent,
  agents,
  preview: conversationPreview,
  loading,
  failed,
  pinned = false,
}: {
  pinned?: boolean;
  agent: AgentRosterEntry;
  agents: readonly AgentRosterEntry[];
  preview: AgentConversationPreviewsResult[number] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const drag = useSidebarRowDrag();
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null);
  const { project, thread, busy } = agent;
  const profile = project.agentProfile!;
  const alreadyOpen = useConversationTabsStore((state) =>
    thread
      ? state.isOpen({
          kind: "server",
          threadRef: scopeThreadRef(project.environmentId, thread.id),
        })
      : false,
  );
  const { pending, openConversation, archive } = useAgentActions(agent);
  const params = useParams({ strict: false });
  const { isMobile, setOpenMobile } = useSidebar();
  const selected = params.environmentId === project.environmentId && params.threadId === thread?.id;
  const conversationClick = useConversationRowClick(
    () => {
      setAgentSidebarActive(true);
      void openConversation().then((opened) => {
        if (opened && isMobile) setOpenMobile(false);
      });
    },
    () => {
      setAgentSidebarActive(true);
      void openConversation({ newTab: true }).then((opened) => {
        if (opened && isMobile) setOpenMobile(false);
      });
    },
  );
  const memberIds = profile.group?.memberProjectIds;
  const members = memberIds
    ? agents.filter(
        ({ project: candidate }) =>
          candidate.environmentId === project.environmentId && memberIds.includes(candidate.id),
      )
    : [];
  const latestText = conversationPreview?.text ?? "";
  const handoff = agentTaskHandoff({ text: latestText });
  const preview =
    stripInlineContextReferences(handoff?.ask ?? latestText).trim() ||
    (loading ? "Loading…" : failed ? "Preview unavailable" : "No messages yet");
  const updatedAt = conversationPreview?.updatedAt ?? thread?.updatedAt ?? project.updatedAt;
  return (
    <Menu
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) setContextPoint(null);
      }}
    >
      <div
        data-agent-avatar-hover
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (pending) return;
          setContextPoint({ x: event.clientX, y: event.clientY });
          setMenuOpen(true);
        }}
        className={cn(
          "group/agent-row relative flex min-w-0 rounded-xl hover:bg-sidebar-row-hover focus-within:bg-sidebar-row-hover",
          pinned ? "h-22 items-start px-1.5 py-1.5" : "h-12 items-center px-2.5 py-1.5",
          pinned && drag?.isDragging && "bg-sidebar-row-hover",
          selected &&
            "bg-sidebar-row-active hover:bg-sidebar-row-active focus-within:bg-sidebar-row-active",
        )}
      >
        <button
          type="button"
          ref={pinned ? drag?.setActivatorNodeRef : undefined}
          {...(pinned ? drag?.attributes : undefined)}
          {...(pinned ? drag?.listeners : undefined)}
          aria-label={`Open ${project.title} chat`}
          aria-current={selected ? "page" : undefined}
          {...conversationClick}
          disabled={!thread}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer items-center outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
            pinned ? "touch-none flex-col gap-1 text-center" : "gap-2 text-left",
          )}
        >
          {profile.group ? (
            <AgentGroupAvatar
              avatars={members.map(({ project: member }) => member.agentProfile!.avatar)}
              className={pinned ? "size-8" : "size-7"}
            />
          ) : (
            <AgentAvatar
              avatar={profile.avatar}
              className={pinned ? "size-8" : "size-7"}
              working={busy}
            />
          )}
          {pinned ? (
            <span className="flex w-full min-w-0 flex-col items-center gap-0.5">
              <span className="w-full truncate text-sm font-medium text-foreground">
                {project.title}
              </span>
              {profile.title && !profile.group ? (
                <span className="max-w-full truncate rounded-md bg-foreground/15 px-1.5 text-xs text-foreground">
                  {profile.title}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-medium leading-4 text-foreground">
                    {project.title}
                  </span>
                  {profile.title && !profile.group ? (
                    <span className="min-w-0 truncate rounded-md bg-foreground/15 px-1.5 text-2xs text-foreground">
                      {profile.title}
                    </span>
                  ) : null}
                </span>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={updatedAt}>
                  {dateFormat.format(new Date(updatedAt))}
                </time>
              </span>
              <span className="truncate pr-5 text-xs leading-4 text-foreground/70">{preview}</span>
            </span>
          )}
        </button>
        <div
          className={cn(
            "absolute opacity-0 group-hover/agent-row:opacity-100 group-focus-within/agent-row:opacity-100 has-[[data-popup-open]]:opacity-100 max-md:opacity-100",
            pinned ? "right-0 top-0" : "bottom-1.5 right-2.5",
          )}
        >
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={`Actions for ${project.title}`}
              />
            }
          >
            <MoreHorizontalIcon />
          </MenuTrigger>
          <MenuPopup
            align={contextPoint ? "start" : "end"}
            anchor={
              contextPoint
                ? {
                    getBoundingClientRect: () => new DOMRect(contextPoint.x, contextPoint.y, 0, 0),
                  }
                : undefined
            }
          >
            {!alreadyOpen && thread ? (
              <MenuItem
                disabled={pending}
                onClick={() => {
                  setAgentSidebarActive(true);
                  void openConversation({ newTab: true }).then((opened) => {
                    if (opened && isMobile) setOpenMobile(false);
                  });
                }}
              >
                <SquareArrowOutUpRightIcon />
                Open in new tab
              </MenuItem>
            ) : null}
            <AgentOrganizationMenuItems agent={agent} />
            <MenuItem
              onClick={() => openAgentDialog(scopeProjectRef(project.environmentId, project.id))}
            >
              <Edit03Icon />
              {profile.group ? "Edit channel" : "Edit agent"}
            </MenuItem>
            <MenuItem disabled={busy} onClick={() => void archive()}>
              <ArchiveIcon />
              {profile.group ? "Archive channel" : "Archive agent"}
            </MenuItem>
          </MenuPopup>
        </div>
      </div>
    </Menu>
  );
}
