import type { EnvironmentId } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";

import { useScratchProject } from "~/hooks/useScratchProject";
import { Button } from "../ui/button";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function RecentThreadsHeader({ environmentId }: { environmentId: EnvironmentId | null }) {
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const { isMobile, setOpenMobile } = useSidebar();
  const targetEnvironmentId = scratchEnvironmentId(environmentId);

  return (
    <div className="sticky top-0 z-[1] flex items-center justify-between bg-sidebar pl-2 pr-1.5">
      <span className="text-xs font-medium text-sidebar-muted-foreground/80">Recent</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="New thread without a project"
              disabled={targetEnvironmentId === null}
              onClick={() => {
                if (targetEnvironmentId === null) return;
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
