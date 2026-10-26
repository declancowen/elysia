vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi, type Screen } from "../../../test/render";
import { act } from "../../../test/act";
// @vitest-environment jsdom

import { expect, it, vi } from "vite-plus/test";
import { PagesPageItemRow } from "./PagesPageItemRow";

vi.mock("@elysiatools/contracts", async (original) => ({
  ...(await original<typeof import("@elysiatools/contracts")>()),
  SINGLE_PROVIDER_UI: true,
}));
const open = vi.fn();
let host: HTMLDivElement;
let root: Screen;
async function setup() {
  const resources = new AsyncDisposableStack();
  resources.defer(async () => {
    vi.useRealTimers();
  });

  vi.useFakeTimers();
  open.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = resources.use(await renderUi(null, { container: host, router: false }));
  await act(async () =>
    root.rerender(
      <PagesPageItemRow onOpen={open}>
        <span data-padding>Card padding</span>
        <button>Select folder</button>
      </PagesPageItemRow>,
    ),
  );

  return resources;
}

async function click(selector: string, type = "click", detail = 1) {
  await act(async () =>
    host.querySelector(selector)!.dispatchEvent(new MouseEvent(type, { bubbles: true, detail })),
  );
}
it("opens the folder from the card surface on a single click", async () => {
  await using _fixture = await setup();
  await click("[data-padding]");
  await act(async () => vi.runAllTimers());
  expect(open).toHaveBeenCalledExactlyOnceWith(false);
});
it("opens a new tab on double click without replacing the current surface", async () => {
  await using _fixture = await setup();
  await click("[data-padding]");
  await click("[data-padding]", "click", 2);
  await click("[data-padding]", "dblclick", 2);
  await act(async () => vi.runAllTimers());
  expect(open).toHaveBeenCalledExactlyOnceWith(true);
});
it("does not open a folder when selecting it or using a nested control", async () => {
  await using _fixture = await setup();
  await click("button");
  await click("button", "dblclick", 2);
  await act(async () => vi.runAllTimers());
  expect(open).not.toHaveBeenCalled();
});
