// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { PagesPageItemRow } from "./PagesPageItemRow";

vi.mock("@t3tools/contracts", async (original) => ({
  ...(await original<typeof import("@t3tools/contracts")>()),
  SINGLE_PROVIDER_UI: true,
}));
const open = vi.fn();
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.useFakeTimers();
  open.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <PagesPageItemRow onOpen={open}>
        <span data-padding>Card padding</span>
        <button>Select folder</button>
      </PagesPageItemRow>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
async function click(selector: string, type = "click", detail = 1) {
  await act(async () =>
    host.querySelector(selector)!.dispatchEvent(new MouseEvent(type, { bubbles: true, detail })),
  );
}
it("opens the folder from the card surface on a single click", async () => {
  await click("[data-padding]");
  await act(async () => vi.runAllTimers());
  expect(open).toHaveBeenCalledExactlyOnceWith(false);
});
it("opens a new tab on double click without replacing the current surface", async () => {
  await click("[data-padding]");
  await click("[data-padding]", "click", 2);
  await click("[data-padding]", "dblclick", 2);
  await act(async () => vi.runAllTimers());
  expect(open).toHaveBeenCalledExactlyOnceWith(true);
});
it("does not open a folder when selecting it or using a nested control", async () => {
  await click("button");
  await click("button", "dblclick", 2);
  await act(async () => vi.runAllTimers());
  expect(open).not.toHaveBeenCalled();
});
