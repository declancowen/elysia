import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useEffect, useRef, useState } from "react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { isAgentDelegationActive, type DelegatedAgent } from "@t3tools/shared/agentMentions";

import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useCodeWorkspace } from "~/hooks/useSettings";
import {
  BotIcon,
  CheckIcon,
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
import { useDelegatedAgents } from "../agents/useDelegatedAgents";

export interface ThreadOverviewPanelProps {
  threadKey: string;
  label: string;
  changes: { additions: number; deletions: number } | null;
  agents: { working: number; done: number };
  sources: ReadonlyArray<ChatAttachment>;
  onToggleChanges: () => void;
  onOpenAgents: () => void;
  onOpenSources: () => void;
  onAddSources: () => void;
  onOpenSource: (sourceId: string) => void;
  transient?: boolean;
  sourceThreadRef?: ScopedThreadRef | null;
  delegatedAgents?: ReadonlyArray<DelegatedAgent>;
  sourceHistoryReady?: boolean;
}

const NO_DELEGATIONS: ReadonlyArray<DelegatedAgent> = [];

const rowClassName =
  "flex w-full cursor-pointer items-center gap-3 rounded-lg py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default";

function OverviewPopover({
  label,
  changes,
  agents,
  sources,
  onToggleChanges,
  onOpenAgents,
  onOpenSources,
  onAddSources,
  onOpenSource,
  sourceThreadRef,
  delegatedAgents = NO_DELEGATIONS,
  sourceHistoryReady = true,
  wide,
}: ThreadOverviewPanelProps & { wide: boolean }) {
  const codeWorkspace = useCodeWorkspace();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const delegated = useDelegatedAgents(sourceThreadRef ?? null, delegatedAgents);
  const initialJobs = useRef<Set<string> | null>(null);
  const openedJobs = useRef(new Set<string>());
  const [dismissedJobs, setDismissedJobs] = useState<ReadonlySet<string>>(() => new Set());
  const visibleResponses = delegated.filter(({ job }) => !dismissedJobs.has(job.activityId));
  useEffect(() => {
    if (!sourceHistoryReady) return;
    initialJobs.current ??= new Set(delegatedAgents.map((job) => job.activityId));
    for (const { job, data } of delegated) {
      if (!data || openedJobs.current.has(job.activityId)) continue;
      if (isAgentDelegationActive(data.status) || !initialJobs.current.has(job.activityId)) {
        openedJobs.current.add(job.activityId);
        setOpen(true);
      }
    }
  }, [delegated, delegatedAgents, sourceHistoryReady]);
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
            className={cn(
              "flex max-h-[min(80vh,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden text-foreground outline-none",
            )}
          >
            <div
              className={cn(
                "shrink-0 overflow-y-auto rounded-3xl border shadow-lg",
                visibleResponses.length > 0
                  ? "max-h-[min(55vh,var(--available-height))]"
                  : "max-h-[min(70vh,var(--available-height))]",
                "[--overview-surface:var(--app-theme-surface-raised,var(--card))] dark:[--overview-surface:var(--app-theme-surface-raised,var(--surface-raised))]",
                "border-(--app-theme-toolbar-border,var(--border)) bg-(--overview-surface)/(--glass-opacity) backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-saturation)",
                "not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:bg-(--overview-surface)",
              )}
            >
              <div className="space-y-4 p-5">
                <PopoverTitle>
                  <span className="block truncate">{label}</span>
                </PopoverTitle>
                {codeWorkspace && changes !== null && (
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
                {delegated.length > 0 ? (
                  <section className="border-t border-border/50 pt-3">
                    <h3 className="mb-2 text-xs text-muted-foreground">Agents</h3>
                    <DelegatedAgentStatus agents={delegated} />
                  </section>
                ) : null}
                <section className="border-t border-border/50 pt-3">
                  <h3 className="text-xs text-muted-foreground">Subagents</h3>
                  <button
                    type="button"
                    className={rowClassName}
                    onClick={() => openView(onOpenAgents)}
                  >
                    <BotIcon aria-hidden className="size-4 shrink-0 text-primary" />
                    <span className="flex-1 text-sm">{agents.working} working</span>
                    <span className="text-sm text-muted-foreground">{agents.done} done</span>
                  </button>
                </section>
                <section className="border-t border-border/50 pt-3">
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
            </div>
            {visibleResponses.length > 0 ? (
              <div
                className="min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-2"
                aria-label="Delegated agent responses"
              >
                {visibleResponses.map(({ job, data, project, name, working }) => (
                  <section
                    key={job.activityId}
                    className="mb-5 space-y-3"
                    aria-label={`${name} response`}
                  >
                    <div className="flex items-center gap-2">
                      {project?.agentProfile ? (
                        <AgentAvatar avatar={project.agentProfile.avatar} working={working} />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                      <Button
                        variant="ghost-muted"
                        size="icon-xs"
                        aria-label={`Dismiss ${name} response`}
                        onClick={() =>
                          setDismissedJobs((previous) => new Set([...previous, job.activityId]))
                        }
                      >
                        <CheckIcon className="size-3.5" />
                      </Button>
                    </div>
                    {data?.messages.length ? (
                      data.messages.map((message) => (
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
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {working
                          ? data?.status === "waiting"
                            ? "Needs input in the agent chat."
                            : "Working…"
                          : data?.status === "completed"
                            ? "Task finished."
                            : data?.status === "error"
                              ? "This task failed. Open the agent chat to retry."
                              : data?.status === "interrupted"
                                ? "Task stopped."
                                : "This task’s response is unavailable."}
                      </p>
                    )}
                    {data?.truncated ? (
                      <p className="text-xs text-muted-foreground">
                        Showing the latest 32 responses for this task.
                      </p>
                    ) : null}
                  </section>
                ))}
              </div>
            ) : null}
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
