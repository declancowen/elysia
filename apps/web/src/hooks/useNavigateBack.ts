import { useCanGoBack, useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";

export function useEscapeToGoBack(onEscape?: () => void) {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const handleEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.key !== "Escape")
      return;
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (onEscape) onEscape();
    else if (canGoBack) window.history.back();
    else void navigate({ to: "/" });
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleEscape(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
