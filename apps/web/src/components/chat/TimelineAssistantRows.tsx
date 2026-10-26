import { ChannelReplyAction } from "./TimelineRowParts";
import { WorkspaceItemContextChip } from "../WorkspaceItemContextChip";
import { AgentMessageBubble } from "../agents/AgentMessageBubble";
import { AgentAvatar } from "../agents/AgentAvatar";
import { scopeProjectRef, scopeThreadRef } from "@elysiatools/client-runtime/environment";
import { shouldPreserveAssistantLineBreaks } from "@elysiatools/shared/markdownPipeline";
import { type RunId } from "@elysiatools/contracts";
import { canForkProjectedAssistantItem } from "@elysiatools/client-runtime/state/thread-workflows";
import { memo, use, useState } from "react";
import { type ChatMessage, type TurnDiffSummary } from "../../types";
import ChatMarkdown from "../ChatMarkdown";
import { GitForkIcon } from "~/icons";
import { Button } from "../ui/button";
import { ProposedPlanCard } from "./ProposedPlanCard";
import { HtmlRenderFrame } from "./HtmlRenderFrame";
import { McpAppFrame } from "./McpAppFrame";
import { ChangedFilesCard } from "./ChangedFilesTree";
import { useFileContextMenuHandler } from "../../fileContextMenu";
import { useProject, useThreadShell } from "../../state/entities";
import { MessageCopyButton } from "./MessageCopyButton";
import { AssistantCitationSource } from "./AssistantCitationSource";
import { resolveAssistantMessageCopyState } from "./MessagesTimeline.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { useUiStateStore } from "~/uiStateStore";
import { formatChatTimestampTooltip, formatDayAwareTimestamp } from "../../timestampFormat";
import { useV2ItemSupport } from "../../state/v2ItemSupport";
import { TimelineRowCtx, TimelineRowActivityCtx, type TimelineRow } from "./timelineRowContext";
import { MESSAGE_HEADING_LEVEL, MessageAuthorHeading } from "./TimelineRowParts";

