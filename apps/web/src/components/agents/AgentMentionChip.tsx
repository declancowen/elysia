import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useProject } from "~/state/entities";
import { ContextChipShell, UnresolvedChip } from "../contextChipParts";
import { AgentAvatar } from "./AgentAvatar";

export function AgentMentionChip({
  environmentId,
  contextId,
  label,
  copyMarkdown,
  allowArchived = false,
}: {
  environmentId: EnvironmentId | null;
  contextId: string;
  label: string;
  copyMarkdown?: string;
  allowArchived?: boolean;
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
  return (
    <ContextChipShell
      kind="mention"
      icon={<AgentAvatar avatar={project.agentProfile.avatar} />}
      label={`@${project.title}`}
      data-markdown-copy={copyMarkdown}
      tooltip="This task continues in the agent’s own chat."
    />
  );
}
