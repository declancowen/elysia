// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { useTaskCardLayout } from "./useTaskCardLayout";

it("matches the tallest rendered title and footer, then shrinks after wrapping or content changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const disconnect = vi.fn();
  let resize = () => {};
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const heights = { short: 24, long: 48, oneRow: 46, twoRows: 76 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return { height: heights[this.id as keyof typeof heights] ?? 0 } as DOMRect;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness({ expanded = true, enabled = true }) {
    const ref = useTaskCardLayout(enabled);
    return (
      <div ref={ref}>
        <span id="short" data-task-card-title />
        <div id="oneRow" data-task-card-metadata />
        {expanded ? (
          <>
            <span id="long" data-task-card-title />
            <div id="twoRows" data-task-card-metadata />
          </>
        ) : null}
      </div>
    );
  }
  const height = (name: string) =>
    host.firstElementChild!.getAttribute("style")?.includes(`${name}:`);
  const style = () => (host.firstElementChild as HTMLElement).style;
  try {
    await act(async () => root.render(<Harness />));
    expect(style().getPropertyValue("--task-card-title-height")).toBe("48px");
    expect(style().getPropertyValue("--task-card-metadata-height")).toBe("76px");
    heights.long = 24;
    heights.twoRows = 46;
    resize();
    expect(style().getPropertyValue("--task-card-title-height")).toBe("24px");
    expect(style().getPropertyValue("--task-card-metadata-height")).toBe("46px");
    heights.twoRows = 100;
    await act(async () => root.render(<Harness expanded={false} />));
    expect(style().getPropertyValue("--task-card-metadata-height")).toBe("46px");
    await act(async () => root.render(<Harness enabled={false} />));
    expect(height("--task-card-title-height")).toBe(false);
    expect(height("--task-card-metadata-height")).toBe(false);
    expect(disconnect).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
