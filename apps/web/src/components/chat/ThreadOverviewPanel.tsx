import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useState } from "react";

import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useCodeWorkspace } from "~/hooks/useSettings";
import {
  BotIcon,
  ChevronDownIcon,
  FileDiffIcon,
  FileIcon,
  LinkIcon,
  ListChecksIcon,
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
}

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
  wide,
}: ThreadOverviewPanelProps & { wide: boolean }) {
  const codeWorkspace = useCodeWorkspace();
  const [open, setOpen] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const visibleSources = sourcesExpanded ? sources : sources.slice(0, 3);
  const openView = (action: () => void) => {
    action();
    if (!wide) setOpen(false);
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
        render={<Button variant="ghost" size="icon-sm" aria-label="Thread overview" />}
      >
        <ListChecksIcon className="size-4" />
      </PopoverTrigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="end"
          sideOffset={16}
          className="z-40 max-w-[calc(100vw-2rem)]"
        >
          {/* This feature frame follows the composer surface rather than a menu surface. */}
          <PopoverPrimitive.Popup
            data-slot="popover-popup"
            initialFocus={wide ? false : undefined}
            className={cn(
              "w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border text-foreground shadow-lg outline-none",
              "[--overview-surface:var(--app-theme-surface-raised,var(--card))] dark:[--overview-surface:var(--app-theme-surface-raised,var(--surface-raised))]",
              "border-(--app-theme-toolbar-border,var(--border)) bg-(--overview-surface)/(--glass-opacity) backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-saturation)",
              "not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:bg-(--overview-surface)",
            )}
          >
            <div className="max-h-[min(70vh,var(--available-height))] space-y-4 overflow-y-auto p-5">
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
                      className={cn("size-3 transition-transform", sourcesExpanded && "rotate-180")}
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
                                  (!isVideoAttachment(source) || source.previewUrl === undefined)))
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
                          <FileIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
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
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}

export function ThreadOverviewPanel(props: ThreadOverviewPanelProps) {
  const wide = useMediaQuery("xl");
  // Resizing into the narrow layout or navigating starts with its transient overlay closed.
  return <OverviewPopover key={`${props.threadKey}:${wide}`} {...props} wide={wide} />;
}
