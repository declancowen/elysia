import type { EnvironmentId } from "@t3tools/contracts";
import { MessageSquareDashedIcon, PlusIcon } from "lucide-react";

import { useScratchProject } from "~/hooks/useScratchProject";
import { resolveProjectExpanded, useUiStateStore } from "~/uiStateStore";
import { Button } from "../ui/button";
import { SidebarMenuButton, useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export const RECENT_THREADS_EXPANSION_KEY = "sidebar-recent";

export function useRecentThreadsExpansion() {
  const expanded = useUiStateStore((state) =>
    resolveProjectExpanded(state.projectExpandedById, [RECENT_THREADS_EXPANSION_KEY]),
  );
  const setProjectExpanded = useUiStateStore((state) => state.setProjectExpanded);
  return {
    expanded,
    setExpanded: (value: boolean) => setProjectExpanded(RECENT_THREADS_EXPANSION_KEY, value),
  };
}

export function RecentThreadsHeader({ environmentId }: { environmentId: EnvironmentId | null }) {
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const { isMobile, setOpenMobile } = useSidebar();
  const targetEnvironmentId = scratchEnvironmentId(environmentId);
  const { expanded, setExpanded } = useRecentThreadsExpansion();

  return (
    <div className="sticky top-0 z-[1]">
      <SidebarMenuButton
        aria-label="Recent threads"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex shrink-0">
          <MessageSquareDashedIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground/90">
          Recent
        </span>
        <span aria-hidden className="w-4 shrink-0" />
      </SidebarMenuButton>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="New thread without a project"
              disabled={targetEnvironmentId === null}
              className="absolute top-1/2 right-0.5 -translate-y-1/2"
              onClick={() => {
                if (targetEnvironmentId === null) return;
                setExpanded(true);
                if (isMobile) setOpenMobile(false);
                void startScratchThread(targetEnvironmentId);
              }}
            />
          }
        >
          <PlusIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">New thread without a project</TooltipPopup>
      </Tooltip>
    </div>
  );
}
