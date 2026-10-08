// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import {
  WorkspaceRichTextEditor,
  type WorkspaceRichTextEditorHandle,
} from "./WorkspaceRichTextEditor";

it("focuses the document body on request and leaves disabled pages unfocused", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  // JSDOM omits the Range layout methods used to scroll a focused editor into view.
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [new DOMRect(0, 0, 1, 1)],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(0, 0, 1, 1),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const ref = createRef<WorkspaceRichTextEditorHandle>();
  const title = document.createElement("input");
  document.body.append(title);
  const flushFocus = async () =>
    act(async () => {
      ref.current?.focus();
      for (const frame of frames.splice(0)) frame(0);
    });
  try {
    await act(async () =>
      root.render(<WorkspaceRichTextEditor ref={ref} value="<p>Body</p>" onChange={() => {}} />),
    );
    title.focus();
    await flushFocus();
    expect(document.activeElement).toBe(host.querySelector('[role="textbox"]'));
    await act(async () =>
      root.render(
        <WorkspaceRichTextEditor ref={ref} value="<p>Body</p>" onChange={() => {}} disabled />,
      ),
    );
    title.focus();
    await flushFocus();
    expect(document.activeElement).toBe(title);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    title.remove();
    Reflect.deleteProperty(Range.prototype, "getClientRects");
    Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
