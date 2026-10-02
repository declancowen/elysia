import {
  ProjectId,
  type EnvironmentId,
  type AgentGetDelegationResult,
  type MessageId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useMemo } from "react";
import { CheckIcon, CircleAlertIcon, SquareIcon } from "lucide-react";
import { delegatedAgentsFromActivities } from "@t3tools/shared/agentMentions";
import { useDelegatedAgents } from "./useDelegatedAgents";
import { Spinner } from "../ui/spinner";
import { useProject, useThreadDetail } from "~/state/entities";
import { ContextChipShell, UnresolvedChip } from "../contextChipParts";
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
  const statusIcon = working ? (
    <Spinner size="xs" aria-label="Agent working" />
  ) : status === "completed" ? (
    <CheckIcon aria-label="Agent finished" />
  ) : status === "error" ? (
    <CircleAlertIcon aria-label="Agent failed" />
  ) : status === "waiting" ? (
    <CircleAlertIcon aria-label="Agent needs input" />
  ) : status === "interrupted" ? (
    <SquareIcon aria-label="Agent stopped" />
  ) : null;
  if (onOpen)
    return (
      <button
        type="button"
        aria-label={`View ${project.title} responses`}
        onClick={onOpen}
        data-markdown-copy={copyMarkdown}
        className="inline-flex max-w-full cursor-pointer items-center gap-1 align-middle rounded-sm font-semibold text-inherit focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-[1em]"
      >
        <AgentAvatar
          avatar={project.agentProfile.avatar}
          className="size-[1em]"
          working={working}
        />
        <span>{project.title}</span>
        {statusIcon}
      </button>
    );
  return (
    <ContextChipShell
      kind="mention"
      icon={
        <>
          <AgentAvatar avatar={project.agentProfile.avatar} working={working} />
          {statusIcon}
        </>
      }
      label={project.title}
      data-markdown-copy={copyMarkdown}
      tooltip="This task continues in the agent’s own chat."
    />
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
  const source = useThreadDetail(sourceThreadRef);
  const jobs = useMemo(
    () =>
      delegatedAgentsFromActivities(source?.activities ?? []).filter(
        (job) => job.sourceMessageId === sourceMessageId && job.agentProjectId === chip.contextId,
      ),
    [source?.activities, sourceMessageId, chip.contextId],
  );
  const agents = useDelegatedAgents(sourceThreadRef, jobs);
  const agent = agents[agents.length - 1];
  return (
    <AgentMentionChip
      {...chip}
      onOpen={
        sourceThreadRef
          ? () => openThreadOverviewAgent(sourceThreadRef, ProjectId.make(chip.contextId))
          : undefined
      }
      status={agent?.data?.status ?? (agent?.working ? "working" : undefined)}
    />
  );
}
