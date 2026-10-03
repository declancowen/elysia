import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export function resolveChatHeaderMainColumnWidth(
  header: Pick<DOMRect, "left" | "width">,
  column: Pick<DOMRect, "right">,
): number {
  return Math.max(0, Math.min(header.width, column.right - header.left));
}

export function useChatHeaderColumn(
  inlinePanel: boolean,
  threadBoundaryRef: RefObject<HTMLElement | null> | undefined,
) {
  const headerRef = useRef<HTMLDivElement>(null);
  const [mainColumnWidth, setMainColumnWidth] = useState<number | null>(null);
  const [mainColumnHidden, setMainColumnHidden] = useState(false);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!inlinePanel || !header) {
      setMainColumnWidth(null);
      setMainColumnHidden(false);
      return;
    }
    const measure = () => {
      // The topbar portal can mount before the conversation attaches its ref.
      // Read it again on the observer's initial delivery, after the commit.
      const column = threadBoundaryRef?.current;
      if (!column) return;
      observer.observe(column);
      const workspace = column.closest("[data-chat-workspace-panels]");
      if (workspace) observer.observe(workspace);
      const hidden = column.getAttribute("data-chat-column-maximized-away") === "true";
      setMainColumnHidden(hidden);
      setMainColumnWidth(
        hidden
          ? null
          : resolveChatHeaderMainColumnWidth(
              header.getBoundingClientRect(),
              column.getBoundingClientRect(),
            ),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [inlinePanel, threadBoundaryRef]);
  return { headerRef, mainColumnWidth, mainColumnHidden };
}
