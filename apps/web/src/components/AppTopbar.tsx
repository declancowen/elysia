import { useCanGoBack } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "~/icons";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { useSidebarVisibility } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

export function AppTopbar({ sidebarControl }: { sidebarControl: ReactNode }) {
  const canGoBack = useCanGoBack();
  const sidebarVisible = useSidebarVisibility();
  return (
    <header
      data-app-topbar=""
      className={cn(
        "hidden h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 md:flex",
        isElectron && "drag-region",
      )}
      style={{
        paddingInlineStart: "var(--workspace-controls-left)",
        paddingInlineEnd: "var(--workspace-controls-right)",
      }}
    >
      <div
        className="[-webkit-app-region:no-drag] flex min-w-24 shrink-0 items-center gap-1"
        style={
          sidebarVisible
            ? {
                width:
                  "calc(var(--app-navigation-rail-width) + var(--workspace-sidebar-width, var(--sidebar-width)) - var(--workspace-controls-left) - 0.75rem)",
              }
            : undefined
        }
      >
        {sidebarControl}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Back"
                disabled={!canGoBack}
                variant="ghost-muted"
                size="icon-sm"
                onClick={() => window.history.back()}
              >
                <ArrowLeftIcon />
              </Button>
            }
          />
          <TooltipPopup side="bottom">Back</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Forward"
                variant="ghost-muted"
                size="icon-sm"
                onClick={() => window.history.forward()}
              >
                <ArrowRightIcon />
              </Button>
            }
          />
          <TooltipPopup side="bottom">Forward</TooltipPopup>
        </Tooltip>
      </div>
      <div
        id="elysia-app-topbar-content"
        data-app-topbar-content=""
        className="flex h-full min-w-0 flex-1 items-center"
      />
    </header>
  );
}
