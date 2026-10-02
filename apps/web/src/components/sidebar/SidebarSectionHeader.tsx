import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "~/icons";

import { resolveProjectExpanded, useUiStateStore } from "~/uiStateStore";

export function useSidebarSectionExpansion(key: string) {
  const expanded = useUiStateStore((state) =>
    resolveProjectExpanded(state.projectExpandedById, [key]),
  );
  const setProjectExpanded = useUiStateStore((state) => state.setProjectExpanded);
  return { expanded, setExpanded: (value: boolean) => setProjectExpanded(key, value) };
}

export function SidebarSectionHeader({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const labelClassName =
    "flex h-9 w-full items-center gap-1.5 rounded-md px-2.5 text-left text-sidebar-section font-normal text-sidebar-foreground";
  return (
    <div className="group/section-header relative mb-1">
      <button
        type="button"
        aria-label={label}
        aria-expanded={expanded}
        onClick={onToggle}
        className={`${labelClassName} cursor-pointer hover:bg-sidebar-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring`}
      >
        <span className="saturate-0">{label}</span>
        {expanded ? (
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 saturate-0 opacity-0 group-hover/section-header:opacity-100 group-focus-within/section-header:opacity-100"
          />
        ) : (
          <ChevronRightIcon aria-hidden className="size-3.5 saturate-0" />
        )}
      </button>
      <div className="absolute top-1/2 right-0.5 flex -translate-y-1/2 items-center gap-1">
        {children}
      </div>
    </div>
  );
}
