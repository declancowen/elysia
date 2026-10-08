import { SINGLE_PROVIDER_UI } from "@elysiatools/contracts";
import { useEffect, useRef, type MouseEvent } from "react";

/** A double-click opens a new tab without first replacing the tab already on screen. */
export function useConversationRowClick(
  onSingle: (event: MouseEvent) => void,
  onDouble: (event: MouseEvent) => void,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return {
    onClick: (event: MouseEvent) => {
      cancel();
      if (
        !SINGLE_PROVIDER_UI ||
        event.detail === 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        onSingle(event);
        return;
      }
      if (event.detail > 1) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        onSingle(event);
      }, 300);
    },
    onDoubleClick: (event: MouseEvent) => {
      cancel();
      if (SINGLE_PROVIDER_UI && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))
        return;
      onDouble(event);
    },
  };
}
