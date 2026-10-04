import {
  ProjectId,
  type EnvironmentId,
  type AgentGetDelegationResult,
  type MessageId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useMemo } from "react";
import { CircleCheckIcon, CircleAlertIcon, SquareIcon, ChannelIcon } from "~/icons";
import { delegatedAgentsFromTurnItems } from "@t3tools/shared/agentMentions";
import { useDelegatedAgents } from "./useDelegatedAgents";
import { useProject, useThreadProjection, useThreadShell } from "~/state/entities";
import { UnresolvedChip } from "../contextChipParts";
import { openThreadOverviewAgent } from "../chat/threadOverviewStore";
import { AgentAvatar } from "./AgentAvatar";

export function AgentMentionChip({
  environmentId,
  contextId,
  label,
  copyMarkdown,
  allowArchived = false,
  status,
  onOpen,
}: {
  environmentId: EnvironmentId | null;
  contextId: string;
  label: string;
  copyMarkdown?: string;
  allowArchived?: boolean;
  status?: AgentGetDelegationResult["status"] | undefined;
  onOpen?: (() => void) | undefined;
}) {
  const project = useProject(
    environmentId ? scopeProjectRef(environmentId, ProjectId.make(contextId)) : null,
  );
  if (!project?.agentProfile || (project.agentProfile.archived && !allowArchived)) {
    return (
      <UnresolvedChip
        label={label}
        {...(copyMarkdown === undefined ? {} : { copyMarkdown })}
        tooltip="This agent is no longer available."
      />
    );
  }
  const working = status === "working" || status === "queued";
  const icon = project.agentProfile.group ? (
    <ChannelIcon aria-hidden className="size-[1em]" />
  ) : (
    <AgentAvatar avatar={project.agentProfile.avatar} className="size-[1em]" working={working} />
  );
  if (onOpen)
    return (
      <button
        type="button"
        aria-label={`View ${project.title} responses`}
        onClick={onOpen}
        data-markdown-copy={copyMarkdown}
        className="inline-flex max-w-full cursor-pointer items-center gap-1 align-middle rounded-sm font-semibold text-inherit focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-[1em]"
      >
        {icon}
        <span>{project.title}</span>
      </button>
    );
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 align-middle font-semibold text-inherit [&>svg]:size-[1em]"
      data-markdown-copy={copyMarkdown}
    >
      {icon}
      <span>{project.title}</span>
    </span>
  );
}

/** Sent tags follow only the task created by this source message. */
export function SentAgentMentionChip(
  props: Parameters<typeof AgentMentionChip>[0] & {
    sourceThreadRef: ScopedThreadRef | null;
    sourceMessageId: MessageId;
  },
) {
  const { sourceThreadRef, sourceMessageId, ...chip } = props;
  const source = useThreadProjection(sourceThreadRef);
  const sourceThread = useThreadShell(sourceThreadRef);
  const sourceProject = useProject(
    sourceThread && sourceThreadRef
      ? scopeProjectRef(sourceThreadRef.environmentId, sourceThread.projectId)
      : null,
  );
  const jobs = useMemo(
    () =>
      delegatedAgentsFromTurnItems(source?.projection.turnItems ?? []).filter(
        (job) => job.sourceMessageId === sourceMessageId && job.agentProjectId === chip.contextId,
      ),
    [source?.projection.turnItems, sourceMessageId, chip.contextId],
  );
  const agents = useDelegatedAgents(sourceThreadRef, jobs);
  const agent = agents[agents.length - 1];
  return (
    <AgentMentionChip
      {...chip}
      onOpen={
        sourceThreadRef && !sourceProject?.agentProfile?.group
          ? () => openThreadOverviewAgent(sourceThreadRef, ProjectId.make(chip.contextId))
          : undefined
      }
      status={agent?.data?.status ?? (agent?.working ? "working" : undefined)}
    />
  );
}

/** Progress belongs beside the acknowledgment for its source request. */
export function AgentMessageStatus({
  sourceThreadRef,
  sourceMessageId,
  agentProjectId,
}: {
  sourceThreadRef: ScopedThreadRef | null;
  sourceMessageId: MessageId;
  agentProjectId?: ProjectId;
}) {
  const source = useThreadProjection(sourceThreadRef);
  const jobs = useMemo(
    () =>
      delegatedAgentsFromTurnItems(source?.projection.turnItems ?? []).filter(
        (job) =>
          job.sourceMessageId === sourceMessageId &&
          (agentProjectId === undefined || job.agentProjectId === agentProjectId),
      ),
    [source?.projection.turnItems, sourceMessageId, agentProjectId],
  );
  const agents = useDelegatedAgents(sourceThreadRef, jobs);
  if (!agents.length) return null;
  const working = agents.some((agent) => agent.working);
  const completed = agents.every((agent) => agent.data?.status === "completed");
  const failed = agents.some(
    (agent) => agent.data?.status === "error" || agent.data?.status === "waiting",
  );
  return (
    <span
      role="status"
      className={`inline-flex h-5 items-center justify-center gap-1.5 whitespace-nowrap text-xs [&>svg]:size-4 ${working ? "text-info-foreground" : "text-muted-foreground"}`}
      aria-label={
        working
          ? "Agents working"
          : completed
            ? "Agents finished"
            : failed
              ? "Agents need attention"
              : "Agents stopped"
      }
    >
      {working ? (
        <>
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          Working
        </>
      ) : completed ? (
        <CircleCheckIcon aria-hidden />
      ) : failed ? (
        <CircleAlertIcon aria-hidden />
      ) : (
        <SquareIcon aria-hidden />
      )}
    </span>
  );
}
