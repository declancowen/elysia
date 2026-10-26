vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi, type Screen } from "../../test/render";
import { act } from "../../test/act";
// @vitest-environment jsdom

import { expect, it, vi } from "vite-plus/test";
import { useConversationRowClick } from "./useConversationRowClick";

vi.mock("@elysiatools/contracts", async (original) => ({
  ...(await original<typeof import("@elysiatools/contracts")>()),
  SINGLE_PROVIDER_UI: true,
}));
const single = vi.fn();
const double = vi.fn();
let host: HTMLDivElement;
let root: Screen;
function Row() {
  return <button {...useConversationRowClick(single, double)}>Conversation</button>;
}
async function setup() {
  const resources = new AsyncDisposableStack();
  resources.defer(async () => {
    vi.useRealTimers();
  });

  vi.useFakeTimers();
  single.mockClear();
  double.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = resources.use(await renderUi(null, { container: host, router: false }));
  await act(async () => root.rerender(<Row />));

  return resources;
}

async function dispatch(type: string, detail: number, modifiers: MouseEventInit = {}) {
  await act(async () =>
    host
      .querySelector("button")!
      .dispatchEvent(new MouseEvent(type, { bubbles: true, detail, ...modifiers })),
  );
}
it("opens one extra tab on double-click without replacing the current tab first", async () => {
  await using _fixture = await setup();
  await dispatch("click", 1);
  await dispatch("click", 2);
  await dispatch("dblclick", 2);
  await act(async () => vi.runAllTimers());
  expect(single).not.toHaveBeenCalled();
  expect(double).toHaveBeenCalledTimes(1);
});
it("replaces the current tab once on a single pointer click", async () => {
  await using _fixture = await setup();
  await dispatch("click", 1);
  await act(async () => vi.advanceTimersByTime(300));
  expect(single).toHaveBeenCalledTimes(1);
  expect(double).not.toHaveBeenCalled();
});
it("preserves immediate keyboard and modifier activation", async () => {
  await using _fixture = await setup();
  await dispatch("click", 0);
  await dispatch("click", 1, { ctrlKey: true });
  expect(single).toHaveBeenCalledTimes(2);
  expect(double).not.toHaveBeenCalled();
});
it("cancels pending navigation when the row unmounts", async () => {
  await using _fixture = await setup();
  await dispatch("click", 1);
  await act(async () => root.rerender(null));
  await act(async () => vi.runAllTimers());
  expect(single).not.toHaveBeenCalled();
});
