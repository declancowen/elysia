import { useLayoutEffect, useState } from "react";
import { observeResize } from "~/lib/observeResize";

export function useElementWidth<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    return observeResize(element, ([entry]) => {
      if (entry)
        setWidth((current) =>
          current === entry.contentRect.width ? current : entry.contentRect.width,
        );
    });
  }, [element]);
  return [setElement, width] as const;
}
