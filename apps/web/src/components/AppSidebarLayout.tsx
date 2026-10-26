import { useAtomValue } from "@effect/atom-react";
import { SINGLE_PROVIDER_UI } from "@elysiatools/contracts";
import { useLocation, useRouter, type AnyRouter } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useAgentDialogStore } from "./agents/agentDialogStore";
import { AgentSectionDialog } from "./agents/AgentSidebarOrganization";

import { isCommandPaletteOpen } from "../commandPaletteBus";
import { isElectron } from "../env";
import {
  releaseThreadUndoShortcut,
  threadUndoClaimsShortcut,
  undoLatestThreadAction,
} from "../hooks/showThreadUndoNotice";
import { useArchivedConversationTabs } from "../hooks/useConversationTabNavigation";
import { getLocalStorageItem, removeLocalStorageItem } from "../hooks/useLocalStorage";
import { getEnvironmentIdentificationMode, useLegacySidebarEnabled } from "../hooks/useSettings";
import {
  isRichTextBoldShortcut,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../keybindings";
import { isEditableFocused } from "../lib/editableFocus";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { cn, isMacPlatform } from "../lib/utils";
import { isModelPickerOpen } from "../modelPickerVisibility";
import {
  PanelAnimationSuppressionProvider,
  usePanelAnimationSettings,
  usePanelNavigationSuppression,
} from "../panelAnimations";
import { selectActiveRightPanel, useRightPanelStore } from "../rightPanelStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { registerCommands, registerMenuAction } from "../shortcuts/dispatcher";
import { useProjects } from "../state/entities";
import { primaryServerKeybindingsAtom } from "../state/server";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { resolveThreadRouteRef } from "../threadRoutes";
import {
  agentSidebarActiveForPath,
  setAgentSidebarActive,
  useAgentSidebarStore,
} from "./agents/agentSidebarStore";
import { AgentsSidebar } from "./agents/AgentsSidebar";
import { AppTopbar } from "./AppTopbar";
import LegacyThreadSidebar from "./LegacySidebar";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import ThreadSidebar from "./Sidebar";
import { isAppModalPage, isSidebarUtilityPage } from "./sidebar/mainAppLocation";
import { AppNavigationRail, SidebarBrandWidthProbe } from "./sidebar/SidebarChrome";
import { CollectionSidebar } from "./sidebar/SidebarHoverContents";
import { SidebarHoverPreviewProvider } from "./sidebar/SidebarHoverPreview";
import {
  WorkspaceSidebarContentHost,
  WorkspaceSidebarContentProvider,
} from "./sidebar/WorkspaceSidebarContent";
import { useSidebarStageBackdropVariant } from "./SidebarStageBackdrop";
import {
  APP_NAVIGATION_RAIL_WIDTH,
  clampThreadSidebarWidth,
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  resolveThreadSidebarMinimumWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
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

import type { SidebarRouteReveal } from "./sidebar/routeReveal";

const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "var(--desktop-window-controls-inset, 90px)";

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

// Cache the synchronous fullscreen IPC read until subscription.
let windowFullscreenSnapshot: boolean | null = null;

function macosDesktopBridge() {
  if (!isElectron || !isMacPlatform(navigator.platform)) return null;
  return window.desktopBridge ?? null;
}

function subscribeToWindowFullscreen(onChange: () => void): () => void {
  const bridge = macosDesktopBridge();
  if (
    typeof bridge?.getWindowFullscreenState !== "function" ||
    typeof bridge.onWindowFullscreenStateChange !== "function"
  ) {
    return () => {};
  }
  const unsubscribe = bridge.onWindowFullscreenStateChange((fullscreen) => {
    windowFullscreenSnapshot = fullscreen;
    onChange();
  });
  // The window may have changed state between the first render and this subscription.
  windowFullscreenSnapshot = bridge.getWindowFullscreenState();
  return () => {
    unsubscribe();
    windowFullscreenSnapshot = null;
  };
}

function readWindowFullscreen(): boolean {
  if (windowFullscreenSnapshot === null) {
    const getWindowFullscreenState = macosDesktopBridge()?.getWindowFullscreenState;
    windowFullscreenSnapshot =
      typeof getWindowFullscreenState === "function" ? getWindowFullscreenState() : false;
  }
  return windowFullscreenSnapshot;
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

function readUsagePageOpen(router: AnyRouter) {
  return router.state.location.pathname === "/usage";
}

function isKeybindingCaptureTarget(event: KeyboardEvent) {
  return event.target instanceof HTMLElement && event.target.closest("[data-keybinding-capture]");
}

function readRoutePanelsOpen(router: AnyRouter) {
  const routeThreadRef = resolveThreadRouteRef(router.state.matches.at(-1)?.params ?? {});
  if (!routeThreadRef) return { terminalOpen: false, previewOpen: false };
  return {
    terminalOpen: selectThreadTerminalUiState(
      useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
      routeThreadRef,
    ).terminalOpen,
    previewOpen:
      selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, routeThreadRef) ===
      "preview",
  };
}

export function registerNavigationHistoryCommands(router: AnyRouter): () => void {
  return registerCommands(
    {
      "navigation.back": (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.history.back();
      },
      "navigation.forward": (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.history.forward();
      },
    },
    {
      when: (event) => !isKeybindingCaptureTarget(event),
      context: () => ({
        ...readRoutePanelsOpen(router),
        usagePageOpen: readUsagePageOpen(router),
      }),
    },
  );
}

// Escape leaves the pull requests page when no scope (a selection, a dialog,
// a drag) claimed it, so it observes after every other scope.
function registerPullRequestsEscapeCommand(router: AnyRouter): () => void {
  return registerCommands(
    {},
    {
      observe: (event, consumed) => {
        if (consumed || event.repeat || event.isComposing || event.key !== "Escape") return;
        if (router.state.location.pathname !== "/pull-requests") return;
        event.preventDefault();
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) activeElement.blur();
        if (router.state.location.state.__TSR_index !== 0) {
          window.history.back();
          return;
        }
        void router.navigate({ to: "/" });
      },
    },
  );
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

// A held key undoes once. Module state: undoing an archive navigates, and the
// hold must survive whatever that re-renders.
let heldUndoKey: string | null = null;

// Undoes the thread actions in the sidebar's notice. Settings and Usage own
// mod+z while open. Captured so mod+z reaches it before the composer's own
// undo handler consumes the key.
function registerThreadUndoCommands(
  router: AnyRouter,
  readSidebarVisible: () => boolean,
): () => void {
  const threadSidebarShown = () => !isAppModalPage(router.state.location.pathname);
  const unregister = registerCommands(
    {},
    {
      capture: true,
      when: threadSidebarShown,
      onKeyDown: (event) => {
        // Cancel a held key's repeats so they cannot fall through to the
        // editor's own undo, even after the last notice is gone.
        if (event.repeat) {
          if (event.code !== heldUndoKey) return false;
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
        // A modifier tapped mid-hold leaves the held key repeating.
        if (!MODIFIER_KEYS.has(event.key)) heldUndoKey = null;
        const command = resolveShortcutCommand(
          event,
          appAtomRegistry.get(primaryServerKeybindingsAtom),
          {
            context: {
              terminalFocus: isTerminalFocused(),
              previewFocus: isPreviewFocused(),
              ...readRoutePanelsOpen(router),
              // A collapsed sidebar hides the notice, so text fields keep their own undo.
              editableFocus:
                isEditableFocused(event.target) &&
                !(readSidebarVisible() && threadUndoClaimsShortcut()),
              modelPickerOpen: isModelPickerOpen(),
            },
          },
        );
        if (command !== "thread.undo") {
          if (!MODIFIER_KEYS.has(event.key)) releaseThreadUndoShortcut();
          return false;
        }
        if (isCommandPaletteOpen() || isModelPickerOpen()) return false;
        if (!undoLatestThreadAction()) return false;
        heldUndoKey = event.code;
        event.preventDefault();
        event.stopPropagation();
        return true;
      },
    },
  );
  // Pastes from a menu, dictation and drops edit text without a keypress.
  const onInput = () => {
    if (threadSidebarShown()) releaseThreadUndoShortcut();
  };
  window.addEventListener("input", onInput, true);
  return () => {
    unregister();
    window.removeEventListener("input", onInput, true);
  };
}

/** Keyboard and menu commands that live as long as the app shell. */
function registerAppShellCommands(router: AnyRouter, shellElement: Element): () => void {
  // The provider mirrors the visibility it renders onto its wrapper, so the
  // committed state is readable when a key arrives.
  const readSidebarVisible = () =>
    shellElement.closest('[data-slot="sidebar-wrapper"]')?.getAttribute("data-sidebar-state") ===
    "expanded";
  const disposers = [
    registerThreadUndoCommands(router, readSidebarVisible),
    registerNavigationHistoryCommands(router),
    registerPullRequestsEscapeCommand(router),
    registerMenuAction("open-settings", () => {
      if (!/^\/settings(\/|$)/.test(router.state.location.pathname))
        void router.navigate({ to: "/settings" });
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

function SidebarControl({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const usagePageOpen = useLocation({ select: (location) => location.pathname === "/usage" });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();
  const isSidebarVisible = useSidebarVisibility();
  const environmentIdentificationMode = getEnvironmentIdentificationMode();
  const stageBackdropVariant = useSidebarStageBackdropVariant(
    environmentIdentificationMode === "artwork",
  );
  const shortcutLabel = shortcutLabelForCommand(keybindings, "sidebar.toggle", {
    context: { usagePageOpen },
  });

  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }
      if (
        isRichTextBoldShortcut(event, window.getSelection()) &&
        event.target instanceof HTMLElement &&
        event.target.closest('[data-composer-rich-text="true"]')
      ) {
        // The rich-text composer claims Mod+B only to bold selected text;
        // the toggle stays available everywhere else.
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

    window.addEventListener("keydown", onKeyDown, true);
    const unsubscribe = window.desktopBridge?.onMenuAction((action) => {
      if (!disabled && action === "sidebar.toggle") toggleSidebar();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      unsubscribe?.();
    };
  }, [disabled, keybindings, toggleSidebar, usagePageOpen]);

  // The control lives as long as the shell, so it carries the shell's commands. Created
  // once so re-renders never re-register them.
  const [appShellCommandsRef] = useState(
    () => (node: HTMLDivElement | null) =>
      node === null ? undefined : registerAppShellCommands(router, node),
  );

  return (
    <div
      ref={appShellCommandsRef}
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
              disabled={disabled}
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

function ProjectProjectionRetention() {
  useProjects();
  return null;
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  useArchivedConversationTabs();
  const legacySidebarEnabled = useLegacySidebarEnabled();
  const [sidebarRouteReveal] = useState<SidebarRouteReveal>(() => ({
    observedKey: null,
    pendingKey: null,
  }));
  const { active: panelAnimationsActive, durationMs: panelAnimationDurationMs } =
    usePanelAnimationSettings();
  const pathname = useLocation({ select: (location) => location.pathname });
  const panelAnimationsSuppressed = usePanelNavigationSuppression(pathname);
  const routePanelAnimationsActive = panelAnimationsActive && !panelAnimationsSuppressed;
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--panel-animation-duration");
    root.style.setProperty(
      "--panel-animation-duration",
      routePanelAnimationsActive ? `${panelAnimationDurationMs}ms` : "0ms",
    );
    return () => {
      if (previous) root.style.setProperty("--panel-animation-duration", previous);
      else root.style.removeProperty("--panel-animation-duration");
    };
  }, [panelAnimationDurationMs, routePanelAnimationsActive]);
  const isOnSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const isOnScheduled = SINGLE_PROVIDER_UI && pathname === "/settings/scheduled-tasks";
  const isPullRequestsPage = SINGLE_PROVIDER_UI && pathname === "/pull-requests";
  const collectionKind =
    pathname === "/tasks"
      ? "tasks"
      : pathname === "/pages" || pathname.startsWith("/pages/")
        ? "pages"
        : null;
  const isProjectsPage = pathname === "/projects";
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
  const [sidebarWidths, setSidebarWidths] = useState<Record<string, number>>(() => ({
    [sidebarStorageKey]: readInitialThreadSidebarWidth(sidebarStorageKey),
  }));
  let sidebarWidth = sidebarWidths[sidebarStorageKey];
  if (sidebarWidth === undefined) {
    sidebarWidth = readInitialThreadSidebarWidth(sidebarStorageKey);
    setSidebarWidths({ ...sidebarWidths, [sidebarStorageKey]: sidebarWidth });
  }
  const setSidebarWidth = (width: number) =>
    setSidebarWidths((widths) =>
      widths[sidebarStorageKey] === width ? widths : { ...widths, [sidebarStorageKey]: width },
    );
  // Subscribed rather than read once: the clamp must track live window size,
  // and a clamped drag ends with an unchanged width, which skips the re-render
  // that would otherwise refresh a render-time snapshot.
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);

  const [brandWidth, setBrandWidth] = useState(0);
  const sidebarMinimumWidth = resolveThreadSidebarMinimumWidth(brandWidth);
  const sidebarMaximumWidth = resolveThreadSidebarMaximumWidth(viewportWidth, sidebarMinimumWidth);
  const resetSidebarWidth = () => {
    try {
      removeLocalStorageItem(sidebarStorageKey);
    } catch (error) {
      console.error("Could not clear persisted thread sidebar width.", error);
    }
    setSidebarWidth(resolveInitialThreadSidebarWidth(null, viewportWidth));
  };
  const isWindowFullscreen = useSyncExternalStore(
    subscribeToWindowFullscreen,
    readWindowFullscreen,
  );
  const windowControlsInsetStyle = (
    isMacosDesktop && !isWindowFullscreen
      ? { "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET }
      : {}
  ) as CSSProperties;
  const sidebarProviderStyle = {
    "--sidebar-width": `${clampThreadSidebarWidth(sidebarWidth, sidebarMinimumWidth, sidebarMaximumWidth)}px`,
    "--workspace-sidebar-width": "var(--sidebar-width)",
    "--workspace-mobile-header-inset": "calc(var(--workspace-controls-left) + 2.5rem)",
    "--app-navigation-rail-width": `${APP_NAVIGATION_RAIL_WIDTH}px`,
    "--panel-animation-duration": `${panelAnimationDurationMs}ms`,
    ...windowControlsInsetStyle,
  } as CSSProperties;

  const sectionDialogOpen = useAgentDialogStore((state) => state.sectionDialogOpen);
  return (
    <PanelAnimationSuppressionProvider value={panelAnimationsSuppressed}>
      <WorkspaceSidebarContentProvider>
        <SidebarProvider
          className={cn("h-dvh! min-h-0!", SINGLE_PROVIDER_UI && "md:flex-col")}
          data-panel-animations={routePanelAnimationsActive ? "true" : "false"}
          defaultOpen
          style={sidebarProviderStyle}
        >
          <SidebarHoverPreviewProvider sidebarAvailable>
            {!SINGLE_PROVIDER_UI ? <SidebarBrandWidthProbe onWidthChange={setBrandWidth} /> : null}
            <ProjectProjectionRetention />
            {SINGLE_PROVIDER_UI ? <AppTopbar sidebarControl={<SidebarControl />} /> : null}
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
              {
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
                    collectionKind === "pages"
                      ? "Pages"
                      : collectionKind === "tasks"
                        ? "Tasks"
                        : isProjectsPage
                          ? "Projects"
                          : isPullRequestsPage
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
                    minWidth: sidebarMinimumWidth,
                    shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
                      nextWidth <= currentWidth ||
                      wrapper.clientWidth - nextWidth - APP_NAVIGATION_RAIL_WIDTH >=
                        THREAD_MAIN_CONTENT_MIN_WIDTH,
                    storageKey: sidebarStorageKey,
                    onResize: setSidebarWidth,
                  }}
                >
                  {collectionKind ? (
                    <CollectionSidebar kind={collectionKind} />
                  ) : isProjectsPage ? (
                    <LegacyThreadSidebar projectsOnly routeReveal={sidebarRouteReveal} />
                  ) : isOnScheduled || isPullRequestsPage ? (
                    <WorkspaceSidebarContentHost />
                  ) : isOnSettings ? (
                    <>
                      <SettingsSidebarNav pathname={pathname} />
                    </>
                  ) : showAgentsSidebar ? (
                    <AgentsSidebar />
                  ) : legacySidebarEnabled ? (
                    <LegacyThreadSidebar routeReveal={sidebarRouteReveal} />
                  ) : (
                    <ThreadSidebar routeReveal={sidebarRouteReveal} />
                  )}
                  <SidebarRail onDoubleClick={resetSidebarWidth} />
                </Sidebar>
              }
              {children}
            </div>
            {!SINGLE_PROVIDER_UI ? <SidebarControl /> : null}
            {sectionDialogOpen ? (
              <AgentSectionDialog
                onClose={() => useAgentDialogStore.setState({ sectionDialogOpen: false })}
              />
            ) : null}
          </SidebarHoverPreviewProvider>
        </SidebarProvider>
      </WorkspaceSidebarContentProvider>
    </PanelAnimationSuppressionProvider>
  );
}
