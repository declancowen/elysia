import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export const PAGE_BLOCK_COMMANDS = [
  { id: "paragraph", label: "Paragraph", keywords: "text normal" },
  { id: "heading1", label: "Heading 1", keywords: "title h1" },
  { id: "heading2", label: "Heading 2", keywords: "subtitle h2" },
  { id: "heading3", label: "Heading 3", keywords: "subtitle h3" },
  { id: "bullet", label: "Bullet list", keywords: "unordered" },
  { id: "ordered", label: "Numbered list", keywords: "ordered" },
  { id: "task", label: "Checklist", keywords: "task todo checkbox" },
  { id: "quote", label: "Quote", keywords: "blockquote" },
  { id: "code", label: "Code block", keywords: "source" },
  { id: "divider", label: "Divider", keywords: "horizontal rule separator" },
  { id: "table", label: "Table", keywords: "rows columns grid" },
] as const;
export type PageBlockCommand = (typeof PAGE_BLOCK_COMMANDS)[number];

/** Like Linear, slash insert applies only at the beginning of a text block. */
export function pageSlashMatch(state: EditorState) {
  const { $from, empty, from } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.name === "codeBlock") return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
  const match = /^\/([\w -]*)$/.exec(before);
  if (!match) return null;
  const query = (match[1] ?? "").trim().toLowerCase();
  return {
    from: from - before.length,
    to: from,
    query,
    commands: PAGE_BLOCK_COMMANDS.filter((command) =>
      `${command.label} ${command.keywords}`.toLowerCase().includes(query),
    ),
  };
}
export function movePageCommandSelection(index: number, direction: number, count: number) {
  return count ? (index + direction + count) % count : 0;
}
export function runPageBlockCommand(
  editor: Editor,
  command: PageBlockCommand,
  range?: { from: number; to: number },
) {
  const chain = editor.chain().focus();
  if (range) chain.deleteRange(range);
  switch (command.id) {
    case "paragraph":
      return chain.setParagraph().run();
    case "heading1":
      return chain.setHeading({ level: 1 }).run();
    case "heading2":
      return chain.setHeading({ level: 2 }).run();
    case "heading3":
      return chain.setHeading({ level: 3 }).run();
    case "bullet":
      return chain.toggleBulletList().run();
    case "ordered":
      return chain.toggleOrderedList().run();
    case "task":
      return chain.toggleTaskList().run();
    case "quote":
      return chain.toggleBlockquote().run();
    case "code":
      return chain.toggleCodeBlock().run();
    case "divider":
      return chain.setHorizontalRule().run();
    case "table":
      return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }
}
