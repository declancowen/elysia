import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Context,
} from "react";
import { useLocation } from "@tanstack/react-router";
import { useResizableWidth } from "~/hooks/useResizableWidth";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { usePanelAnimationSettings, usePanelPresence } from "~/panelAnimations";
import { cn } from "~/lib/utils";
import { Sidebar, useSidebar } from "../ui/sidebar";

export type SidebarHoverSection =
  | "workspace"
  | "agents"
  | "tasks"
  | "pages"
  | "projects"
  | "pull-requests"
  | "scheduled"
  | "settings";
const floatingPopupSelector =
  '[data-slot="menu-popup"], [data-slot="popover-popup"], [data-slot="combobox-popup"], [role="dialog"], [role="alertdialog"]';
const loadSidebarHoverContents = () => import("./SidebarHoverContents");
const SidebarHoverContents = lazy(loadSidebarHoverContents);
const hoverHotData = import.meta.hot?.data;
type HoverContextValue = {
  section: SidebarHoverSection | null;
  enter: (section: SidebarHoverSection) => void;
  leave: () => void;
  close: () => void;
};
const HoverContext: Context<HoverContextValue | null> =
  hoverHotData?.hoverContext ?? createContext<HoverContextValue | null>(null);
if (hoverHotData) hoverHotData.hoverContext = HoverContext;

export function useSidebarHoverPreview() {
  return useContext(HoverContext);
}

/** A temporary navigation surface never changes the pinned sidebar or its saved width. */
export function SidebarHoverPreviewProvider({
  children,
  sidebarAvailable,
}: {
  children: ReactNode;
  sidebarAvailable: boolean;
}) {
  const { open: pinnedOpen } = useSidebar();
  const { width, handlers, setWidth } = useResizableWidth({
    storageKey: "elysia.sidebar.hoverWidth",
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 640,
    edge: "right",
  });
  const sidebarOpen = pinnedOpen && sidebarAvailable;
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const locationKey = useLocation({ select: (location) => location.href });
  const [preview, setPreview] = useState<{
    scopeKey: string;
    section: SidebarHoverSection | null;
  }>({ scopeKey: locationKey, section: null });
  const section =
    preview.scopeKey === locationKey && finePointer && !sidebarOpen ? preview.section : null;
  if (preview.scopeKey !== locationKey || (preview.section !== null && section === null)) {
    setPreview({ scopeKey: locationKey, section: null });
  }
  const setSection = useCallback(
    (next: SidebarHoverSection | null) => {
      setPreview({ scopeKey: locationKey, section: next });
    },
    [locationKey],
  );
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const clearTimers = useCallback(() => {
    if (enterTimer.current !== null) clearTimeout(enterTimer.current);
    if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
    enterTimer.current = null;
    leaveTimer.current = null;
  }, []);
  const close = useCallback(() => {
    clearTimers();
    setSection(null);
  }, [clearTimers, setSection]);
  const enter = useCallback(
    (next: SidebarHoverSection) => {
      clearTimers();
      if (!finePointer || sidebarOpen) {
        setSection(null);
        return;
      }
      void loadSidebarHoverContents().catch(() => undefined);
      enterTimer.current = setTimeout(() => {
        enterTimer.current = null;
        setSection(next);
      }, 180);
    },
    [clearTimers, finePointer, setSection, sidebarOpen],
  );
  const leave = useCallback(() => {
    clearTimers();
    if (
      panelRef.current?.contains(document.activeElement) ||
      document.activeElement?.closest(floatingPopupSelector)
    )
      return;
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      if (document.activeElement?.closest(floatingPopupSelector)) return;
      setSection(null);
    }, 150);
  }, [clearTimers, setSection]);
  useEffect(() => {
    if (preview.scopeKey !== locationKey || !finePointer || sidebarOpen) clearTimers();
    return clearTimers;
  }, [clearTimers, preview.scopeKey, locationKey, finePointer, sidebarOpen]);
  useEffect(() => {
    if (!section) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !(event.target instanceof Element && event.target.closest(floatingPopupSelector))
      )
        close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || panelRef.current?.contains(target)) return;
      if (target.closest(floatingPopupSelector)) return;
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [section, close]);
  const value = useMemo(() => ({ section, enter, leave, close }), [section, enter, leave, close]);
  const { active: animationsActive, durationMs } = usePanelAnimationSettings();
  const presence = usePanelPresence(
    section !== null,
    section,
    animationsActive && !sidebarOpen,
    locationKey,
    durationMs,
  );

  return (
    <HoverContext value={value}>
      {children}
      {presence.present && presence.value ? (
        <section
          ref={panelRef}
          role="navigation"
          aria-label={`${presence.value} sidebar preview`}
          inert={section === null}
          onPointerEnter={clearTimers}
          onPointerLeave={leave}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) leave();
          }}
          className={cn(
            "floating-panel-glass fixed top-[calc(var(--workspace-topbar-height)+1rem)] left-[calc(var(--app-navigation-rail-width)+0.5rem)] z-40 hidden h-[calc(100dvh-var(--workspace-topbar-height)-2rem)] max-w-[calc(100vw-var(--app-navigation-rail-width)-1rem)] overflow-hidden rounded-xl workspace-panel-outline md:flex",
            animationsActive &&
              "transition-[opacity,translate] ease-out starting:-translate-x-2 starting:opacity-0",
            section === null && "pointer-events-none -translate-x-2 opacity-0",
          )}
          style={{ width, transitionDuration: animationsActive ? `${durationMs}ms` : "0ms" }}
        >
          <Sidebar collapsible="none" className="w-full">
            <Suspense
              fallback={
                <p role="status" className="p-4 text-sm">
                  Loading…
                </p>
              }
            >
              <SidebarHoverContents section={presence.value} />
            </Suspense>
          </Sidebar>
          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize floating sidebar"
            aria-orientation="vertical"
            aria-valuemin={240}
            aria-valuemax={640}
            aria-valuenow={width}
            className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none focus-visible:bg-border"
            {...handlers}
            onPointerDown={(event) => {
              event.currentTarget.focus();
              clearTimers();
              handlers.onPointerDown(event);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              setWidth(width + (event.key === "ArrowRight" ? 16 : -16));
            }}
          />
        </section>
      ) : null}
    </HoverContext>
  );
}
