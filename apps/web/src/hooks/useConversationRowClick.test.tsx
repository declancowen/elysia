// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useConversationRowClick } from "./useConversationRowClick";

vi.mock("@t3tools/contracts", async (original) => ({
  ...(await original<typeof import("@t3tools/contracts")>()),
  SINGLE_PROVIDER_UI: true,
}));
const single = vi.fn();
const double = vi.fn();
let host: HTMLDivElement;
let root: Root;
function Row() {
  return <button {...useConversationRowClick(single, double)}>Conversation</button>;
}
beforeEach(async () => {
  vi.useFakeTimers();
  single.mockClear();
  double.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Row />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
async function dispatch(type: string, detail: number, modifiers: MouseEventInit = {}) {
  await act(async () =>
    host
      .querySelector("button")!
      .dispatchEvent(new MouseEvent(type, { bubbles: true, detail, ...modifiers })),
  );
}
it("opens one extra tab on double-click without replacing the current tab first", async () => {
  await dispatch("click", 1);
  await dispatch("click", 2);
  await dispatch("dblclick", 2);
  await act(async () => vi.runAllTimers());
  expect(single).not.toHaveBeenCalled();
  expect(double).toHaveBeenCalledTimes(1);
});
it("replaces the current tab once on a single pointer click", async () => {
  await dispatch("click", 1);
  await act(async () => vi.advanceTimersByTime(300));
  expect(single).toHaveBeenCalledTimes(1);
  expect(double).not.toHaveBeenCalled();
});
it("preserves immediate keyboard and modifier activation", async () => {
  await dispatch("click", 0);
  await dispatch("click", 1, { ctrlKey: true });
  expect(single).toHaveBeenCalledTimes(2);
  expect(double).not.toHaveBeenCalled();
});
it("cancels pending navigation when the row unmounts", async () => {
  await dispatch("click", 1);
  await act(async () => root.render(null));
  await act(async () => vi.runAllTimers());
  expect(single).not.toHaveBeenCalled();
});
