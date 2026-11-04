import { useLayoutEffect, useState } from "react";

/** Details temporarily replace the overview without losing its open view. */
export function useChatHeaderPanels(
  projectKey: string | undefined,
  wide: boolean,
  onDockedChange: ((docked: boolean) => void) | undefined,
) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [overviewDocked, setOverviewDocked] = useState(false);
  const [scope, setScope] = useState({ projectKey, wide });
  if (scope.projectKey !== projectKey || scope.wide !== wide) {
    setScope({ projectKey, wide });
    setDetailsOpen(false);
  }
  const overviewChanged = (open: boolean) => {
    if (open) setDetailsOpen(false);
  };
  // oxlint-disable-next-line elysia/no-unreasoned-state-sync -- Notify the pane owner of reserved header space before the portaled layout paints.
  useLayoutEffect(() => {
    onDockedChange?.(overviewDocked || (detailsOpen && wide));
  }, [onDockedChange, overviewDocked, detailsOpen, wide]);
  // oxlint-disable-next-line elysia/no-unreasoned-state-sync -- Release the parent pane reservation when this header owner unmounts.
  useLayoutEffect(() => () => onDockedChange?.(false), [onDockedChange]);
  return {
    detailsOpen,
    detailsChanged: setDetailsOpen,
    overviewChanged,
    setOverviewDocked,
    overviewHidden: detailsOpen,
  };
}
