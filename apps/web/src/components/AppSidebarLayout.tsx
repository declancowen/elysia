import { useAtomValue } from "@effect/atom-react";
import * as Schema from "effect/Schema";
import { SINGLE_PROVIDER_UI } from "@t3tools/contracts";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";

import { isElectron } from "../env";
import { getLocalStorageItem, removeLocalStorageItem } from "../hooks/useLocalStorage";
import {
  isRichTextBoldShortcut,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../keybindings";
import { isEditableFocused } from "../lib/editableFocus";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { selectActiveRightPanel, useRightPanelStore } from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { resolveThreadRouteRef } from "../threadRoutes";
import { cn, isMacPlatform } from "../lib/utils";
import { primaryServerKeybindingsAtom } from "../state/server";
import { useEnvironmentIdentificationMode, useLegacySidebarEnabled } from "../hooks/useSettings";
import {
  PanelAnimationSuppressionProvider,
  usePanelAnimationSettings,
  usePanelNavigationSuppression,
} from "../panelAnimations";
import LegacyThreadSidebar from "./LegacySidebar";
import { useThreadVisitedMigration } from "../hooks/useThreadVisitedMigration";
import ThreadSidebar from "./Sidebar";
import { AgentsSidebar } from "./agents/AgentsSidebar";
import {
  agentSidebarActiveForPath,
  setAgentSidebarActive,
  useAgentSidebarStore,
} from "./agents/agentSidebarStore";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import {
  WorkspaceSidebarContentHost,
  WorkspaceSidebarContentProvider,
} from "./sidebar/WorkspaceSidebarContent";
import { AppNavigationRail, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { AppTopbar } from "./AppTopbar";
import { MainAppLocationTracker, isSidebarUtilityPage } from "./sidebar/mainAppLocation";
import { useSidebarStageBackdropVariant } from "./SidebarStageBackdrop";
import { useArchivedConversationTabs } from "../hooks/useConversationTabNavigation";
import { useProjects } from "../state/entities";
import {
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  APP_NAVIGATION_RAIL_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./threadSidebarWidth";
import {
  Sidebar,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
  useSidebarVisibility,
} from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "var(--desktop-window-controls-inset, 90px)";

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

function readInitialThreadSidebarWidth(storageKey = THREAD_SIDEBAR_WIDTH_STORAGE_KEY): number {
  try {
    return resolveInitialThreadSidebarWidth(
      getLocalStorageItem(storageKey, Schema.Finite),
      window.innerWidth,
    );
  } catch (error) {
    console.error("Could not read persisted thread sidebar width.", error);
    return resolveInitialThreadSidebarWidth(null, window.innerWidth);
  }
}

function SidebarControl() {
  const usagePageOpen = useLocation({ select: (location) => location.pathname === "/usage" });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();
  const isSidebarVisible = useSidebarVisibility();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const stageBackdropVariant = useSidebarStageBackdropVariant(
    environmentIdentificationMode === "artwork",
  );
  const shortcutLabel = shortcutLabelForCommand(keybindings, "sidebar.toggle", {
    context: { usagePageOpen },
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }
      if (
        isRichTextBoldShortcut(event) &&
        event.target instanceof HTMLElement &&
        event.target.closest('[data-composer-rich-text="true"]')
      ) {
        // The rich-text composer claims Mod+B for bold; the toggle stays
        // available everywhere else, including the plain-text composer.
        return;
      }
      if (
        resolveShortcutCommand(event, keybindings, { context: { usagePageOpen } }) !==
        "sidebar.toggle"
      )
        return;

      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };

    // Capture before focused editors consume commands such as Mod+B for rich-text formatting.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings, toggleSidebar, usagePageOpen]);

  return (
    <div
      className={cn(
        "flex items-center",
        !SINGLE_PROVIDER_UI &&
          "pointer-events-none fixed left-[var(--workspace-controls-left)] top-[var(--workspace-controls-top)] z-50 ml-px h-[var(--workspace-topbar-height)]",
      )}
      data-sidebar-control=""
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarTrigger
              // Over the stage artwork the trigger is a control on imagery, like the media
              // viewer's arrows; that variant positions itself, so the layout is reset here.
              variant={isSidebarVisible && stageBackdropVariant ? "media-navigation" : "ghost"}
              className={cn(
                "pointer-events-auto",
                isSidebarVisible && stageBackdropVariant && "relative top-auto translate-y-0",
              )}
              aria-label="Toggle main sidebar"
            />
          }
        />
        <TooltipPopup side="bottom">
          Toggle main sidebar{shortcutLabel ? ` (${shortcutLabel})` : ""}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

// Moves through the app's route history like a browser's back/forward buttons.
function NavigationHistoryShortcuts() {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen: routeThreadRef
            ? selectThreadTerminalUiState(
                useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
                routeThreadRef,
              ).terminalOpen
            : false,
          previewFocus: isPreviewFocused(),
          previewOpen: routeThreadRef
            ? selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, routeThreadRef) ===
              "preview"
            : false,
          editableFocus: isEditableFocused(event.target),
          modelPickerOpen: isModelPickerOpen(),
        },
      });
      if (command !== "navigation.back" && command !== "navigation.forward") return;

      event.preventDefault();
      event.stopPropagation();
      if (command === "navigation.back") window.history.back();
      else window.history.forward();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybindings, routeThreadRef]);

  return null;
}

