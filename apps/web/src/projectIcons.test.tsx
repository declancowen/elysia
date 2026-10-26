vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi } from "../test/render";
import { act } from "../test/act";
// @vitest-environment jsdom

import { expect, it, vi } from "vite-plus/test";
import { PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { DynamicIcon } from "./projectIcons";
import { iconExists, getCacheSize } from "@hugeicons/core-free-icons/loader";
import { hugeiconAssets } from "./hugeiconNames";

it("renders native and saved icon names with stroke 2 and handles an unavailable icon", async () => {
  expect(Object.values(hugeiconAssets).filter((asset) => !iconExists(asset))).toEqual([]);

  const host = document.createElement("div");
  await using root = await renderUi(null, { container: host, router: false });
  const render = async (name: string) => {
    await act(async () => {
      root.rerender(<DynamicIcon name={name} />);
      await vi.dynamicImportSettled();
    });
  };
  try {
    await render("pin");
    expect(host.querySelector("path")?.getAttribute("d")).toBe(PinIcon[0]![1].d);
    expect(host.querySelector("path")?.getAttribute("stroke-width")).toBe("2");
    const cached = getCacheSize();
    await render("pin");
    expect(getCacheSize()).toBe(cached);
    await render("pin-off");
    expect(host.querySelector("path")?.getAttribute("d")).toBe(PinOffIcon[0]![1].d);
    await render("code-2");
    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.querySelector("path")?.getAttribute("stroke-width")).toBe("2");
    await render("x-circle");
    expect(host.querySelector("path")?.getAttribute("stroke-width")).toBe("2");
    await render("unavailable-icon");
    expect(host.querySelector("svg")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
