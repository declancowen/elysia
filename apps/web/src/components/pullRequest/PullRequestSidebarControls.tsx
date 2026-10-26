import { SINGLE_PROVIDER_UI } from "@elysiatools/contracts";
import type { ReactNode } from "react";
import { ChevronDownIcon } from "~/icons";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { RefreshIcon } from "../ui/refresh-icon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  PullRequestFilterOptionIcon,
  type PullRequestFilterOption,
} from "./PullRequestListFilters";

export { INVOLVEMENT_TABS, SORT_OPTIONS, STATE_TABS } from "./pullRequestListOptions";

export function PullRequestRefreshControl({
  compact = false,
  refreshing,
  onRefresh,
}: {
  compact?: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size={SINGLE_PROVIDER_UI && compact ? "icon-xs" : compact ? "icon-sm" : "icon"}
            variant={SINGLE_PROVIDER_UI || compact ? "ghost" : "outline"}
            aria-label="Refresh pull requests"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshIcon size="md" refreshing={refreshing} />
          </Button>
        }
      />
      <TooltipPopup>Refresh pull requests</TooltipPopup>
    </Tooltip>
  );
}
export function CompactFilterMenu<Value extends string>({
  label,
  triggerIcon,
  triggerLabel,
  outlined = false,
  iconOnly = false,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  triggerIcon?: ReactNode;
  triggerLabel?: string;
  outlined?: boolean;
  iconOnly?: boolean;
  value: Value;
  options: ReadonlyArray<PullRequestFilterOption<Value>>;
  onChange: (value: Value) => void;
  className?: string;
}) {
  const current = options.find((option) => option.value === value) ?? options[0];
  if (!current) return null;
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              aria-label={triggerLabel || iconOnly ? `${label}: ${current.label}` : label}
              render={
                outlined ? (
                  <Button
                    variant={
                      SINGLE_PROVIDER_UI && iconOnly
                        ? "ghost"
                        : SINGLE_PROVIDER_UI
                          ? "secondary"
                          : "outline"
                    }
                    size={
                      SINGLE_PROVIDER_UI && iconOnly ? "icon-xs" : iconOnly ? "icon" : "default"
                    }
                  />
                ) : (
                  <Button variant="ghost-muted" size="sm" />
                )
              }
              className={cn("min-w-0", className)}
            >
              {iconOnly ? (
                triggerLabel === "Sort" ? (
                  triggerIcon
                ) : (
                  <current.Icon aria-hidden className="size-4" />
                )
              ) : triggerLabel ? (
                <>
                  {triggerIcon}
                  <span>{triggerLabel}</span>
                </>
              ) : (
                <>
                  <span className="truncate">{current.label}</span>
                  <ChevronDownIcon
                    aria-hidden
                    className="size-3 shrink-0 text-muted-foreground/70"
                  />
                </>
              )}
            </MenuTrigger>
          }
        />
        <TooltipPopup>
          {label}: {current.label}
        </TooltipPopup>
      </Tooltip>
      <MenuPopup align="start" side="bottom">
        <MenuRadioGroup value={value} onValueChange={(next) => onChange(next as Value)}>
          {options.map((option) => {
            const item = (
              <MenuRadioItem
                key={option.value}
                value={option.value}
                disabled={option.unavailable !== undefined}
                className="data-disabled:pointer-events-auto"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <PullRequestFilterOptionIcon option={option} />
                  {option.label}
                </span>
              </MenuRadioItem>
            );
            return option.unavailable === undefined ? (
              item
            ) : (
              <Tooltip key={option.value}>
                <TooltipTrigger render={item} />
                <TooltipPopup side="right">{option.unavailable}</TooltipPopup>
              </Tooltip>
            );
          })}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
