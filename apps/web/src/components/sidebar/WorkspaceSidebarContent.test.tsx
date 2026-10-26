vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi } from "../../../test/render";
import { act } from "../../../test/act";
// @vitest-environment jsdom
import { useState } from "react";

import { expect, it, vi } from "vite-plus/test";
import {
  WorkspaceSidebarContentProvider,
  WorkspaceSidebarContentHost,
  WorkspaceSidebarContent,
} from "./WorkspaceSidebarContent";

it("moves the existing sidebar controls into the hover host and back without losing route state", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  await using root = await renderUi(null, { container: host, router: false });
  function Harness({ floating }: { floating: boolean }) {
    const [query, setQuery] = useState("");
    return (
      <WorkspaceSidebarContentProvider>
        <div data-pinned>
          <WorkspaceSidebarContentHost />
        </div>
        {floating ? (
          <div data-floating>
            <WorkspaceSidebarContentHost floating />
          </div>
        ) : null}
        <WorkspaceSidebarContent>
          <button onClick={() => setQuery("preview")}>{query || "Search"}</button>
        </WorkspaceSidebarContent>
      </WorkspaceSidebarContentProvider>
    );
  }
  try {
    await act(() => root.rerender(<Harness floating={false} />));
    await act(() => host.querySelector<HTMLButtonElement>("[data-pinned] button")!.click());
    await act(() => root.rerender(<Harness floating />));
    expect(host.querySelector("[data-pinned] button")).toBeNull();
    expect(host.querySelector("[data-floating] button")?.textContent).toBe("preview");
    await act(() => root.rerender(<Harness floating={false} />));
    expect(host.querySelector("[data-pinned] button")?.textContent).toBe("preview");
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
