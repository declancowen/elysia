import { SINGLE_PROVIDER_UI } from "@elysiatools/contracts";
import type { ComponentProps } from "react";
import type { ResizableWidthHandlers } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";

interface Props extends Pick<
  ComponentProps<"div">,
  "tabIndex" | "onKeyDown" | "aria-valuenow" | "aria-valuemin" | "aria-valuemax"
> {
  handlers: ResizableWidthHandlers;
  className?: string;
  label?: string;
}

export function RightPanelResizeHandle({ handlers, className, label, ...separatorProps }: Props) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      {...separatorProps}
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
