import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { observeResize } from "~/lib/observeResize";
import { type PanelAnimationDurationMs } from "@elysiatools/contracts/settings";

import { useMediaQuery } from "./hooks/useMediaQuery";
import { useClientSettings } from "./hooks/useSettings";

const PanelAnimationSuppressionContext = createContext(false);

export const PanelAnimationSuppressionProvider = PanelAnimationSuppressionContext.Provider;

export function usePanelNavigationSuppression(navigationKey: string): boolean {
  const [paintedNavigationKey, setPaintedNavigationKey] = useState<string | null>(null);
  const suppressed = paintedNavigationKey !== navigationKey;

  useEffect(() => {
    if (!suppressed) return;
    let releaseFrame = 0;
    const paintFrame = window.requestAnimationFrame(() => {
      releaseFrame = window.requestAnimationFrame(() => setPaintedNavigationKey(navigationKey));
    });
    return () => {
      window.cancelAnimationFrame(paintFrame);
      window.cancelAnimationFrame(releaseFrame);
    };
  }, [navigationKey, suppressed]);

  return suppressed;
}

export function usePanelAnimationSettings(): {
  active: boolean;
  durationMs: PanelAnimationDurationMs;
} {
  const durationMs = useClientSettings((settings) => settings.panelAnimationDurationMs);
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const suppressed = useContext(PanelAnimationSuppressionContext);
  return { active: durationMs > 0 && !prefersReducedMotion && !suppressed, durationMs };
}

export function usePanelPresence<T>(
  open: boolean,
  value: T | null,
  animated: boolean,
  scopeKey: string | null,
  durationMs: PanelAnimationDurationMs,
): { present: boolean; value: T | null } {
  type Snapshot = { scopeKey: string | null; value: T | null };
  const lastOpen = useRef<Snapshot | null>(open ? { scopeKey, value } : null);
  const [retained, setRetained] = useState<Snapshot | null>(open ? { scopeKey, value } : null);
  if (open && (retained === null || retained.scopeKey !== scopeKey)) {
    setRetained({ scopeKey, value });
  } else if (!open && retained !== null && (!animated || retained.scopeKey !== scopeKey)) {
    setRetained(null);
  }

  // Open panels render the current input directly. Capture committed content
  // without setting state on every new object supplied by a caller.
  useLayoutEffect(() => {
    if (open) {
      lastOpen.current = { scopeKey, value };
      return;
    }
    const closing = animated && lastOpen.current?.scopeKey === scopeKey ? lastOpen.current : null;
    if (closing === null) lastOpen.current = null;
    if (retained !== closing) {
      // Transfer committed content before the closing animation paints.
      setRetained(closing);
    }
  }, [animated, open, retained, scopeKey, value]);

  useEffect(() => {
    if (open || !animated) return;
    const timeout = window.setTimeout(() => {
      if (lastOpen.current?.scopeKey === scopeKey) lastOpen.current = null;
      setRetained((current) => (current?.scopeKey === scopeKey ? null : current));
    }, durationMs);
    return () => window.clearTimeout(timeout);
  }, [animated, durationMs, open, scopeKey]);

  const visible = open || (animated && retained !== null && retained.scopeKey === scopeKey);
  return { present: visible, value: open ? value : visible ? (retained?.value ?? null) : null };
}

export function observeResponsiveBreakpointFade(options: {
  target: HTMLElement;
  container: HTMLElement;
  active: boolean;
  durationMs: PanelAnimationDurationMs;
  breakpoint: { value: number; unit: "px" | "rem" };
}): () => void {
  const { target, container, active, durationMs, breakpoint } = options;
  if (!active || typeof ResizeObserver === "undefined") return () => {};

  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const breakpointPx =
    breakpoint.unit === "px"
      ? breakpoint.value
      : breakpoint.value * (Number.isFinite(rootFontSize) ? rootFontSize : 16);
  let expanded = container.getBoundingClientRect().width >= breakpointPx;
  let animation: Animation | null = null;

  const stopObserving = observeResize(container, ([entry]) => {
    if (!entry) return;
    const nextExpanded = entry.contentRect.width >= breakpointPx;
    if (nextExpanded === expanded) return;
    expanded = nextExpanded;
    animation?.cancel();
    animation = target.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: Math.min(100, durationMs),
      easing: "ease-out",
    });
  });

  return () => {
    stopObserving();
    animation?.cancel();
  };
}
