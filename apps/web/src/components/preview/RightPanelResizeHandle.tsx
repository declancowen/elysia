import { SINGLE_PROVIDER_UI } from "@t3tools/contracts";
import type { ResizableWidthHandlers } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";

interface Props {
  handlers: ResizableWidthHandlers;
  className?: string;
}

/**
 * Hit target for resizing a right-anchored panel via its left edge.
 *
 * Elysia uses the gap between rounded panels as the target, with only a resize
 * cursor. The upstream layout keeps its border indicator and overlapping target.
 */
export function RightPanelResizeHandle({ handlers, className }: Props) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn(
        "group absolute inset-y-0 z-20 w-2 cursor-col-resize select-none",
        SINGLE_PROVIDER_UI ? "-left-2" : "-left-1",
        className,
      )}
      {...handlers}
    >
      {!SINGLE_PROVIDER_UI ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-border group-active:bg-primary/60"
        />
      ) : null}
    </div>
  );
}