// Settings swaps the thread sidebar out of the tree. Keep the lightweight
// project projection subscribed so returning to a draft never renders the
// zero-project state while the environment snapshot reconnects.
function ProjectProjectionRetention() {
  useProjects();
  return null;
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  useArchivedConversationTabs();
  const legacySidebarEnabled = useLegacySidebarEnabled();
  const { active: panelAnimationsActive, durationMs: panelAnimationDurationMs } =
    usePanelAnimationSettings();
  // Settings routes show the settings nav in place of whichever thread
  // sidebar is active.
  // Seeds server-side visited tracking from this browser's localStorage the
  useThreadVisitedMigration();
  const pathname = useLocation({ select: (location) => location.pathname });
  const panelAnimationsSuppressed = usePanelNavigationSuppression(pathname);
  const routePanelAnimationsActive = panelAnimationsActive && !panelAnimationsSuppressed;
  const isOnSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const isOnScheduled = SINGLE_PROVIDER_UI && pathname === "/settings/scheduled-tasks";
  const isPullRequestsPage = SINGLE_PROVIDER_UI && pathname === "/pull-requests";
  const isProjectsPage =
    pathname === "/projects" ||
    pathname === "/tasks" ||
    pathname === "/pages" ||
    pathname.startsWith("/pages/");
  const editingAgent = useLocation({
    select: (location) =>
      location.pathname === "/agents" &&
      (location.search.create === true || Boolean(location.search.projectId)),
  });
  const agentSidebarSelected = useAgentSidebarStore((state) => state.active);
  const showAgentsSidebar =
    SINGLE_PROVIDER_UI && agentSidebarActiveForPath(pathname, agentSidebarSelected, editingAgent);
  useEffect(() => {
    if (!SINGLE_PROVIDER_UI) return;
    if (editingAgent) return;
    if (pathname === "/agents" || pathname.startsWith("/agents/")) setAgentSidebarActive(true);
    else if (isSidebarUtilityPage(pathname)) setAgentSidebarActive(false);
  }, [pathname, editingAgent]);
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const sidebarSurface = isOnScheduled
    ? "scheduled"
    : isPullRequestsPage
      ? "pull-requests"
      : showAgentsSidebar
        ? "agents"
        : isOnSettings
          ? "settings"
          : "workspace";
  const sidebarStorageKey =
    SINGLE_PROVIDER_UI && sidebarSurface !== "workspace"
      ? `${THREAD_SIDEBAR_WIDTH_STORAGE_KEY}_${sidebarSurface}`
      : THREAD_SIDEBAR_WIDTH_STORAGE_KEY;
  const [sidebarWidths, setSidebarWidths] = useState<Record<string, number>>({});
  const initialSidebarWidth = useMemo(
    () => readInitialThreadSidebarWidth(sidebarStorageKey),
    [sidebarStorageKey],
  );
  const sidebarWidth = sidebarWidths[sidebarStorageKey] ?? initialSidebarWidth;
  const setSidebarWidth = (width: number) =>
    setSidebarWidths((widths) =>
      widths[sidebarStorageKey] === width ? widths : { ...widths, [sidebarStorageKey]: width },
    );
  // Subscribed rather than read once: the clamp must track live window size,
  // and a clamped drag ends with an unchanged width, which skips the re-render
  // that would otherwise refresh a render-time snapshot.
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const hideThreadSidebar = (isProjectsPage || pathname === "/usage") && viewportWidth >= 768;
  const sidebarMaximumWidth = resolveThreadSidebarMaximumWidth(viewportWidth);
  const resetSidebarWidth = () => {
    try {
      removeLocalStorageItem(sidebarStorageKey);
    } catch (error) {
      console.error("Could not clear persisted thread sidebar width.", error);
    }
    setSidebarWidth(resolveInitialThreadSidebarWidth(null, viewportWidth));
  };
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(() => {
    const getWindowFullscreenState = window.desktopBridge?.getWindowFullscreenState;
    return isMacosDesktop && typeof getWindowFullscreenState === "function"
      ? getWindowFullscreenState()
      : false;
  });
  const sidebarProviderStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--workspace-sidebar-width": hideThreadSidebar ? "0px" : "var(--sidebar-width)",
    "--workspace-mobile-header-inset": "calc(var(--workspace-controls-left) + 2.5rem)",
    "--app-navigation-rail-width": `${APP_NAVIGATION_RAIL_WIDTH}px`,
    "--panel-animation-duration": `${panelAnimationDurationMs}ms`,
    ...(isMacosDesktop && !isWindowFullscreen
      ? { "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET }
      : {}),
  } as CSSProperties;

  useEffect(() => {
    if (!isMacosDesktop) return;
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const { getWindowFullscreenState, onWindowFullscreenStateChange } = bridge;
    if (
      typeof getWindowFullscreenState !== "function" ||
      typeof onWindowFullscreenStateChange !== "function"
    ) {
      return;
    }

    const unsubscribe = onWindowFullscreenStateChange(setIsWindowFullscreen);
    setIsWindowFullscreen(getWindowFullscreenState());
    return unsubscribe;
  }, [isMacosDesktop]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        const isSettingsRoute = /^\/settings(\/|$)/.test(pathname);
        if (!isSettingsRoute) {
          void navigate({ to: "/settings" });
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate, pathname]);

  return (
    <PanelAnimationSuppressionProvider value={panelAnimationsSuppressed}>
      <WorkspaceSidebarContentProvider>
        <SidebarProvider
          className={cn("h-dvh! min-h-0!", SINGLE_PROVIDER_UI && "md:flex-col")}
          data-panel-animations={routePanelAnimationsActive ? "true" : "false"}
          defaultOpen
          style={sidebarProviderStyle}
        >
          <ProjectProjectionRetention />
          {SINGLE_PROVIDER_UI ? (
            <AppTopbar sidebarControl={hideThreadSidebar ? null : <SidebarControl />} />
          ) : null}
          {SINGLE_PROVIDER_UI ? (
            <div
              data-mobile-sidebar-control
              className="fixed left-[var(--workspace-controls-left)] top-[var(--workspace-controls-top)] z-50 flex h-[var(--workspace-topbar-height)] items-center md:hidden"
            >
              <Tooltip>
                <TooltipTrigger render={<SidebarTrigger aria-label="Toggle main sidebar" />} />
                <TooltipPopup side="bottom">Toggle main sidebar</TooltipPopup>
              </Tooltip>
            </div>
          ) : null}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1",
              SINGLE_PROVIDER_UI &&
                "md:h-[calc(100dvh-var(--workspace-topbar-height)-0.25rem)] md:pt-1 md:pb-2 md:[&>[data-slot=sidebar-inset]]:h-full",
            )}
          >
            {SINGLE_PROVIDER_UI ? <AppNavigationRail /> : null}
            {!hideThreadSidebar ? (
              <Sidebar
                className={
                  SINGLE_PROVIDER_UI
                    ? "md:top-[calc(var(--workspace-topbar-height)+0.5rem)] md:left-[var(--app-navigation-rail-width)] md:h-[calc(100dvh-var(--workspace-topbar-height)-1rem)] md:group-data-[collapsible=offcanvas]:left-[calc(var(--app-navigation-rail-width)-var(--sidebar-width))]"
                    : undefined
                }
                side="left"
                variant={SINGLE_PROVIDER_UI ? "panel" : "sidebar"}
                collapsible="offcanvas"
                data-app-sidebar=""
                role="navigation"
                aria-label={
                  isPullRequestsPage
                    ? "Pull requests"
                    : isOnScheduled
                      ? "Scheduled"
                      : isOnSettings
                        ? "Settings"
                        : showAgentsSidebar
                          ? "Agents"
                          : "Threads"
                }
                resizable={{
                  maxWidth: sidebarMaximumWidth,
                  minWidth: THREAD_SIDEBAR_MIN_WIDTH,
                  shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
                    nextWidth <= currentWidth ||
                    wrapper.clientWidth - nextWidth - APP_NAVIGATION_RAIL_WIDTH >=
                      THREAD_MAIN_CONTENT_MIN_WIDTH,
                  storageKey: sidebarStorageKey,
                  onResize: setSidebarWidth,
                }}
              >
                {isOnScheduled || isPullRequestsPage ? (
                  <WorkspaceSidebarContentHost />
                ) : isOnSettings ? (
                  <>
                    <SidebarChromeHeader isElectron={isElectron} title="Settings" />
                    <SettingsSidebarNav pathname={pathname} />
                  </>
                ) : showAgentsSidebar ? (
                  <AgentsSidebar />
                ) : legacySidebarEnabled ? (
                  <LegacyThreadSidebar />
                ) : (
                  <ThreadSidebar />
                )}
                <SidebarRail onDoubleClick={resetSidebarWidth} />
              </Sidebar>
            ) : null}
            {children}
          </div>
          {!SINGLE_PROVIDER_UI ? <SidebarControl /> : null}
          <NavigationHistoryShortcuts />
          <MainAppLocationTracker />
        </SidebarProvider>
      </WorkspaceSidebarContentProvider>
    </PanelAnimationSuppressionProvider>
  );
}
