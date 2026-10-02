import { SINGLE_PROVIDER_UI } from "@t3tools/contracts";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { isElectron } from "~/env";
import {
  getPreviewPanelMaxWidth,
  type PreviewPanelInlineSize,
  usePreviewPanelInlineSize,
} from "~/hooks/usePreviewPanelInlineSize";

export { getPreviewPanelMaxWidth };
import { cn } from "~/lib/utils";

import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

export type PreviewPanelMode = "inline" | "sheet" | "sidebar" | "embedded";

/**
 * Shell for the preview panel. In inline mode the panel is user-resizable
 * via a drag handle on the left edge; width persists per browser. In
 * sheet/sidebar modes the parent owns the size.
 */
interface PreviewPanelShellProps {
  mode: PreviewPanelMode;
  maximized?: boolean;
  inlineSize?: PreviewPanelInlineSize;
  open?: boolean;
  /**
   * Overrides the localStorage key used to persist the panel width. Callers
   * embedding this shell for a different surface (e.g. the pull requests
   * page) should pass their own key so resizing one panel doesn't clobber
   * the other's remembered width.
   */
  widthStorageKey?: string;
  /** Overrides the initial width (px) before the user has resized the panel. */
  defaultWidth?: number;
  children: ReactNode;
}

export function PreviewPanelShell(props: PreviewPanelShellProps) {
  if (props.inlineSize) {
    return <PreviewPanelShellFrame {...props} inlineSize={props.inlineSize} />;
  }

  return <ResizablePreviewPanelShell {...props} />;
}

function ResizablePreviewPanelShell(props: PreviewPanelShellProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const inlineSize = usePreviewPanelInlineSize(hostRef, {
    enabled: props.mode === "inline" && !props.maximized,
    widthStorageKey: props.widthStorageKey,
    defaultWidth: props.defaultWidth,
  });
  return <PreviewPanelShellFrame {...props} inlineSize={inlineSize} hostRef={hostRef} />;
}

function PreviewPanelShellFrame(
  props: PreviewPanelShellProps & {
    inlineSize: PreviewPanelInlineSize;
    hostRef?: RefObject<HTMLDivElement | null>;
  },
) {
  const useDragRegion = isElectron && props.mode !== "sheet" && props.mode !== "embedded";
  const isInline = props.mode === "inline";
  const collapsible = isInline && props.open !== undefined;
  const open = props.open ?? true;
  const maximized = props.maximized ?? false;
  const localHostRef = useRef<HTMLDivElement | null>(null);
  const hostRef = props.hostRef ?? localHostRef;
  const { width, handlers } = props.inlineSize;
  // Derive suppression before the layout commits so the browser never creates
  // a width transition for resize or maximize changes.
  const [layoutTransition, setLayoutTransition] = useState(() => ({
    open,
    width,
    maximized,
    suppressed: false,
  }));
  if (
    layoutTransition.open !== open ||
    layoutTransition.width !== width ||
    layoutTransition.maximized !== maximized
  ) {
    setLayoutTransition({
      open,
      width,
      maximized,
      suppressed:
        collapsible &&
        layoutTransition.open === open &&
        (layoutTransition.width !== width || layoutTransition.maximized !== maximized),
    });
  }
  const suppressWidthTransition = layoutTransition.suppressed;
  useLayoutEffect(() => {
    if (!suppressWidthTransition) return;
    let restoreFrame = 0;
    const paintFrame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => {
        setLayoutTransition((current) => ({ ...current, suppressed: false }));
      });
    });
    return () => {
      window.cancelAnimationFrame(paintFrame);
      window.cancelAnimationFrame(restoreFrame);
    };
  }, [suppressWidthTransition]);
  return (
    <div
      ref={hostRef}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 max-w-full flex-col self-stretch bg-background",
        isInline ? (maximized ? "flex-1" : "shrink-0") : "w-full",
        isInline &&
          (SINGLE_PROVIDER_UI
            ? cn("rounded-xl", open && !maximized && "ml-2")
            : "border-l border-border"),
        collapsible &&
          "[[data-panel-animations=true]_&]:transition-[width,margin-left] [[data-panel-animations=true]_&]:duration-(--panel-animation-duration) [[data-panel-animations=true]_&]:ease-out",
        collapsible && open && "[[data-panel-animations=true]_&]:starting:w-0!",
        collapsible && !open && "pointer-events-none",
      )}
      style={
        isInline
          ? {
              width: maximized ? "100%" : collapsible && !open ? "0px" : `${width}px`,
              transitionDuration: suppressWidthTransition ? "0ms" : undefined,
            }
          : undefined
      }
      data-preview-panel-mode={props.mode}
      data-preview-panel-maximized={maximized ? "true" : "false"}
    >
      {isInline && !maximized ? <RightPanelResizeHandle handlers={handlers} /> : null}
      <div
        className={cn(
          "h-full min-h-0 w-full",
          collapsible && "overflow-clip",
          SINGLE_PROVIDER_UI && isInline && "overflow-clip rounded-xl",
        )}
      >
        <div
          className="flex h-full min-h-0 min-w-0 flex-col"
          style={
            collapsible && !maximized
              ? { width: SINGLE_PROVIDER_UI ? `${width}px` : `calc(${width}px - 1px)` }
              : undefined
          }
        >
          {props.children}
        </div>
      </div>
    </div>
  );
}

/**
 * Track viewport and flex-row widths to derive an upper bound for the panel.
 * Resize-aware so dragging the OS window narrower (or expanding the app
 * sidebar) re-clamps the stored width on the next render (the hook's clamp
 * picks this up automatically). The row is observed rather than the panel
 * itself because the panel competes with its sibling column for row space.
 * Row measurement only runs when `enabled`; modes without a resize handle
 * never apply the resulting width, so they skip the observer entirely.
 */
function useClampedMaxWidth(hostRef: RefObject<HTMLDivElement | null>, enabled: boolean): number {
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const onResize = () => {
      // Coalesce rapid resize events into one rAF tick.
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setVw(window.innerWidth);
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);
  useLayoutEffect(() => {
    if (!enabled) return;
    const parent = hostRef.current?.parentElement;
    if (!parent) return;
    // Measure before first paint: the persisted width must be clamped
    // against the row on the initial render, not one observer tick later
    // (the panel would flash over-wide on every mount). clientWidth is
    // integral, so sub-pixel resize deltas bail out of re-rendering.
    const measure = () => {
      setContainerWidth(parent.clientWidth - (SINGLE_PROVIDER_UI ? 8 : 0));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => {
      observer.disconnect();
    };
  }, [hostRef, enabled]);
  return getPreviewPanelMaxWidth(vw, containerWidth);
}
