import type { EnvironmentId } from "@t3tools/contracts";
import { PlusIcon } from "~/icons";

import { useScratchProject } from "~/hooks/useScratchProject";
import { Button } from "../ui/button";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarSectionHeader, useSidebarSectionExpansion } from "./SidebarSectionHeader";

export const RECENT_THREADS_EXPANSION_KEY = "sidebar-recent";

export function useRecentThreadsExpansion() {
  return useSidebarSectionExpansion(RECENT_THREADS_EXPANSION_KEY);
}

export function RecentThreadsHeader({ environmentId }: { environmentId: EnvironmentId | null }) {
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const { isMobile, setOpenMobile } = useSidebar();
  const targetEnvironmentId = scratchEnvironmentId(environmentId);
  const { expanded, setExpanded } = useRecentThreadsExpansion();

  return (
    <div className="sticky top-0 z-[1]">
      <SidebarSectionHeader
        label="Chats"
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label="New chat"
                disabled={targetEnvironmentId === null}
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
          <TooltipPopup side="right">New chat</TooltipPopup>
        </Tooltip>
      </SidebarSectionHeader>
    </div>
  );
}
