import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { observeResize } from "~/lib/observeResize";

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
  // oxlint-disable-next-line elysia/react-effect-budget -- Measure the portaled header against DOM columns and own its resize subscriptions.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!inlinePanel || !header) {
      setMainColumnWidth(null);
      setMainColumnHidden(false);
      return;
    }
    const subscriptions = new Map<Element, () => void>();
    const measure = () => {
      // The topbar portal can mount before the conversation attaches its ref.
      // Read it again on the observer's initial delivery, after the commit.
      const column = threadBoundaryRef?.current;
      if (!column) return;
      observe(column);
      const workspace = column.closest("[data-chat-workspace-panels]");
      if (workspace) observe(workspace);
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
    const observe = (element: Element) => {
      if (!subscriptions.has(element)) {
        subscriptions.set(element, observeResize(element, measure));
      }
    };
    observe(header);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      for (const stopObserving of subscriptions.values()) stopObserving();
      window.removeEventListener("resize", measure);
    };
  }, [inlinePanel, threadBoundaryRef]);
  return { headerRef, mainColumnWidth, mainColumnHidden };
}
