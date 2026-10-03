import { useCanGoBack, useLocation } from "@tanstack/react-router";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "~/icons";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
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
  const pathname = useLocation({ select: (location) => location.pathname });
  const showWorkspaceDivider =
    pathname !== "/agents" &&
    !pathname.startsWith("/agents/") &&
    !pathname.startsWith("/settings") &&
    pathname !== "/projects" &&
    pathname !== "/usage" &&
    pathname !== "/pull-requests";
  return (
    <header
      data-app-topbar=""
      className={cn(
        "relative mt-1 hidden h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 md:flex",
        isElectron && "drag-region",
      )}
      style={{
        paddingInlineStart: "var(--workspace-controls-left)",
        paddingInlineEnd: "var(--workspace-controls-right)",
      }}
    >
      <div
        className="[-webkit-app-region:no-drag] flex min-w-0 shrink-0 items-center"
        style={
          sidebarVisible
            ? {
                width:
                  "calc(var(--app-navigation-rail-width) + var(--workspace-sidebar-width, var(--sidebar-width)) - var(--workspace-controls-left) - 0.75rem)",
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
      </div>
      <div
        id={TOPBAR_CONTENT_ID}
        data-app-topbar-content=""
        className={cn(
          "relative flex h-full min-w-0 flex-1 items-center bg-sidebar",
          sidebarControl !== null &&
            showWorkspaceDivider &&
            "before:absolute before:-left-px before:top-2 before:bottom-2 before:w-px before:bg-workspace-panel-border",
        )}
      />
    </header>
  );
}
