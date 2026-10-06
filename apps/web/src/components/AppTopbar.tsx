import { useLocation, useParams, useCanGoBack } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "~/icons";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { SidebarNewChatButton } from "./sidebar/SidebarChrome";
import { ElysiaIcon } from "./Icons";
import { useSidebarVisibility } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

import { useConversationTabsStore } from "../conversationTabsStore";
import { surfaceTabForLocation } from "../surfaceTabs";
import { ConversationTabs } from "./chat/ConversationTabs";

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
  const location = useLocation();
  useEffect(() => {
    const target = surfaceTabForLocation(location.pathname, location.search);
    if (!target) return;
    const store = useConversationTabsStore.getState();
    const active = store.tabs.find((tab) => tab.id === store.activeId);
    store.open(
      target,
      active?.target.kind !== "surface" ||
        (active.target.path !== target.path &&
          !(active.target.path.startsWith("/settings/") && target.path.startsWith("/settings/"))),
    );
  }, [location.pathname, location.search]);
  const params = useParams({ strict: false });
  const chatHeader = Boolean(params.threadId || params.draftId);
  const canGoBack = useCanGoBack();
  const sidebarVisible = useSidebarVisibility();
  return (
    <header
      data-app-topbar=""
      data-sidebar-visible={sidebarVisible}
      className={cn(
        "relative mt-1 hidden h-[var(--workspace-topbar-height)] shrink-0 items-center gap-1 md:flex",
        isElectron && "drag-region",
      )}
      style={{
        paddingInlineStart: "var(--workspace-controls-left)",
        paddingInlineEnd: "var(--workspace-controls-right)",
      }}
    >
      <div className="[-webkit-app-region:no-drag] flex min-w-max shrink-0 items-center">
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
          <SidebarNewChatButton iconOnly />
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
      <div aria-hidden="true" className="workspace-topbar-divider mx-1 shrink-0" />
      <div
        id={TOPBAR_CONTENT_ID}
        data-app-topbar-content=""
        className="relative flex h-full min-w-0 flex-1 items-center bg-sidebar"
      >
        {!chatHeader && <ConversationTabs />}
      </div>
    </header>
  );
}
