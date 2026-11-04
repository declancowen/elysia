import { isMacPlatform } from "../lib/utils";
vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi } from "../../test/render";
import { act } from "../../test/act";
// @vitest-environment jsdom
import { createRef, Suspense } from "react";

import { expect, it, vi } from "vite-plus/test";
import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";

it("preserves the controlled draft when a floating composer suspends and remounts", async () => {
  vi.useFakeTimers();
  const container = document.createElement("div");
  document.body.append(container);
  await using root = await renderUi(null, { container: container, router: false });
  const editorRef = createRef<ComposerPromptEditorHandle>();
  let suspended = false;
  const waiting = new Promise<void>(() => {});
  function Gate() {
    if (suspended) throw waiting;
    return null;
  }
  const render = (value: string) =>
    root.rerender(
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

it("formats a selected word once and leaves an empty bold shortcut unarmed", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  await using root = await renderUi(null, { container, router: false });
  const onChange = vi.fn();
  try {
    await root.rerender(
      <ComposerPromptEditorTiptap
        value="ship it"
        cursor={7}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        richTextEnabled
        editorRef={createRef<ComposerPromptEditorHandle>()}
        placeholder="Message"
        ariaLabel="Message"
        onChange={onChange}
        onPaste={() => {}}
      />,
    );
    const element = container.querySelector<
      HTMLElement & { editor: import("@tiptap/core").Editor }
    >(".tiptap")!;
    const editor = element.editor;
    const pressBold = () =>
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "b",
          code: "KeyB",
          ctrlKey: !isMacPlatform(navigator.platform),
          metaKey: isMacPlatform(navigator.platform),
          bubbles: true,
          cancelable: true,
        }),
      );
    await act(async () => {
      editor.commands.setTextSelection(8);
      pressBold();
    });
    expect(editor.state.storedMarks?.some((mark) => mark.type.name === "bold") ?? false).toBe(
      false,
    );
    await act(async () => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
      pressBold();
    });
    const boldText: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === "bold"))
        boldText.push(node.textContent);
    });
    expect(boldText).toEqual(["ship"]);
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("**ship** it");
  } finally {
    await root.unmount();
    container.remove();
  }
});
