import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useThreadOverviewStore } from "./threadOverviewStore";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { type DelegatedAgent } from "@t3tools/shared/agentMentions";

import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useCodeWorkspace } from "~/hooks/useSettings";
import {
  BotIcon,
  ArrowLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  FileDiffIcon,
  FileIcon,
  LinkIcon,
  ListIcon,
  PlusIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  isFileAttachment,
  isImageAttachment,
  isVideoAttachment,
  type ChatAttachment,
} from "~/types";
import { Button } from "../ui/button";
import { Popover, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ChatMarkdown from "../ChatMarkdown";
import { AgentAvatar } from "../agents/AgentAvatar";
import { DelegatedAgentStatus } from "../agents/DelegatedAgentStatus";
import { Spinner } from "../ui/spinner";
import { groupDelegatedAgents, useDelegatedAgents } from "../agents/useDelegatedAgents";

export interface ThreadOverviewPanelProps {
  threadKey: string;
  label: string;
  changes: { additions: number; deletions: number } | null;
  agents: { working: number; done: number };
  sources: ReadonlyArray<ChatAttachment>;
  onToggleChanges: () => void;
  onOpenSources: () => void;
  onAddSources: () => void;
  onOpenSource: (sourceId: string) => void;
  transient?: boolean;
  sourceThreadRef?: ScopedThreadRef | null;
  delegatedAgents?: ReadonlyArray<DelegatedAgent>;
  sourceHistoryReady?: boolean;
  subagents?: ReadonlyArray<
    Pick<RuntimeSubagent, "id" | "title" | "status" | "result" | "error" | "progress">
  >;
  composerElement?: HTMLElement | null;
}

const NO_ITEMS: ReadonlyArray<never> = [];
const NO_DELEGATIONS: ReadonlyArray<DelegatedAgent> = [];

const rowClassName =
  "flex w-full cursor-pointer items-center gap-3 rounded-lg py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default";

function OverviewPopover({
  label,
  changes,
  agents,
  sources,
  onToggleChanges,
  onOpenSources,
  onAddSources,
  onOpenSource,
  sourceThreadRef,
  delegatedAgents = NO_DELEGATIONS,
  sourceHistoryReady = true,
  subagents = NO_ITEMS,
  composerElement,
  wide,
}: ThreadOverviewPanelProps & { wide: boolean }) {
  const codeWorkspace = useCodeWorkspace();
  const target = useThreadOverviewStore((state) => state.target);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const delegated = useDelegatedAgents(sourceThreadRef ?? null, delegatedAgents);
  const initialJobs = useRef<Set<string> | null>(null);
  const openedJobs = useRef(new Set<string>());
  const grouped = groupDelegatedAgents(delegated);
  const [view, setView] = useState<
    { kind: "agent" | "subagent"; id: string } | { kind: "subagents" } | null
  >(null);
  const [expanded, setExpanded] = useState(false);
  const [availableSize, setAvailableSize] = useState({ height: 320, width: 320 });
  const showChanges = codeWorkspace && changes !== null;
  const selectedAgent =
    view?.kind === "agent" ? grouped.find(({ job }) => job.agentProjectId === view.id) : null;
  const selectedSubagent =
    view?.kind === "subagent" ? subagents.find(({ id }) => id === view.id) : null;
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const top = anchorRef.current?.getBoundingClientRect().top ?? 0;
      const bottom = composerElement?.getBoundingClientRect().bottom ?? window.innerHeight;
      const width =
        anchorRef.current?.closest("[data-chat-header]")?.getBoundingClientRect().width ?? 320;
      setAvailableSize({ height: Math.max(0, Math.floor(bottom - top - 12)), width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (composerElement) observer.observe(composerElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, composerElement]);
  useEffect(() => {
    if (!sourceHistoryReady) return;
    initialJobs.current ??= new Set(delegated.map(({ job }) => job.activityId));
    for (const { job, working } of delegated) {
      if (openedJobs.current.has(job.activityId)) continue;
      if (working || !initialJobs.current.has(job.activityId)) {
        openedJobs.current.add(job.activityId);
        setView({ kind: "agent", id: job.agentProjectId });
        setOpen(true);
      }
    }
  }, [delegated, sourceHistoryReady]);
  useEffect(() => {
    if (
      !target ||
      target.source.environmentId !== sourceThreadRef?.environmentId ||
      target.source.threadId !== sourceThreadRef.threadId
    )
      return;
    setExpanded(false);
    setView({ kind: "agent", id: target.projectId });
    setOpen(true);
    useThreadOverviewStore.setState({ target: null });
  }, [target, sourceThreadRef]);
  const visibleSources = sourcesExpanded ? sources : sources.slice(0, 3);
  const openView = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (wide && (details.reason === "outside-press" || details.reason === "focus-out")) {
          details.cancel();
          return;
        }
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Thread overview"
            data-thread-overview-trigger
            data-overview-docked={wide}
            data-pressed={open ? "" : undefined}
          />
        }
      >
        <ListIcon className="size-4" />
      </PopoverTrigger>
      <span
        ref={anchorRef}
        aria-hidden
        className="pointer-events-none absolute top-full right-(--workspace-gutter-end) size-0"
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="end"
          anchor={anchorRef}
          sideOffset={12}
          className="z-40 max-w-[calc(100vw-2rem)]"
        >
          {/* This feature frame follows the composer surface rather than a menu surface. */}
          <PopoverPrimitive.Popup
            data-slot="popover-popup"
            initialFocus={wide ? false : undefined}
            style={{
              height:
                wide && view && expanded
                  ? Math.min(
                      availableSize.height,
                      320 + Math.max(0, availableSize.height - 320) / 2,
                    )
                  : Math.min(320, availableSize.height),
              width:
                view && expanded
                  ? wide
                    ? 320 + Math.max(0, availableSize.width - 320) / 2
                    : "calc(100vw - 2rem)"
                  : 320,
            }}
            className="flex max-h-(--available-height) w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-(--app-theme-toolbar-border,var(--border)) text-foreground shadow-lg outline-none [--overview-surface:var(--app-theme-surface-raised,var(--card))] dark:[--overview-surface:var(--app-theme-surface-raised,var(--surface-raised))] bg-(--overview-surface)/(--glass-opacity) backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-saturation) not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:bg-(--overview-surface)"
          >
            <header className="flex shrink-0 items-center gap-2 px-5 py-4">
              {view ? (
                <Button
                  variant="ghost-muted"
                  size="icon-xs"
                  aria-label={
                    view.kind === "subagent" ? "Back to subagents" : "Back to thread overview"
                  }
                  onClick={() => {
                    setExpanded(false);
                    setView(view.kind === "subagent" ? { kind: "subagents" } : null);
                  }}
                >
                  <ArrowLeftIcon className="size-3.5" />
                </Button>
              ) : null}
              {selectedAgent?.project?.agentProfile ? (
                <AgentAvatar
                  avatar={selectedAgent.project.agentProfile.avatar}
                  working={selectedAgent.working}
                  className="size-6"
                />
              ) : selectedSubagent ? (
                <BotIcon aria-hidden className="size-5" />
              ) : null}
              <PopoverTitle className="min-w-0 flex-1">
                <span className="block truncate">
                  {selectedAgent?.name ??
                    selectedSubagent?.title ??
                    (view?.kind === "subagents" ? "Subagents" : label)}
                </span>
              </PopoverTitle>
              {selectedAgent ? (
                <span
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                  role="status"
                >
                  {selectedAgent.working ? <Spinner size="xs" aria-label="Agent working" /> : null}
                  {selectedAgent.working
                    ? selectedAgent.data?.status === "waiting"
                      ? "Needs input"
                      : "Working"
                    : selectedAgent.data?.status === "completed"
                      ? "Finished"
                      : selectedAgent.data?.status === "error"
                        ? "Failed"
                        : selectedAgent.data?.status === "interrupted"
                          ? "Stopped"
                          : "Unavailable"}
                </span>
              ) : null}
              {view || showChanges ? (
                <Button
                  variant="ghost-muted"
                  size="icon-xs"
                  aria-label={
                    view
                      ? expanded
                        ? "Collapse agent responses"
                        : "Expand agent responses"
                      : "Show changes"
                  }
                  aria-expanded={view ? expanded : undefined}
                  onClick={() => (view ? setExpanded(!expanded) : openView(onToggleChanges))}
                >
                  {expanded ? (
                    <ChevronUpIcon className="size-3.5" />
                  ) : (
                    <ChevronDownIcon className="size-3.5" />
                  )}
                </Button>
              ) : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
              {view === null ? (
                <div className="flex flex-col gap-4 [&>section:not(:first-child)]:border-t [&>section:not(:first-child)]:border-border/50 [&>section:not(:first-child)]:pt-3">
                  {showChanges && (
                    <button
                      type="button"
                      className={rowClassName}
                      onClick={() => openView(onToggleChanges)}
                    >
                      <FileDiffIcon aria-hidden className="size-4 shrink-0" />
                      <span className="flex-1">Changes</span>
                      <span className="text-xs tabular-nums text-success">
                        +{changes.additions.toLocaleString()}
                      </span>
                      <span className="text-xs tabular-nums text-destructive">
                        −{changes.deletions.toLocaleString()}
                      </span>
                    </button>
                  )}
                  {grouped.length > 0 ? (
                    <section>
                      <h3 className="mb-2 text-xs text-muted-foreground">Agents</h3>
                      <DelegatedAgentStatus agents={delegated} />
                      {grouped.map((agent) => (
                        <button
                          key={agent.job.agentProjectId}
                          type="button"
                          className={rowClassName}
                          aria-label={`View ${agent.name} responses`}
                          onClick={() => setView({ kind: "agent", id: agent.job.agentProjectId })}
                        >
                          {agent.project?.agentProfile ? (
                            <AgentAvatar
                              avatar={agent.project.agentProfile.avatar}
                              working={agent.working}
                              className="size-5"
                            />
                          ) : null}
                          <span className="flex-1 truncate text-sm">{agent.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {agent.working
                              ? "Working"
                              : agent.data?.status === "completed"
                                ? "Finished"
                                : "Stopped"}
                          </span>
                        </button>
                      ))}
                    </section>
                  ) : null}
                  <section>
                    <h3 className="text-xs text-muted-foreground">Subagents</h3>
                    <button
                      type="button"
                      className={rowClassName}
                      onClick={() => setView({ kind: "subagents" })}
                    >
                      <BotIcon aria-hidden className="size-4 shrink-0 text-primary" />
                      <span className="flex-1 text-sm">{agents.working} working</span>
                      <span className="text-sm text-muted-foreground">{agents.done} done</span>
                    </button>
                  </section>
                  <section>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-expanded={sourcesExpanded}
                        aria-label={sourcesExpanded ? "Show recent sources" : "Show all sources"}
                        className="flex cursor-pointer items-center gap-1.5 rounded-sm text-xs text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setSourcesExpanded((expanded) => !expanded)}
                      >
                        Sources
                        <ChevronDownIcon
                          aria-hidden
                          className={cn(
                            "size-3 transition-transform",
                            sourcesExpanded && "rotate-180",
                          )}
                        />
                      </button>
                      <Button
                        variant="ghost-muted"
                        size="icon-xs"
                        aria-label="Add sources"
                        onClick={() => openView(onAddSources)}
                      >
                        <PlusIcon className="size-3.5" />
                      </Button>
                    </div>
                    {visibleSources.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">No uploaded sources yet.</p>
                    ) : (
                      visibleSources.map((source) => (
                        <Tooltip key={source.id}>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                className={rowClassName}
                                disabled={
                                  !isImageAttachment(source) &&
                                  (!isFileAttachment(source) ||
                                    (source.downloadable === false &&
                                      (!isVideoAttachment(source) ||
                                        source.previewUrl === undefined)))
                                }
                                onClick={() => openView(() => onOpenSource(source.id))}
                              />
                            }
                          >
                            {isImageAttachment(source) && source.previewUrl ? (
                              <img
                                src={source.previewUrl}
                                alt=""
                                className="size-6 shrink-0 rounded-sm border border-border object-cover"
                              />
                            ) : (
                              <FileIcon
                                aria-hidden
                                className="size-4 shrink-0 text-muted-foreground"
                              />
                            )}
                            <span className="min-w-0 truncate text-sm">{source.name}</span>
                          </TooltipTrigger>
                          <TooltipPopup side="left">{source.name}</TooltipPopup>
                        </Tooltip>
                      ))
                    )}
                    <button
                      type="button"
                      className={cn(rowClassName, "text-sm text-muted-foreground")}
                      onClick={() => openView(onOpenSources)}
                    >
                      <LinkIcon aria-hidden className="size-4 shrink-0" />
                      View all
                    </button>
                  </section>
                </div>
              ) : selectedAgent ? (
                <div className="flex flex-col gap-5" aria-label={`${selectedAgent.name} responses`}>
                  {selectedAgent.jobs.map(({ job, data, project, working }) => {
                    const messages = data?.messages ?? [];
                    const first = messages[0];
                    // The task run supplies its own summary; old replies remain results.
                    const hasSummary = /^\*\*Task:\*\*\s*/i.test(first?.text ?? "");
                    const pendingSummary =
                      first?.streaming && "**task:**".startsWith(first.text.trim().toLowerCase());
                    const ask = hasSummary ? first!.text.replace(/^\*\*Task:\*\*\s*/i, "") : null;
                    const result = (hasSummary || pendingSummary ? messages.slice(1) : messages)
                      .map(({ text }) => text)
                      .filter(Boolean)
                      .join("\n\n");
                    return (
                      <section key={job.activityId} className="flex flex-col gap-3">
                        <div
                          className="flex items-start gap-2 rounded-2xl bg-message text-message-foreground p-3"
                          aria-label="Task summary"
                        >
                          {project?.agentProfile ? (
                            <AgentAvatar
                              avatar={project.agentProfile.avatar}
                              className="mt-1 size-5 shrink-0"
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            {ask ? (
                              <ChatMarkdown
                                text={ask}
                                cwd={project?.workspaceRoot}
                                environmentId={sourceThreadRef?.environmentId}
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {working
                                  ? "Summarising the request…"
                                  : "No task summary was recorded for this earlier response."}
                              </p>
                            )}
                          </div>
                        </div>
                        <div
                          className="flex items-start gap-2 rounded-2xl bg-background/30 p-3"
                          aria-label="Result"
                        >
                          {project?.agentProfile ? (
                            <AgentAvatar
                              avatar={project.agentProfile.avatar}
                              className="mt-1 size-5 shrink-0"
                              working={working}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="mb-2 text-xs text-muted-foreground">Result</p>
                            {result ? (
                              <ChatMarkdown
                                text={result}
                                cwd={project?.workspaceRoot}
                                environmentId={sourceThreadRef?.environmentId}
                                {...(sourceThreadRef
                                  ? {
                                      threadRef: scopeThreadRef(
                                        sourceThreadRef.environmentId,
                                        job.agentThreadId,
                                      ),
                                    }
                                  : {})}
                                isStreaming={
                                  data?.messages.some(({ streaming }) => streaming) ?? false
                                }
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {working
                                  ? data?.status === "waiting"
                                    ? "Needs input in the agent chat."
                                    : "Working…"
                                  : data?.status === "error"
                                    ? "This task failed."
                                    : data?.status === "completed"
                                      ? "Task finished."
                                      : "Response unavailable."}
                              </p>
                            )}
                            {data?.truncated ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Showing the latest 32 response messages for this task.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : selectedSubagent ? (
                <div className="flex flex-col gap-3">
                  <div
                    className="rounded-2xl bg-message text-message-foreground p-3"
                    aria-label="Ask"
                  >
                    <p className="mb-2 text-xs text-muted-foreground">Ask</p>
                    <ChatMarkdown text={selectedSubagent.title} cwd={undefined} />
                  </div>
                  <div
                    className="flex items-start gap-2 rounded-2xl bg-background/30 p-3"
                    aria-label="Result"
                  >
                    <BotIcon aria-hidden className="mt-1 size-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-2 text-xs text-muted-foreground">Result</p>
                      <ChatMarkdown
                        cwd={undefined}
                        text={
                          selectedSubagent.result ??
                          selectedSubagent.error ??
                          selectedSubagent.progress ??
                          "Working…"
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : view?.kind === "subagents" ? (
                <div className="flex flex-col gap-2">
                  {subagents.length ? (
                    subagents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        className={rowClassName}
                        onClick={() => setView({ kind: "subagent", id: agent.id })}
                      >
                        <BotIcon aria-hidden className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-sm">{agent.title}</span>
                        <span className="text-xs text-muted-foreground">{agent.status}</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No subagents yet.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This agent is unavailable.</p>
              )}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}

export function ThreadOverviewPanel(props: ThreadOverviewPanelProps) {
  const wide = useMediaQuery("xl") && !props.transient;
  // Resizing into the narrow layout or navigating starts with its transient overlay closed.
  return <OverviewPopover key={`${props.threadKey}:${wide}`} {...props} wide={wide} />;
}
