import { Fragment, useCallback, type ReactNode } from "react";
import { useTabOverflow } from "../../hooks/useTabOverflow";
import { ChevronLeft, ChevronRight, X } from "../../icons";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function WorkspaceTabStrip<T extends { id: string }>({
  tabs,
  activeId,
  onSelect,
  onClose,
  label,
  renderTab,
}: {
  tabs: readonly T[];
  activeId: string | null;
  onSelect: (tab: T) => void;
  onClose: (tab: T) => void;
  label: string;
  renderTab: (tab: T, controls: WorkspaceTabControls) => ReactNode;
}) {
  const { tabListRef, tabScrollState, scrollTabs } = useTabOverflow(activeId);
  const moveTab = useCallback(
    (index: number, direction: -1 | 1 | "first" | "last") => {
      const nextIndex =
        direction === "first"
          ? 0
          : direction === "last"
            ? tabs.length - 1
            : (index + direction + tabs.length) % tabs.length;
      const next = tabs[nextIndex]!;
      onSelect(next);
      tabListRef.current
        ?.querySelector<HTMLButtonElement>(`[data-workspace-tab-id="${next.id}"]`)
        ?.focus();
    },
    [tabs, onSelect, tabListRef],
  );
  return (
    <div
      data-workspace-tab-strip
      className="flex h-full min-w-0 flex-1 items-center gap-1 [-webkit-app-region:no-drag]"
    >
      <ScrollArea
        ref={tabListRef}
        hideScrollbars
        radius="none"
        viewportTabIndex={-1}
        className="min-w-0 flex-1"
      >
        <div
          role="tablist"
          aria-label={label}
          className="flex h-full w-max min-w-full items-center gap-1"
        >
          {tabs.map((tab, index) => (
            <Fragment key={tab.id}>
              {renderTab(tab, {
                id: tab.id,
                active: tab.id === activeId,
                tabIndex: tab.id === activeId || (activeId === null && index === 0) ? 0 : -1,
                canClose: index > 0,
                onSelect: () => onSelect(tab),
                onClose: () => onClose(tab),
                onMove: (direction) => moveTab(index, direction),
              })}
            </Fragment>
          ))}
        </div>
      </ScrollArea>
      {tabScrollState.hasOverflow ? (
        <div
          role="group"
          aria-label={`Scroll ${label.toLowerCase()} tabs`}
          className="flex shrink-0 items-center gap-0.5"
        >
          <Button
            data-workspace-header-action=""
            variant="ghost"
            size="icon-sm"
            aria-label={`Scroll ${label.toLowerCase()} tabs left`}
            disabled={!tabScrollState.canScrollLeft}
            onClick={() => scrollTabs(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            data-workspace-header-action=""
            variant="ghost"
            size="icon-sm"
            aria-label={`Scroll ${label.toLowerCase()} tabs right`}
            disabled={!tabScrollState.canScrollRight}
            onClick={() => scrollTabs(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface WorkspaceTabControls {
  id: string;
  active: boolean;
  tabIndex: 0 | -1;
  canClose: boolean;
  onSelect: () => void;
  onClose: () => void;
  onMove: (direction: -1 | 1 | "first" | "last") => void;
}

export function WorkspaceTab({
  id,
  active,
  tabIndex,
  canClose,
  onSelect,
  onClose,
  onMove,
  title,
  icon,
}: WorkspaceTabControls & { title: string; icon: ReactNode }) {
  return (
    <div
      data-active-tab={active}
      onContextMenu={(event) => {
        if (active) return;
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      className={cn(
        "workspace-topbar-tab group/tab flex h-[calc(var(--workspace-topbar-height)-0.5rem)] max-w-52 shrink-0 items-center gap-1 rounded-lg px-2 text-sm",
        active
          ? "bg-workspace-tab-active text-workspace-tab-foreground"
          : "bg-transparent text-muted-foreground hover:text-workspace-tab-foreground",
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              role="tab"
              aria-selected={active}
              tabIndex={tabIndex}
              type="button"
              data-workspace-tab-id={id}
              className="flex min-w-0 cursor-pointer items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onSelect}
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowLeft"
                    ? -1
                    : event.key === "ArrowRight"
                      ? 1
                      : event.key === "Home"
                        ? "first"
                        : event.key === "End"
                          ? "last"
                          : null;
                if (direction === null) return;
                event.preventDefault();
                event.stopPropagation();
                onMove(direction);
              }}
            />
          }
        >
          {icon}
          <span className="truncate">{title}</span>
        </TooltipTrigger>
        <TooltipPopup>{title}</TooltipPopup>
      </Tooltip>
      {canClose ? (
        <Button
          data-workspace-header-action=""
          variant="ghost"
          size="icon-xs"
          aria-label={`Close ${title} tab`}
          onClick={onClose}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
