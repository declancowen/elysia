// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { DynamicIcon } from "./projectIcons";
import { iconExists, getCacheSize } from "@hugeicons/core-free-icons/loader";
import { hugeiconAssets } from "./hugeiconNames";

it("renders native and saved icon names with stroke 2 and handles an unavailable icon", async () => {
  expect(Object.values(hugeiconAssets).filter((asset) => !iconExists(asset))).toEqual([]);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = async (name: string) => {
    await act(async () => {
      root.render(<DynamicIcon name={name} />);
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
