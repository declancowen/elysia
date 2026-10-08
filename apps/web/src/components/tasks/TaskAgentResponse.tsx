import { useMemo } from "react";
import { delegatedAgentsFromTurnItems } from "@elysiatools/shared/agentMentions";
import { useDelegatedAgents } from "../agents/useDelegatedAgents";
import { WorkspaceItemContextChip } from "../WorkspaceItemContextChip";
import type { EnvironmentId, ThreadId, WorkTaskId } from "@elysiatools/contracts";
import { scopeThreadRef, scopeProjectRef } from "@elysiatools/client-runtime/environment";
import {
  useThreadProjection,
  useThreadHistory,
  useThreadShell,
  useProject,
} from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import { threadEnvironment } from "../../state/threads";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { isTaskRequest, taskResponses } from "./taskViews";

export function TaskAgentResponse({
  environmentId,
  threadId,
  taskId,
  taskTitle,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  taskId: WorkTaskId;
  taskTitle: string;
}) {
  const ref = useMemo(() => scopeThreadRef(environmentId, threadId), [environmentId, threadId]);
  const source = useThreadProjection(ref);
  const shell = useThreadShell(ref);
  const project = useProject(shell ? scopeProjectRef(environmentId, shell.projectId) : null);
  const history = useThreadHistory(ref);
  const loadEarlier = useAtomCommand(threadEnvironment.loadEarlierHistory);
  const request = source?.projection.messages.findLast(
    (message) => message.role === "user" && isTaskRequest(message.text, taskId),
  );
  const jobs = useMemo(
    () =>
      delegatedAgentsFromTurnItems(source?.projection.turnItems ?? []).filter(
        (job) => job.sourceMessageId === request?.id,
      ),
    [source?.projection.turnItems, request?.id],
  );
  const delegated = useDelegatedAgents(ref, jobs);
  const responses = jobs.length
    ? delegated.flatMap(
        (agent) => agent.data?.messages.filter((message) => message.role === "assistant") ?? [],
      )
    : taskResponses(source?.projection.messages ?? [], taskId);
  return (
    <div className="flex flex-col gap-3">
      {responses.map((message) => (
        <ChatMarkdown
          key={message.id}
          text={message.text}
          cwd={project?.workspaceRoot}
          environmentId={environmentId}
          isStreaming={message.streaming}
        />
      ))}
      {!responses.length ? (
        <p className="text-sm text-muted-foreground">
          {history.loading || !source
            ? "Loading response…"
            : "No response available for this task yet."}
        </p>
      ) : null}
      {responses.length ? (
        <WorkspaceItemContextChip
          id={taskId}
          kind="task"
          label={taskTitle}
          environmentId={environmentId}
        />
      ) : null}
      {history.error ? (
        <p role="alert" className="text-sm text-destructive">
          {history.error}
        </p>
      ) : null}
      {history.hasMoreHistory && !responses.length ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={history.loading}
            onClick={() => void loadEarlier({ environmentId, input: { threadId } })}
          >
            Load earlier responses
          </Button>
        </div>
      ) : null}
    </div>
  );
}
