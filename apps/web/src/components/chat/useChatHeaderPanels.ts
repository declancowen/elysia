import { useCallback, useEffect, useLayoutEffect, useState } from "react";

/** Details temporarily replace the overview without losing its open view. */
export function useChatHeaderPanels(
  projectKey: string | undefined,
  wide: boolean,
  onDockedChange: ((docked: boolean) => void) | undefined,
) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [overviewDocked, setOverviewDocked] = useState(false);
  const detailsChanged = useCallback((open: boolean) => {
    setDetailsOpen(open);
  }, []);
  const overviewChanged = useCallback((open: boolean) => {
    if (open) setDetailsOpen(false);
  }, []);
  useLayoutEffect(() => {
    onDockedChange?.(overviewDocked || (detailsOpen && wide));
  }, [onDockedChange, overviewDocked, detailsOpen, wide]);
  useLayoutEffect(() => () => onDockedChange?.(false), [onDockedChange]);
  useEffect(() => setDetailsOpen(false), [projectKey, wide]);
  return {
    detailsOpen,
    detailsChanged,
    overviewChanged,
    setOverviewDocked,
    overviewHidden: detailsOpen,
  };
}
