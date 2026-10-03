import { useCallback, useEffect, useRef, useState } from "react";

function tabScrollViewport(root: HTMLDivElement | null) {
  return root?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]') ?? null;
}

/** Shared tab-strip scrolling for conversations and side-panel surfaces. */
export function useTabOverflow(activeId: string | null) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const [tabScrollState, setTabScrollState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });
  const updateTabScrollState = useCallback(() => {
    const viewport = tabScrollViewport(tabListRef.current);
    if (!viewport) return;
    const hasOverflow = viewport.scrollWidth - viewport.clientWidth > 1;
    const canScrollLeft = hasOverflow && viewport.scrollLeft > 1;
    const canScrollRight =
      hasOverflow && viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
    setTabScrollState((current) =>
      current.hasOverflow === hasOverflow &&
      current.canScrollLeft === canScrollLeft &&
      current.canScrollRight === canScrollRight
        ? current
        : { hasOverflow, canScrollLeft, canScrollRight },
    );
  }, []);
  const scrollTabs = useCallback((direction: -1 | 1) => {
    const viewport = tabScrollViewport(tabListRef.current);
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * Math.max(120, viewport.clientWidth * 0.75),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, []);
  useEffect(() => {
    if (!activeId || !tabScrollState.hasOverflow) return;
    const viewport = tabScrollViewport(tabListRef.current);
    const active = tabListRef.current?.querySelector<HTMLElement>("[data-active-tab='true']");
    if (!viewport || !active) return;
    const bounds = viewport.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    if (tab.left < bounds.left) viewport.scrollLeft += tab.left - bounds.left;
    else if (tab.right > bounds.right) viewport.scrollLeft += tab.right - bounds.right;
  }, [activeId, tabScrollState.hasOverflow]);
  useEffect(() => {
    const viewport = tabScrollViewport(tabListRef.current);
    if (!viewport) return;
    const observer = new ResizeObserver(updateTabScrollState);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    viewport.addEventListener("scroll", updateTabScrollState, { passive: true });
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      let delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= viewport.clientWidth;
      const previous = viewport.scrollLeft;
      viewport.scrollLeft += delta;
      if (viewport.scrollLeft !== previous) event.preventDefault();
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    updateTabScrollState();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", updateTabScrollState);
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, [updateTabScrollState]);
  return { tabListRef, tabScrollState, scrollTabs };
}