export function AssistantTimelineRow({
  row,
}: {
  row: Extract<
    TimelineRow,
    {
      kind: "message";
    }
  >;
}) {
  const ctx = use(TimelineRowCtx);
  const sender = useThreadShell(
    row.message.senderThreadId && ctx.threadRef
      ? scopeThreadRef(ctx.threadRef.environmentId, row.message.senderThreadId)
      : null,
  );
  const channelAgentProjectId = ctx.channel
    ? ctx.runs.find((run) => run.id === row.message.runId)?.channelAgentProjectId
    : undefined;
  const senderProject = useProject(
    ctx.threadRef && (channelAgentProjectId || sender)
      ? scopeProjectRef(ctx.threadRef.environmentId, channelAgentProjectId ?? sender!.projectId)
      : null,
  );
  const senderProfile = senderProject?.agentProfile;
  const messageText = row.message.text || (row.message.streaming ? "" : "(empty response)");
  const taskSummary = ctx.agentAvatar && /^\*\*Task:\*\*\s*/i.test(messageText);
  return (
    <>
      <div className="relative min-w-0 px-1 py-0.5 [--chat-foreground:light-dark(#000,#fff)] text-chat-foreground">
        {!ctx.agentAvatar && !senderProfile && <MessageAuthorHeading>Elysia</MessageAuthorHeading>}
        <div data-thread-find-text="true">
          <AssistantCitationSource
            messageId={row.message.id}
            {...(ctx.threadRef
              ? {
                  threadRef: ctx.threadRef,
                }
              : {})}
            itemKey={row.id}
            request={ctx.citationRequest}
            listRef={ctx.listRef}
          >
            {senderProfile && ctx.channel ? (
              <>
                <AgentAvatar
                  avatar={senderProfile.avatar}
                  working={row.message.streaming}
                  className="absolute right-full top-1 mr-4 size-3 sm:mr-5 sm:size-5"
                />
                <p className="mb-1 text-sm font-medium text-foreground">{senderProject.title}</p>
                <ChatMarkdown
                  text={messageText}
                  cwd={ctx.markdownCwd}
                  threadRef={ctx.threadRef ?? undefined}
                  isStreaming={Boolean(row.message.streaming)}
                  lineBreaks={shouldPreserveAssistantLineBreaks(messageText)}
                  headingLevelOffset={MESSAGE_HEADING_LEVEL}
                  onImageExpand={ctx.onImageExpand}
                />
              </>
            ) : senderProfile ? (
              <AgentMessageBubble avatar={senderProfile.avatar} bubble={false}>
                <p className="mb-1 text-sm font-medium text-foreground">{senderProject.title}</p>
                <ChatMarkdown
                  text={messageText}
                  cwd={ctx.markdownCwd}
                  threadRef={ctx.threadRef ?? undefined}
                  isStreaming={Boolean(row.message.streaming)}
                  lineBreaks={shouldPreserveAssistantLineBreaks(messageText)}
                  headingLevelOffset={MESSAGE_HEADING_LEVEL}
                  onImageExpand={ctx.onImageExpand}
                />
              </AgentMessageBubble>
            ) : taskSummary ? (
              <AgentMessageBubble avatar={ctx.agentAvatar} working={row.message.streaming}>
                <ChatMarkdown
                  text={messageText.replace(/^\*\*Task:\*\*\s*/i, "")}
                  cwd={ctx.markdownCwd}
                  threadRef={ctx.threadRef ?? undefined}
                  isStreaming={Boolean(row.message.streaming)}
                />
              </AgentMessageBubble>
            ) : (
              <ChatMarkdown
                text={messageText}
                cwd={ctx.markdownCwd}
                threadRef={ctx.threadRef ?? undefined}
                isStreaming={Boolean(row.message.streaming)}
                lineBreaks={shouldPreserveAssistantLineBreaks(messageText)}
                skills={ctx.skills}
                headingLevelOffset={MESSAGE_HEADING_LEVEL}
                onUseArtifactTemplate={ctx.onUseArtifactTemplate}
                onRunShellCommand={ctx.onRunShellCommand}
                onImageExpand={ctx.onImageExpand}
              />
            )}
          </AssistantCitationSource>
        </div>
        {!row.message.streaming && (row.showAssistantMeta || ctx.channel)
          ? ctx.taskLinks.get(row.message.id)?.map((link) => (
              <div key={link.contextId} className="mt-3">
                <WorkspaceItemContextChip
                  id={link.contextId}
                  kind="task"
                  label={link.label}
                  environmentId={ctx.activeThreadEnvironmentId}
                />
              </div>
            ))
          : null}
        {ctx.onOpenTurnDiff ? (
          <AssistantChangedFilesSection
            turnSummary={row.assistantTurnDiffSummary}
            routeThreadKey={ctx.routeThreadKey}
            resolvedTheme={ctx.resolvedTheme}
            onOpenTurnDiff={ctx.onOpenTurnDiff}
          />
        ) : null}
        {row.showAssistantMeta || ctx.channel ? (
          <AssistantMessageMeta
            className="mt-1.5"
            projectedItem={row.projectedItem}
            message={row.message}
            showCopyButton={ctx.channel || row.showAssistantCopyButton}
            copyStreaming={row.assistantCopyStreaming}
          />
        ) : null}
      </div>
    </>
  );
}

function AssistantForkButton({
  projectedItem,
}: {
  readonly projectedItem: NonNullable<
    Extract<
      TimelineRow,
      {
        kind: "message";
      }
    >["projectedItem"]
  >;
}) {
  const ctx = use(TimelineRowCtx);
  const [busy, setBusy] = useState(false);
  const support = useV2ItemSupport({
    environmentId: ctx.activeThreadEnvironmentId,
    sourceThreadId: projectedItem.sourceThreadId,
    sourceItemId: projectedItem.sourceItemId,
  });
  const source = useThreadShell(
    scopeThreadRef(ctx.activeThreadEnvironmentId, projectedItem.sourceThreadId),
  );
  const project = useProject(
    source ? scopeProjectRef(ctx.activeThreadEnvironmentId, source.projectId) : null,
  );
  const canFork = canForkProjectedAssistantItem({
    projectedItem,
    capabilities: support.providerSession?.capabilities,
    isAgentThread: Boolean(ctx.agentAvatar || project?.agentProfile),
  });
  const onForkFromRun = ctx.onForkFromRun;
  if (!canFork || onForkFromRun === undefined || projectedItem.item.runId === null) return null;
  const runId = projectedItem.item.runId;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onForkFromRun({ sourceThreadId: projectedItem.sourceThreadId, runId }).finally(
                () => setBusy(false),
              );
            }}
            aria-label="Fork from this response"
          />
        }
      >
        <GitForkIcon className={cn("size-3", busy && "animate-pulse")} />
      </TooltipTrigger>
      <TooltipPopup side="top">Fork from this response</TooltipPopup>
    </Tooltip>
  );
}

