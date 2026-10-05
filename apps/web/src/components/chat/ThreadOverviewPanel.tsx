import { resolveThreadLineageWindow } from "@t3tools/client-runtime/state/thread-relationships";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
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
  ExpandIcon,
  CollapseIcon,
  ChevronDownIcon,
  FileDiffIcon,
  FileIcon,
  LinkIcon,
  AlignBoxMiddleLeftIcon,
  PlusIcon,
  ChannelIcon,
} from "~/icons";
import { cn } from "~/lib/utils";
import { buildThreadRouteParams } from "~/threadRoutes";
import {
  isFileAttachment,
  isImageAttachment,
  isVideoAttachment,
  type ChatAttachment,
} from "~/types";
import { Button } from "../ui/button";
import { Popover, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { AgentMessageBubble } from "../agents/AgentMessageBubble";
import ChatMarkdown from "../ChatMarkdown";
import { AgentAvatar } from "../agents/AgentAvatar";
import { Spinner } from "../ui/spinner";
import { useAgents } from "../agents/useAgents";
import { groupDelegatedAgents, useDelegatedAgents } from "../agents/useDelegatedAgents";

export interface ThreadOverviewPanelProps {
  threadKey: string;
  label: string;
  workspaceContent?: ReactNode;
  versionControlContent?: ReactNode;
  threadBoundaryRef?: RefObject<HTMLElement | null>;
  onDockedChange?: (docked: boolean) => void;
  showGit?: boolean;
  showAgents?: boolean;
  changes: { additions: number; deletions: number } | null;
  agents: { working: number; done: number };
  sources: ReadonlyArray<ChatAttachment>;
  onToggleChanges: () => void;
  onOpenSources: () => void;
  onAddSources: () => void;
  onOpenSource: (sourceId: string) => void;
  transient?: boolean;
  onOpenChange?: (open: boolean) => void;
  hidden?: boolean;
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
  "-mx-2.5 flex w-[calc(100%+1.25rem)] cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default";

function OverviewPopover({
  label,
  workspaceContent,
  onOpenChange,
  hidden = false,
  versionControlContent,
  threadBoundaryRef,
  onDockedChange,
  changes,
  showGit = changes !== null,
  showAgents = true,
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
  const roster = useAgents();
  const currentChannel = roster.find(
    ({ thread }) =>
      !!sourceThreadRef &&
      !!thread &&
      thread.id === sourceThreadRef.threadId &&
      thread.environmentId === sourceThreadRef.environmentId,
  )?.project;
  const memberIds = currentChannel?.agentProfile?.group?.memberProjectIds;
  const channelMembers = roster.filter(
    ({ project }) =>
      project.environmentId === sourceThreadRef?.environmentId && memberIds?.includes(project.id),
  );
  const target = useThreadOverviewStore((state) => state.target);
  const toggle = useThreadOverviewStore((state) => state.toggle);
  const [open, setOpen] = useState(false);
  const [previousWide, setPreviousWide] = useState(wide);
  const [workspaceHost] = useState(() => document.createElement("div"));
  const [versionControlHost] = useState(() => document.createElement("div"));
  if (previousWide !== wide) {
    setPreviousWide(wide);
    setOpen(false);
  }
  // The shared header can live outside the thread pane, so report reserved space
  // to the pane owner instead of relying on the trigger being its DOM descendant.
  useLayoutEffect(() => {
    onDockedChange?.(open && wide && !hidden);
    return () => onDockedChange?.(false);
  }, [open, wide, hidden, onDockedChange]);
  useLayoutEffect(() => onOpenChange?.(open), [open, onOpenChange]);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [gitExpanded, setGitExpanded] = useState(true);
  const delegated = useDelegatedAgents(sourceThreadRef ?? null, delegatedAgents);
  const initialJobs = useRef<Set<string> | null>(null);
  const openedJobs = useRef(new Set<string>());
  const grouped = groupDelegatedAgents(delegated);
  const [view, setView] = useState<
    { kind: "agent" | "subagent"; id: string } | { kind: "subagents" } | null
  >(null);
  const [expanded, setExpanded] = useState(false);
  const [visibleSubagentCount, setVisibleSubagentCount] = useState(6);
  const { visibleRows: visibleSubagents, hiddenCount: hiddenSubagentCount } =
    resolveThreadLineageWindow(subagents, visibleSubagentCount);
  const bodyRef = useRef<HTMLDivElement>(null);
  const landedView = useRef<typeof view>(null);
  const [availableSize, setAvailableSize] = useState({ x: 0, y: 0, height: 320, width: 320 });
  const showChanges = codeWorkspace && showGit;
  const selectedAgent =
    view?.kind === "agent" ? grouped.find(({ job }) => job.agentProjectId === view.id) : null;
  const selectedSubagent =
    view?.kind === "subagent" ? subagents.find(({ id }) => id === view.id) : null;
  const collapsedWidth = Math.min(320, availableSize.width);
  const expandedWidth = wide
    ? collapsedWidth + (availableSize.width - collapsedWidth) / 2
    : availableSize.width;
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!open || !selectedAgent) {
      landedView.current = null;
      if (body) body.style.paddingBottom = "";
      return;
    }
    if (!body || !selectedAgent.jobs.at(-1)?.data?.messages.length) return;
    const messages = body.querySelectorAll<HTMLElement>("[data-agent-panel-message]");
    const message = messages.item(messages.length - 1);
    if (!message) return;
    const rect = message.getBoundingClientRect();
    const top = body.scrollTop + rect.top - body.getBoundingClientRect().top;
    // Land at the start of the whole reply with its avatar, including progress messages.
    body.style.paddingBottom = `${Math.max(20, body.clientHeight - rect.height)}px`;
    if (landedView.current === view) return;
    body.scrollTop = top;
    landedView.current = view;
  }, [open, view, selectedAgent, expanded, availableSize]);
  useLayoutEffect(() => {
    if (!open || hidden) return;
    const column =
      threadBoundaryRef?.current ?? anchorRef.current?.closest("[data-chat-column-maximized-away]");
    const header = anchorRef.current?.closest("[data-chat-header]");
    const workspace = column?.closest("[data-chat-workspace-panels]");
    const measure = () => {
      const boundary =
        column?.getAttribute("data-chat-column-maximized-away") === "true" ? workspace : column;
      const bounds = boundary?.getBoundingClientRect();
      const headerBounds = header?.getBoundingClientRect();
      const x = Math.max(0, bounds?.left ?? headerBounds?.left ?? 0) + 12;
      const y =
        Math.max(bounds?.top ?? 0, anchorRef.current?.getBoundingClientRect().top ?? 0) + 12;
      const right =
        Math.min(window.innerWidth, bounds?.right ?? headerBounds?.right ?? window.innerWidth) - 12;
      const bottom =
        Math.min(
          window.innerHeight,
          bounds?.bottom ?? window.innerHeight,
          composerElement?.getBoundingClientRect().bottom ?? window.innerHeight,
        ) - 12;
      setAvailableSize({
        x,
        y,
        height: Math.max(0, Math.floor(bottom - y)),
        width: Math.max(0, Math.floor(right - x)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    const boundaryElement = column ?? header;
    if (boundaryElement) observer.observe(boundaryElement);
    if (workspace && workspace !== boundaryElement) observer.observe(workspace);
    if (composerElement) observer.observe(composerElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, hidden, composerElement, threadBoundaryRef]);
  useEffect(() => {
    if (!sourceHistoryReady || memberIds) return;
    initialJobs.current ??= new Set(delegated.map(({ job }) => job.activityId));
    for (const { job, working } of delegated) {
      if (openedJobs.current.has(job.activityId)) continue;
      if (working || !initialJobs.current.has(job.activityId)) {
        openedJobs.current.add(job.activityId);
        setView({ kind: "agent", id: job.agentProjectId });
        setOpen(true);
      }
    }
  }, [delegated, sourceHistoryReady, memberIds]);
  useEffect(() => {
    if (
      !target ||
      target.source.environmentId !== sourceThreadRef?.environmentId ||
      target.source.threadId !== sourceThreadRef.threadId
    )
      return;
    if (memberIds) {
      useThreadOverviewStore.setState({ target: null });
      return;
    }
    setExpanded(false);
    setView({ kind: "agent", id: target.projectId });
    setOpen(true);
    useThreadOverviewStore.setState({ target: null });
  }, [target, sourceThreadRef, memberIds]);
  useEffect(() => {
    if (
      !toggle ||
      toggle.environmentId !== sourceThreadRef?.environmentId ||
      toggle.threadId !== sourceThreadRef?.threadId
    )
      return;
    setView(null);
    setOpen((current) => !current);
    useThreadOverviewStore.setState({ toggle: null });
  }, [toggle, sourceThreadRef]);
  const visibleSources = sourcesExpanded ? sources.slice(0, 3) : [];
  const openView = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <Popover
      open={open && !hidden}
      onOpenChange={(nextOpen, details) => {
        if (
          (!nextOpen && hidden) ||
          (details.reason === "outside-press" &&
            details.event.target instanceof Element &&
            details.event.target.closest("[data-agent-details-trigger]")) ||
          (wide && (details.reason === "outside-press" || details.reason === "focus-out"))
        ) {
          details.cancel();
          return;
        }
        if (nextOpen) onOpenChange?.(true);
        setOpen(nextOpen);
      }}
    >
      {createPortal(workspaceContent, workspaceHost)}
      {createPortal(versionControlContent, versionControlHost)}
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
        <AlignBoxMiddleLeftIcon className="size-4" />
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
          sticky
          collisionBoundary={availableSize}
          collisionPadding={0}
          collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
          className="z-40"
        >
          {/* This feature frame follows the composer surface rather than a menu surface. */}
          <PopoverPrimitive.Popup
            data-slot="popover-popup"
            data-chat-header-actions
            initialFocus={wide ? false : undefined}
            style={{
              height:
                wide && view && expanded
                  ? Math.min(
                      availableSize.height,
                      320 + Math.max(0, availableSize.height - 320) / 2,
                    )
                  : view
                    ? Math.min(320, availableSize.height)
                    : undefined,
              maxHeight: availableSize.height,
              width: view && expanded ? expandedWidth : collapsedWidth,
              maxWidth: availableSize.width,
            }}
            className="flex max-h-(--available-height) flex-col overflow-hidden rounded-3xl workspace-panel-outline text-foreground outline-none [--overview-surface:var(--app-theme-surface-raised,var(--card))] dark:[--overview-surface:var(--app-theme-surface-raised,var(--surface-raised))] bg-(--overview-surface)/(--glass-opacity) backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-saturation) not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:bg-(--overview-surface)"
          >
            <header className="flex shrink-0 items-center gap-2 px-5 pt-5 pb-2">
              {view ? (
                <Button
                  variant="ghost"
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
              {selectedAgent && sourceThreadRef ? (
                <Link
                  to="/$environmentId/$threadId"
                  params={buildThreadRouteParams(
                    scopeThreadRef(sourceThreadRef.environmentId, selectedAgent.job.agentThreadId),
                  )}
                  aria-label={`Open ${selectedAgent.name} chat`}
                  onClick={() => setOpen(false)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {selectedAgent.project?.agentProfile?.group ? (
                    <ChannelIcon aria-hidden className="size-6 shrink-0" />
                  ) : selectedAgent.project?.agentProfile ? (
                    <AgentAvatar
                      avatar={selectedAgent.project.agentProfile.avatar}
                      working={selectedAgent.working}
                      className="size-6"
                    />
                  ) : null}
                  <PopoverTitle className="min-w-0 flex-1">
                    <span className="block truncate">{selectedAgent.name}</span>
                  </PopoverTitle>
                </Link>
              ) : (
                <>
                  {selectedSubagent ? <BotIcon aria-hidden className="size-5" /> : null}
                  <PopoverTitle className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate",
                        view === null && "text-xs font-normal text-muted-foreground",
                      )}
                    >
                      {selectedAgent?.name ??
                        selectedSubagent?.title ??
                        (view?.kind === "subagents" ? "Subagents" : "Workspace")}
                    </span>
                  </PopoverTitle>
                </>
              )}
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
              {view && (expanded || expandedWidth > collapsedWidth) ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={
                    view
                      ? expanded
                        ? "Collapse agent responses"
                        : "Expand agent responses"
                      : gitExpanded
                        ? "Hide Git"
                        : "Show Git"
                  }
                  aria-expanded={view ? expanded : gitExpanded}
                  onClick={() => (view ? setExpanded(!expanded) : setGitExpanded(!gitExpanded))}
                >
                  {view ? (
                    expanded ? (
                      <CollapseIcon className="size-3.5" />
                    ) : (
                      <ExpandIcon className="size-3.5" />
                    )
                  ) : (
                    <ChevronDownIcon className={cn("size-3.5", !gitExpanded && "-rotate-90")} />
                  )}
                </Button>
              ) : null}
            </header>
            <div
              ref={bodyRef}
              data-agent-panel-scroll
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-5 [overflow-anchor:none]"
            >
              {view === null ? (
                <div className="flex flex-col gap-2.5 [&>section:not(:first-child)]:border-t [&>section:not(:first-child)]:border-border/50 [&>section:not(:first-child)]:pt-2.5">
                  {workspaceContent ? (
                    <section aria-label={label}>
                      <div
                        ref={(node) => {
                          if (node) node.appendChild(workspaceHost);
                        }}
                      />
                    </section>
                  ) : null}
                  {memberIds ? (
                    <section>
                      <h3 className="mb-2 text-xs text-muted-foreground">Members</h3>
                      <ul className="space-y-2">
                        {channelMembers.map(({ project }) => (
                          <li key={project.id} className="flex items-center gap-2.5 text-sm">
                            <AgentAvatar avatar={project.agentProfile!.avatar} className="size-5" />
                            {project.title}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {showAgents && grouped.length > 0 ? (
                    <section>
                      <h3 className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Agents and channels</span>
                        {grouped.some((agent) => agent.working) ? (
                          <span>{grouped.filter((agent) => agent.working).length} working</span>
                        ) : null}
                      </h3>
                      <div
                        className="flex items-center gap-2 overflow-x-auto"
                        aria-label="Agents and channels"
                      >
                        {grouped.map((agent) => (
                          <Tooltip key={agent.job.agentProjectId}>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg p-1 hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={`View ${agent.name} responses`}
                                  onClick={() => {
                                    setExpanded(false);
                                    setView({ kind: "agent", id: agent.job.agentProjectId });
                                  }}
                                />
                              }
                            >
                              {agent.project?.agentProfile?.group ? (
                                <ChannelIcon aria-hidden className="size-5" />
                              ) : agent.project?.agentProfile ? (
                                <AgentAvatar
                                  avatar={agent.project.agentProfile.avatar}
                                  working={agent.working}
                                  className="size-5"
                                />
                              ) : (
                                <BotIcon className="size-5" />
                              )}
                              <span className="max-w-40 truncate text-sm">{agent.name}</span>
                            </TooltipTrigger>
                            <TooltipPopup>
                              {agent.name}
                              {agent.working ? " · Working" : ""}
                            </TooltipPopup>
                          </Tooltip>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {showAgents ? (
                    <section>
                      <h3 className="mb-1 text-xs text-muted-foreground">Subagents</h3>
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
                  ) : null}
                  {showChanges ? (
                    <section>
                      <button
                        type="button"
                        aria-expanded={gitExpanded}
                        aria-label={gitExpanded ? "Hide Git" : "Show Git"}
                        className="mb-1 flex w-full cursor-pointer items-center justify-between text-xs text-muted-foreground"
                        onClick={() => setGitExpanded(!gitExpanded)}
                      >
                        Version Control
                        <ChevronDownIcon
                          aria-hidden
                          className={cn("size-3", !gitExpanded && "-rotate-90")}
                        />
                      </button>
                      <div hidden={!gitExpanded}>
                        {versionControlContent ? (
                          <div
                            ref={(node) => {
                              if (node) node.appendChild(versionControlHost);
                            }}
                          />
                        ) : gitExpanded ? (
                          <button
                            type="button"
                            className={rowClassName}
                            onClick={() => openView(onToggleChanges)}
                          >
                            <FileDiffIcon aria-hidden className="size-4 shrink-0" />
                            <span className="flex-1 text-sm">Changes</span>
                            <span className="text-xs tabular-nums text-success">
                              +{(changes?.additions ?? 0).toLocaleString()}
                            </span>
                            <span className="text-xs tabular-nums text-destructive">
                              −{(changes?.deletions ?? 0).toLocaleString()}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </section>
                  ) : null}
                  <section>
                    <div
                      className={cn(
                        "flex items-center justify-between gap-2",
                        sourcesExpanded && "mb-1",
                      )}
                    >
                      <button
                        type="button"
                        aria-expanded={sourcesExpanded}
                        aria-label={sourcesExpanded ? "Collapse sources" : "Expand sources"}
                        className="flex cursor-pointer items-center gap-1.5 rounded-sm text-xs text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setSourcesExpanded((expanded) => !expanded)}
                      >
                        Sources
                        {!sourcesExpanded ? (
                          <span className="text-muted-foreground">{` · ${sources.length}`}</span>
                        ) : null}
                        <ChevronDownIcon
                          aria-hidden
                          className={cn(
                            "size-3 transition-transform",
                            !sourcesExpanded && "-rotate-90",
                          )}
                        />
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Add sources"
                        onClick={() => openView(onAddSources)}
                      >
                        <PlusIcon className="size-3.5" />
                      </Button>
                    </div>
                    {!sourcesExpanded ? null : visibleSources.length === 0 ? (
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
                              <FileIcon aria-hidden className="size-4 shrink-0 text-foreground" />
                            )}
                            <span className="min-w-0 truncate text-sm">{source.name}</span>
                          </TooltipTrigger>
                          <TooltipPopup side="left">{source.name}</TooltipPopup>
                        </Tooltip>
                      ))
                    )}
                    {sourcesExpanded && (
                      <button
                        type="button"
                        className={cn(rowClassName, "text-sm text-foreground")}
                        onClick={() => openView(onOpenSources)}
                      >
                        <LinkIcon aria-hidden className="size-4 shrink-0" />
                        View all
                      </button>
                    )}
                  </section>
                </div>
              ) : selectedAgent ? (
                <div
                  className="flex flex-col gap-5 pl-2 sm:pl-0.5"
                  aria-label={`${selectedAgent.name} responses`}
                >
                  {selectedAgent.jobs.map(({ job, data, project, working }) => {
                    const responder = data?.respondingAgentProjectId
                      ? roster.find(
                          ({ project: member }) =>
                            member.environmentId === sourceThreadRef?.environmentId &&
                            member.id === data.respondingAgentProjectId,
                        )?.project
                      : project?.agentProfile?.group
                        ? undefined
                        : project;
                    const messages = data?.messages ?? [];
                    const first = messages[0];
                    // The task run supplies its own summary; old replies remain results.
                    const hasSummary = /^\*\*Task:\*\*\s*/i.test(first?.text ?? "");
                    const pendingSummary =
                      first?.streaming && "**task:**".startsWith(first.text.trim().toLowerCase());
                    const channelResponse = Boolean(project?.agentProfile?.group);
                    const ask = hasSummary
                      ? first!.text.replace(/^\*\*Task:\*\*\s*/i, "")
                      : channelResponse
                        ? (first?.text ?? null)
                        : null;
                    const results = (
                      hasSummary || pendingSummary || channelResponse ? messages.slice(1) : messages
                    ).filter(({ text }) => text.trim());
                    return (
                      <section
                        key={job.activityId}
                        className="flex flex-col gap-3"
                        data-agent-panel-message={first?.id}
                      >
                        <AgentMessageBubble
                          avatar={responder?.agentProfile?.avatar}
                          working={working}
                        >
                          <div aria-label="Task summary">
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
                        </AgentMessageBubble>
                        {results.length ? (
                          <div data-agent-panel-message={results.at(-1)?.id}>
                            <AgentMessageBubble
                              avatar={responder?.agentProfile?.avatar}
                              working={working}
                              bubble={false}
                            >
                              <div className="flex min-w-0 flex-col gap-3" aria-label="Result">
                                {results.map((message) => (
                                  <ChatMarkdown
                                    key={message.id}
                                    text={message.text}
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
                                    isStreaming={message.streaming}
                                  />
                                ))}
                              </div>
                            </AgentMessageBubble>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground" aria-label="Result">
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
                    <ChatMarkdown text={selectedSubagent.title} cwd={undefined} />
                  </div>
                  <div
                    className="flex items-start gap-2 rounded-2xl bg-background/30 p-3"
                    aria-label="Result"
                  >
                    <BotIcon aria-hidden className="mt-1 size-5 shrink-0" />
                    <div className="min-w-0 flex-1">
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
                    visibleSubagents.map((agent) => (
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
                  {hiddenSubagentCount > 0 ? (
                    <button
                      type="button"
                      className={rowClassName}
                      onClick={() => setVisibleSubagentCount((count) => count + 12)}
                    >
                      <span className="text-sm">Show {Math.min(hiddenSubagentCount, 12)} more</span>
                    </button>
                  ) : null}
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
  return <OverviewPopover key={props.threadKey} {...props} wide={wide} />;
}
