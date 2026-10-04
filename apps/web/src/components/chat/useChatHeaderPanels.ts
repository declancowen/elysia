import { useCallback, useEffect, useLayoutEffect, useState } from "react";

/** Details and overview share the same column; overflow shows one at a time. */
export function useChatHeaderPanels(
  projectKey: string | undefined,
  wide: boolean,
  onDockedChange: ((docked: boolean) => void) | undefined,
) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsHeight, setDetailsHeight] = useState(0);
  const [overviewDocked, setOverviewDocked] = useState(false);
  const [dismissOverview, setDismissOverview] = useState(0);
  const detailsChanged = useCallback(
    (open: boolean) => {
      setDetailsOpen(open);
      if (open && !wide) setDismissOverview((value) => value + 1);
    },
    [wide],
  );
  const overviewChanged = useCallback(
    (open: boolean) => {
      if (open && !wide) setDetailsOpen(false);
    },
    [wide],
  );
  useLayoutEffect(() => {
    onDockedChange?.(overviewDocked || (detailsOpen && wide));
  }, [onDockedChange, overviewDocked, detailsOpen, wide]);
  useLayoutEffect(() => () => onDockedChange?.(false), [onDockedChange]);
  useEffect(() => setDetailsOpen(false), [projectKey, wide]);
  return {
    detailsOpen,
    detailsChanged,
    overviewChanged,
    setDetailsHeight,
    setOverviewDocked,
    dismissOverview,
    panelOffset: wide && detailsOpen ? detailsHeight + 12 : 0,
  };
}