export function AssistantMetaTimelineRow({
  row,
}: {
  row: Extract<
    TimelineRow,
    {
      kind: "assistant-meta";
    }
  >;
}) {
  const ctx = use(TimelineRowCtx);
  if (ctx.channel) return null;
  return (
    <div className="px-1">
      <AssistantMessageMeta
        className="mt-0.5"
        projectedItem={row.projectedItem}
        message={row.message}
        showCopyButton={row.showAssistantCopyButton}
        copyStreaming={row.assistantCopyStreaming}
        alwaysVisible
      />
    </div>
  );
}

function AssistantMessageMeta({
  className,
  projectedItem,
  message,
  showCopyButton,
  copyStreaming,
  alwaysVisible = false,
}: {
  className?: string;
  projectedItem?: Extract<
    TimelineRow,
    {
      kind: "message";
    }
  >["projectedItem"];
  message: ChatMessage;
  showCopyButton: boolean;
  copyStreaming: boolean;
  alwaysVisible?: boolean;
}) {
  const ctx = use(TimelineRowCtx);
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs tabular-nums transition-opacity duration-200",
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover/assistant:opacity-100",
        className,
      )}
    >
      {ctx.channel ? <ChannelReplyAction message={message} /> : null}
      <div className="flex items-center gap-2 text-xs tabular-nums">
        {projectedItem?.item.type === "assistant_message" ? (
          <AssistantForkButton projectedItem={projectedItem} />
        ) : null}
        {projectedItem && projectedItem.item.status !== "completed" ? (
          <span className="rounded-full border border-border/70 px-1.5 py-0.5 font-mono text-3xs text-muted-foreground">
            {projectedItem.item.status}
          </span>
        ) : null}
        <AssistantCopyButton
          message={message}
          showCopyButton={showCopyButton}
          streaming={copyStreaming}
        />
        {!message.streaming && (
          <Tooltip>
            <TooltipTrigger render={<p className="text-muted-foreground text-xs tabular-nums" />}>
              {formatDayAwareTimestamp(message.updatedAt, ctx.timestampFormat)}
            </TooltipTrigger>
            <TooltipPopup>
              {formatChatTimestampTooltip(message.updatedAt, ctx.timestampFormat)}
            </TooltipPopup>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function AssistantCopyButton({
  message,
  showCopyButton,
  streaming,
}: {
  message: ChatMessage;
  showCopyButton: boolean;
  streaming: boolean;
}) {
  const assistantCopyState = resolveAssistantMessageCopyState({
    text: message.text ?? null,
    showCopyButton,
    streaming,
  });

  if (!assistantCopyState.visible) {
    return null;
  }

  return <MessageCopyButton text={assistantCopyState.text ?? ""} variant="ghost" />;
}

export function ProposedPlanTimelineRow({
  row,
}: {
  row: Extract<
    TimelineRow,
    {
      kind: "proposed-plan";
    }
  >;
}) {
  const ctx = use(TimelineRowCtx);
  return (
    <div className="min-w-0 px-1 py-0.5">
      <ProposedPlanCard
        planMarkdown={row.proposedPlan.planMarkdown}
        environmentId={ctx.activeThreadEnvironmentId}
        threadRef={ctx.threadRef ?? undefined}
        cwd={ctx.markdownCwd}
        workspaceRoot={ctx.workspaceRoot}
        findActive={ctx.findActive}
      />
    </div>
  );
}

export function HtmlRenderTimelineRow({
  row,
}: {
  row: Extract<
    TimelineRow,
    {
      kind: "html-render";
    }
  >;
}) {
  const ctx = use(TimelineRowCtx);
  const { onAppFullscreenChange } = ctx;
  const onFullscreenChange = (fullscreen: boolean) => onAppFullscreenChange(row.id, fullscreen);
  if (ctx.renderHtmlRender) {
    return <div className="min-w-0 px-1">{ctx.renderHtmlRender(row)}</div>;
  }
  return (
    <div className="min-w-0 px-1">
      <HtmlRenderFrame
        key={row.htmlRender.attachmentId}
        environmentId={ctx.activeThreadEnvironmentId}
        htmlRender={row.htmlRender}
        threadRef={ctx.threadRef ?? undefined}
        onFullscreenChange={onFullscreenChange}
      />
    </div>
  );
}

export function McpAppTimelineRow({
  row,
}: {
  row: Extract<
    TimelineRow,
    {
      kind: "mcp-app";
    }
  >;
}) {
  const ctx = use(TimelineRowCtx);
  const { awaitingUser } = use(TimelineRowActivityCtx);
  return (
    <div className="min-w-0 px-1">
      <McpAppFrame
        key={row.mcpApp.attachmentId}
        environmentId={ctx.activeThreadEnvironmentId}
        threadId={row.sourceThreadId}
        conversationThreadId={ctx.threadRef?.threadId ?? row.sourceThreadId}
        itemId={row.itemId}
        revision={row.revision}
        app={row.mcpApp}
        onSendMessage={ctx.onSendAppMessage}
        awaitingUser={awaitingUser}
        onFullscreenChange={(fullscreen) => ctx.onAppFullscreenChange(row.id, fullscreen)}
      />
    </div>
  );
}

/** Subscribes directly to the UI state store for expand/collapse state,
 *  so toggling re-renders only this component — not the entire list. */
const AssistantChangedFilesSection = memo(function AssistantChangedFilesSection({
  turnSummary,
  routeThreadKey,
  resolvedTheme,
  onOpenTurnDiff,
}: {
  turnSummary: TurnDiffSummary | undefined;
  routeThreadKey: string;
  resolvedTheme: "light" | "dark";
  displayThreadKey?: string;
  onOpenTurnDiff: (runId: RunId, filePath?: string) => void;
}) {
  if (!turnSummary) return null;
  const checkpointFiles = turnSummary.files;
  if (checkpointFiles.length === 0) return null;

  return (
    <AssistantChangedFilesSectionInner
      turnSummary={turnSummary}
      checkpointFiles={checkpointFiles}
      routeThreadKey={routeThreadKey}
      resolvedTheme={resolvedTheme}
      onOpenTurnDiff={onOpenTurnDiff}
    />
  );
});

function AssistantChangedFilesSectionInner({
  turnSummary,
  checkpointFiles,
  routeThreadKey,
  resolvedTheme,
  onOpenTurnDiff,
}: {
  turnSummary: TurnDiffSummary;
  checkpointFiles: TurnDiffSummary["files"];
  routeThreadKey: string;
  resolvedTheme: "light" | "dark";
  displayThreadKey?: string;
  onOpenTurnDiff: (runId: RunId, filePath?: string) => void;
}) {
  const ctx = use(TimelineRowCtx);
  const persistedExpanded = useUiStateStore(
    (store) => store.threadChangedFilesExpandedById[routeThreadKey]?.[turnSummary.runId],
  );
  const setExpanded = useUiStateStore((store) => store.setThreadChangedFilesExpanded);
  const allDirectoriesExpanded = persistedExpanded ?? false;
  const thread = useThreadShell(ctx.threadRef);
  const activeProject = useProject(
    thread && thread.projectId
      ? {
          environmentId: thread.environmentId,
          projectId: thread.projectId,
        }
      : null,
  );
  const onFileContextMenu = useFileContextMenuHandler(ctx.activeThreadEnvironmentId);
  return (
    <ChangedFilesCard
      runId={turnSummary.runId}
      files={checkpointFiles}
      allDirectoriesExpanded={allDirectoriesExpanded}
      resolvedTheme={resolvedTheme}
      onToggleAllDirectories={() =>
        setExpanded(routeThreadKey, turnSummary.runId, !allDirectoriesExpanded)
      }
      onOpenTurnDiff={onOpenTurnDiff}
      onFileContextMenu={(filePath, event) =>
        onFileContextMenu(
          {
            environmentId: ctx.activeThreadEnvironmentId,
            filePath,
            workspaceRoot: ctx.workspaceRoot,
            repositoryRoot:
              thread?.worktreePath == null
                ? activeProject?.repositoryIdentity?.rootPath
                : undefined,
          },
          event,
        )
      }
    />
  );
}
