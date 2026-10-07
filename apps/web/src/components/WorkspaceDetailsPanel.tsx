import { useLocation } from "@tanstack/react-router";
import { usePanelAnimationSettings, usePanelPresence } from "../panelAnimations";
import { cn } from "../lib/utils";
import type { ReactNode, RefObject } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { Popover, PopoverPopup } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";

/** Workspace details share the thread card's docked and overflow presentations. */
export function WorkspaceDetailsPanel({
  label,
  open,
  onOpenChange,
  anchor,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<Element | null>;
  children: ReactNode;
}) {
  const docked = useMediaQuery("(min-width: 1100px)");
  const locationKey = useLocation({ select: (location) => location.href });
  const { active: animated, durationMs } = usePanelAnimationSettings();
  const presence = usePanelPresence(open, true, animated, locationKey, durationMs);
  const content = (
    <ScrollArea scrollFade className="max-h-[calc(100dvh-10rem)] min-h-0">
      <div className="p-5">{children}</div>
    </ScrollArea>
  );
  if (docked)
    return presence.present ? (
      <aside
        aria-label={label}
        inert={!open}
        className={cn(
          "dropdown-glass isolate w-80 shrink-0 overflow-hidden rounded-3xl workspace-panel-outline",
          animated &&
            "transition-[opacity,translate] ease-out starting:translate-x-2 starting:opacity-0",
          !open && "pointer-events-none translate-x-2 opacity-0",
        )}
        style={{ transitionDuration: animated ? `${durationMs}ms` : "0ms" }}
      >
        {content}
      </aside>
    ) : null;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverPopup
        anchor={anchor}
        align="end"
        side="bottom"
        collisionAvoidance={{ side: "none", align: "shift" }}
        variant="floating"
        width="md"
        padding="none"
      >
        <section aria-label={label}>{content}</section>
      </PopoverPopup>
    </Popover>
  );
}
