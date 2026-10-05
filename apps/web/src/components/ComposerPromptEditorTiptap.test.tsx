// @vitest-environment jsdom
import { act, createRef, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";

it("preserves the controlled draft when a floating composer suspends and remounts", async () => {
  vi.useFakeTimers();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const editorRef = createRef<ComposerPromptEditorHandle>();
  let suspended = false;
  const waiting = new Promise<void>(() => {});
  function Gate() {
    if (suspended) throw waiting;
    return null;
  }
  const render = (value: string) =>
    root.render(
      <Suspense fallback={<p>Loading</p>}>
        <ComposerPromptEditorTiptap
          value={value}
          cursor={value.length}
          contextRecords={new Map()}
          skills={[]}
          disabled={false}
          placeholder="Message"
          ariaLabel="Message"
          onChange={() => {}}
          onPaste={() => {}}
          editorRef={editorRef}
        />
        <Gate />
      </Suspense>,
    );
  try {
    await act(async () => {
      render("Task context");
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(container.querySelector('[role="textbox"]')?.textContent).toBe("Task context");
    suspended = true;
    await act(async () => {
      render("Task context");
    });
    expect(container.textContent).toContain("Loading");
    suspended = false;
    await act(async () => {
      render("Updated task context");
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(container.querySelector('[role="textbox"]')?.textContent).toBe("Updated task context");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  }
});
