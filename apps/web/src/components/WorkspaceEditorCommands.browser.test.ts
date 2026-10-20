import { afterEach, describe, expect, it } from "vite-plus/test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import {
  PAGE_BLOCK_COMMANDS,
  pageSlashMatch,
  runPageBlockCommand,
  movePageCommandSelection,
} from "./WorkspaceEditorCommands";
const editors: Editor[] = [];
function create(content: string) {
  const editor = new Editor({
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), TableKit],
    content,
  });
  editors.push(editor);
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  return editor;
}
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
describe("document block commands", () => {
  it("filters slash inserts and replaces the typed trigger with a real checklist", () => {
    const editor = create("<p>/todo</p>");
    const match = pageSlashMatch(editor.state);
    expect(match?.commands.map((command) => command.id)).toEqual(["task"]);
    const command = match?.commands[0];
    if (!match || !command) throw new Error("Expected checklist command");
    expect(runPageBlockCommand(editor, command, match)).toBe(true);
    expect(editor.isActive("taskList")).toBe(true);
    expect(editor.getText()).not.toContain("/todo");
    // Exercise the live NodeView, which uses data-checked instead of data-type.
    expect(
      editor.view.dom.querySelector("li[data-checked] > label input[type=checkbox]"),
    ).not.toBeNull();
  });
  it.each([
    "heading1",
    "heading2",
    "heading3",
    "bullet",
    "ordered",
    "quote",
    "code",
    "divider",
  ] as const)("inserts %s into the saved document", (id) => {
    const editor = create("<p>/</p>");
    const range = pageSlashMatch(editor.state);
    const command = PAGE_BLOCK_COMMANDS.find((item) => item.id === id);
    if (!range || !command) throw new Error("Expected command");
    expect(runPageBlockCommand(editor, command, range)).toBe(true);
    expect(editor.getText()).not.toContain("/");
    const nodeNames = editor.getJSON().content?.map((node) => node.type);
    const expected = id.startsWith("heading")
      ? "heading"
      : {
          bullet: "bulletList",
          ordered: "orderedList",
          quote: "blockquote",
          code: "codeBlock",
          divider: "horizontalRule",
        }[id as "bullet" | "ordered" | "quote" | "code" | "divider"];
    expect(nodeNames).toContain(expected);
  });
  it("inserts, edits and reloads a table without retaining the slash trigger", () => {
    const editor = create("<p>/table</p>");
    const match = pageSlashMatch(editor.state);
    expect(match?.commands.map((command) => command.id)).toEqual(["table"]);
    if (!match || !match.commands[0]) throw new Error("Expected table command");
    expect(runPageBlockCommand(editor, match.commands[0], match)).toBe(true);
    editor.commands.insertContent("First cell");
    expect(editor.commands.addRowAfter()).toBe(true);
    expect(editor.commands.addColumnAfter()).toBe(true);
    const html = editor.getHTML();
    const reloaded = create(html);
    expect(reloaded.view.dom.querySelectorAll("tr")).toHaveLength(4);
    expect(reloaded.view.dom.querySelectorAll("tr:first-child th")).toHaveLength(4);
    expect(reloaded.getText()).toContain("First cell");
    expect(reloaded.getText()).not.toContain("/table");
    reloaded.commands.setTextSelection(4);
    expect(reloaded.commands.deleteTable()).toBe(true);
    expect(reloaded.getHTML()).not.toContain("<table");
  });
  it("offers table actions only inside a table and does not insert nested tables", () => {
    expect(pageSlashMatch(create("<p>/add row</p>").state)?.commands).toEqual([]);
    const editor = create("<p>/table</p>");
    const insert = pageSlashMatch(editor.state);
    if (!insert?.commands[0]) throw new Error("Expected table command");
    runPageBlockCommand(editor, insert.commands[0], insert);
    editor.commands.insertContent("/table");
    expect(pageSlashMatch(editor.state)?.commands.map((command) => command.id)).toEqual([
      "tableAddRow",
      "tableAddColumn",
      "tableDeleteRow",
      "tableDeleteColumn",
      "tableDelete",
    ]);
  });
  it("edits table rows and columns through slash commands and preserves saved content", () => {
    const editor = create("<p>/table</p>");
    const insert = pageSlashMatch(editor.state);
    if (!insert?.commands[0]) throw new Error("Expected table command");
    runPageBlockCommand(editor, insert.commands[0], insert);
    editor.commands.insertContent("Keep this cell");
    const runTableSlash = (active: Editor, query: string) => {
      let cellPosition: number | undefined;
      active.state.doc.descendants((node, position, parent) => {
        if (
          node.isTextblock &&
          node.content.size === 0 &&
          (parent?.type.name === "tableCell" || parent?.type.name === "tableHeader")
        )
          cellPosition = position + 1;
      });
      if (cellPosition === undefined) throw new Error("Expected an empty table cell");
      active.commands.setTextSelection(cellPosition);
      active.commands.insertContent(`/${query}`);
      const match = pageSlashMatch(active.state);
      if (!match?.commands[0]) throw new Error(`Expected ${query} command`);
      expect(runPageBlockCommand(active, match.commands[0], match)).toBe(true);
      expect(active.getText()).not.toContain(`/${query}`);
    };
    runTableSlash(editor, "add row");
    runTableSlash(editor, "add column");
    expect(editor.view.dom.querySelectorAll("tr")).toHaveLength(4);
    expect(editor.view.dom.querySelectorAll("tr:first-child th")).toHaveLength(4);
    runTableSlash(editor, "delete row");
    runTableSlash(editor, "delete column");
    const reloaded = create(editor.getHTML());
    expect(reloaded.view.dom.querySelectorAll("tr")).toHaveLength(3);
    expect(reloaded.view.dom.querySelectorAll("tr:first-child th")).toHaveLength(3);
    expect(reloaded.getText()).toContain("Keep this cell");
    runTableSlash(reloaded, "delete table");
    expect(reloaded.getHTML()).not.toContain("<table");
  });
  it("does not treat prose, code blocks, or selected text as slash menus", () => {
    expect(pageSlashMatch(create("<p>Visit /heading</p>").state)).toBeNull();
    expect(pageSlashMatch(create("<pre><code>/heading</code></pre>").state)).toBeNull();
    const editor = create("<p>/heading</p>");
    editor.commands.setTextSelection({ from: 1, to: 4 });
    expect(pageSlashMatch(editor.state)).toBeNull();
  });
  it("wraps keyboard selection in both directions and handles an empty filter", () => {
    expect(movePageCommandSelection(0, -1, 10)).toBe(9);
    expect(movePageCommandSelection(9, 1, 10)).toBe(0);
    expect(movePageCommandSelection(0, 1, 0)).toBe(0);
  });
});
