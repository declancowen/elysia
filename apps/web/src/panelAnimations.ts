import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type PanelAnimationDurationMs } from "@elysiatools/contracts/settings";

import { useMediaQuery } from "./hooks/useMediaQuery";
import { useClientSettings } from "./hooks/useSettings";

const PanelAnimationSuppressionContext = createContext(false);

export const PanelAnimationSuppressionProvider = PanelAnimationSuppressionContext.Provider;

export function usePanelNavigationSuppression(navigationKey: string): boolean {
  const [paintedNavigationKey, setPaintedNavigationKey] = useState<string | null>(null);
  const suppressed = paintedNavigationKey !== navigationKey;

  // oxlint-disable-next-line t3code/react-effect-budget -- Wait two browser frames so the new route paints before panel animations are re-enabled; cancel the frames on change or unmount.
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

  // oxlint-disable-next-line t3code/react-effect-budget -- Keep the closing panel mounted for its CSS exit transition, then unmount it; the timer is cleared on reopen or unmount.
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
