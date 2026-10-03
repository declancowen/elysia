import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { AgentConversationPreviewsResult } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { agentTaskHandoff } from "@t3tools/shared/agentMentions";
import { ArchiveIcon, Edit03Icon, MoreHorizontalIcon } from "../../icons";
import { stripInlineContextReferences } from "../../lib/composerContextReferences";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Spinner } from "../ui/spinner";
import { useSidebar } from "../ui/sidebar";
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
    <div className="space-y-1">
      {active.map((agent) => (
        <AgentConversationRow
          key={`${agent.project.environmentId}:${agent.project.id}`}
          agent={agent}
          agents={agents}
          preview={previewFor(agent)}
          loading={loading}
          failed={failed}
        />
      ))}
    </div>
  );
}

function AgentConversationRow({
  agent,
  agents,
  preview: conversationPreview,
  loading,
  failed,
}: {
  agent: AgentRosterEntry;
  agents: readonly AgentRosterEntry[];
  preview: AgentConversationPreviewsResult[number] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const { project, thread, busy } = agent;
  const profile = project.agentProfile!;
  const { pending, openConversation, archive } = useAgentActions(agent);
  const params = useParams({ strict: false });
  const { isMobile, setOpenMobile } = useSidebar();
  const selected = params.environmentId === project.environmentId && params.threadId === thread?.id;
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
    <div
      data-agent-avatar-hover
      className={cn(
        "group/agent-row relative flex min-w-0 items-center rounded-xl px-3 py-3 hover:bg-sidebar-row-hover focus-within:bg-sidebar-row-hover",
        selected &&
          "bg-sidebar-row-active hover:bg-sidebar-row-active focus-within:bg-sidebar-row-active",
      )}
    >
      <button
        type="button"
        aria-label={`Open ${project.title} chat`}
        aria-current={selected ? "page" : undefined}
        onClick={() => {
          setAgentSidebarActive(true);
          void openConversation().then((opened) => {
            if (opened && isMobile) setOpenMobile(false);
          });
        }}
        disabled={!thread || pending}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        {profile.group ? (
          <AgentGroupAvatar
            avatars={members.map(({ project: member }) => member.agentProfile!.avatar)}
          />
        ) : (
          <AgentAvatar avatar={profile.avatar} className="size-11" working={busy} />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 flex items-center gap-2">
              <span className="max-w-full shrink-0 truncate text-base font-medium">
                {project.title}
              </span>
              {profile.title && !profile.group ? (
                <span className="min-w-0 truncate rounded-md bg-foreground/15 px-1.5 py-0.5 text-xs text-foreground">
                  {profile.title}
                </span>
              ) : null}
            </span>
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={updatedAt}>
              {dateFormat.format(new Date(updatedAt))}
            </time>
          </span>
          <span className="truncate pr-5 text-sm text-muted-foreground">{preview}</span>
        </span>
      </button>
      <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover/agent-row:opacity-100 group-focus-within/agent-row:opacity-100 has-[[data-popup-open]]:opacity-100 max-md:opacity-100">
        <Menu>
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
          <MenuPopup align="end">
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
        </Menu>
      </div>
    </div>
  );
}
