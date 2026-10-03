import { useCanGoBack } from "@tanstack/react-router";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "~/icons";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { SidebarNewChatButton } from "./sidebar/SidebarChrome";
import { ElysiaIcon } from "./Icons";
import { useSidebarVisibility } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const TOPBAR_CONTENT_ID = "elysia-app-topbar-content";

/** Header owners share the host rendered by the application shell. */
export function useAppTopbarHost() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(document.getElementById(TOPBAR_CONTENT_ID));
  }, []);
  return host;
}

export function AppTopbar({ sidebarControl }: { sidebarControl: ReactNode }) {
  const canGoBack = useCanGoBack();
  const sidebarVisible = useSidebarVisibility();
  return (
    <header
      data-app-topbar=""
      className={cn(
        "relative mt-1 hidden h-[var(--workspace-topbar-height)] shrink-0 items-center gap-4 md:flex",
        isElectron && "drag-region",
      )}
      style={{
        paddingInlineStart: "var(--workspace-controls-left)",
        paddingInlineEnd: "var(--workspace-controls-right)",
      }}
    >
      <div
        className="[-webkit-app-region:no-drag] flex min-w-max shrink-0 items-center"
        style={
          sidebarVisible
            ? {
                width:
                  "calc(var(--app-navigation-rail-width) + var(--workspace-sidebar-width, var(--sidebar-width)) - var(--workspace-controls-left) - 1rem)",
              }
            : undefined
        }
      >
        <div
          className="relative shrink-0"
          style={{
            width:
              "max(calc(var(--app-navigation-rail-width) + 0.75rem - var(--workspace-controls-left)), 2.5rem)",
          }}
        >
          <span role="img" aria-label="Elysia">
            <ElysiaIcon aria-hidden className="ml-1 size-6" />
          </span>
        </div>
        <div className="flex items-center gap-1">
          {sidebarControl}
          {!sidebarVisible ? <SidebarNewChatButton iconOnly /> : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Back"
                  data-workspace-header-action=""
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
                  data-workspace-header-action=""
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
      </div>
      <div
        id={TOPBAR_CONTENT_ID}
        data-app-topbar-content=""
        className="relative flex h-full min-w-0 flex-1 items-center bg-sidebar"
      />
    </header>
  );
}
