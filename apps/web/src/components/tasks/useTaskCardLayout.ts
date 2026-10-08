import { useLayoutEffect, useRef } from "react";

/** Match the rendered title and metadata heights without reserving unused property rows. */
export function useTaskCardLayout(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const collection = ref.current;
    if (!enabled || !collection) return;

    const titles = [...collection.querySelectorAll<HTMLElement>("[data-task-card-title]")];
    const metadata = [...collection.querySelectorAll<HTMLElement>("[data-task-card-metadata]")];
    const measure = () => {
      for (const [name, elements] of [
        ["--task-card-title-height", titles],
        ["--task-card-metadata-height", metadata],
      ] as const) {
        const height = elements.reduce(
          (maximum, element) => Math.max(maximum, element.getBoundingClientRect().height),
          0,
        );
        collection.style.setProperty(name, `${Math.ceil(height)}px`);
      }
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    for (const element of [...titles, ...metadata]) observer?.observe(element);
    return () => {
      observer?.disconnect();
      collection.style.removeProperty("--task-card-title-height");
      collection.style.removeProperty("--task-card-metadata-height");
    };
  });

  return ref;
}
