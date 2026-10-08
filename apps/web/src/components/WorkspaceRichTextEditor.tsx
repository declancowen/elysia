import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import {
  CodeBlockIcon,
  HeadingIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  TextIcon,
  MinusSignIcon,
  Table2,
  PlusIcon,
  Trash2Icon,
} from "../icons";
import {
  pageSlashMatch,
  movePageCommandSelection,
  runPageBlockCommand,
} from "./WorkspaceEditorCommands";
import { Button } from "./ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "./ui/menu";

const blockIcons = {
  paragraph: TextIcon,
  heading1: HeadingIcon,
  heading2: HeadingIcon,
  heading3: HeadingIcon,
  bullet: ListIcon,
  ordered: ListOrderedIcon,
  task: ListChecksIcon,
  quote: QuoteIcon,
  code: CodeBlockIcon,
  divider: MinusSignIcon,
  table: Table2,
};
type SlashState = NonNullable<ReturnType<typeof pageSlashMatch>> & { left: number; top: number };

export type WorkspaceRichTextEditorHandle = { focus: () => void };

/** A personal document canvas; the HTML emitted here is also the agent-editing format. */
export function WorkspaceRichTextEditor({
  ref,
  value,
  onChange,
  disabled = false,
  label = "Page",
}: {
  readonly ref?: Ref<WorkspaceRichTextEditorHandle>;
  readonly value: string;
  readonly onChange: (content: string) => void;
  readonly disabled?: boolean;
  readonly label?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const slashRef = useRef<SlashState | null>(null);
  const selectionRef = useRef(0);
  const selectedOption = useRef<HTMLButtonElement>(null);
  const dismissed = useRef<string | null>(null);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [selected, setSelected] = useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { renderWrapper: true } }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": `${label} content`,
        "aria-multiline": "true",
        class:
          "min-h-72 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
      },
      handleKeyDown: (_view, event) => {
        const menu = slashRef.current;
        if (!menu) return false;
        if (event.key === "Escape") {
          event.preventDefault();
          dismissed.current = `${menu.from}:${menu.query}`;
          slashRef.current = null;
          setSlash(null);
          return true;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          selectionRef.current = movePageCommandSelection(
            selectionRef.current,
            event.key === "ArrowDown" ? 1 : -1,
            menu.commands.length,
          );
          setSelected(selectionRef.current);
          return true;
        }
        if (event.key === "Enter" && menu.commands.length && editor) {
          event.preventDefault();
          const command = menu.commands[selectionRef.current] ?? menu.commands[0];
          if (command) runPageBlockCommand(editor, command, menu);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: updated }) => onChange(updated.getHTML()),
    onTransaction: ({ editor: updated }) => {
      const match = pageSlashMatch(updated.state);
      if (!match || dismissed.current === `${match.from}:${match.query}`) {
        slashRef.current = null;
        setSlash(null);
        if (!match) dismissed.current = null;
        return;
      }
      const rect = container.current?.getBoundingClientRect();
      const coords = updated.view.coordsAtPos(match.to);
      const next = {
        ...match,
        left: Math.max(0, Math.min(coords.left - (rect?.left ?? 0), (rect?.width ?? 300) - 280)),
        top:
          (window.innerHeight - coords.bottom < Math.min(288, match.commands.length * 36 + 8)
            ? coords.top - Math.min(288, match.commands.length * 36 + 8) - 6
            : coords.bottom + 6) - (rect?.top ?? 0),
      };
      if (slashRef.current?.query !== match.query || slashRef.current?.from !== match.from) {
        selectionRef.current = 0;
        setSelected(0);
      }
      slashRef.current = next;
      setSlash(next);
    },
  });
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (!disabled) editor?.commands.focus("start");
      },
    }),
    [editor, disabled],
  );
  useEffect(() => {
    if (editor && editor.getHTML() !== value)
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  useLayoutEffect(() => {
    if (selected < 0 || !slash?.commands.length) return;
    selectedOption.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected, slash]);
  if (!editor)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading editor…
      </p>
    );
  return (
    <div>
      <div className="mb-3">
        <Menu>
          <MenuTrigger render={<Button variant="outline" size="compact" disabled={disabled} />}>
            <Table2 />
            Table
          </MenuTrigger>
          <MenuPopup align="start" finalFocus={false}>
            <MenuItem
              onClick={() =>
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }
              disabled={editor.isActive("table")}
            >
              <Table2 />
              Insert table
            </MenuItem>
            {editor.isActive("table") ? (
              <>
                <MenuSeparator />
                <MenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
                  <PlusIcon />
                  Add row
                </MenuItem>
                <MenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
                  <PlusIcon />
                  Add column
                </MenuItem>
                <MenuItem onClick={() => editor.chain().focus().deleteRow().run()}>
                  <MinusSignIcon />
                  Delete row
                </MenuItem>
                <MenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>
                  <MinusSignIcon />
                  Delete column
                </MenuItem>
                <MenuSeparator />
                <MenuItem onClick={() => editor.chain().focus().deleteTable().run()}>
                  <Trash2Icon />
                  Delete table
                </MenuItem>
              </>
            ) : null}
          </MenuPopup>
        </Menu>
      </div>
      <div
        ref={container}
        className="relative text-base leading-7 text-foreground [&_.tiptap_p]:my-3 [&_.tiptap_h1]:my-6 [&_.tiptap_h1]:text-3xl [&_.tiptap_h2]:my-5 [&_.tiptap_h2]:text-2xl [&_.tiptap_h3]:my-4 [&_.tiptap_h3]:text-xl [&_.tiptap_h4]:my-4 [&_.tiptap_h4]:font-semibold [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_blockquote]:border-l-2 [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-4 [&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:rounded-xl [&_.tiptap_pre]:bg-secondary [&_.tiptap_pre]:text-secondary-foreground [&_.tiptap_pre]:p-4 [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline [&_.tiptap_ul[data-type=taskList]]:list-none [&_.tiptap_ul[data-type=taskList]]:pl-0 [&_.tiptap_li[data-checked]]:flex [&_.tiptap_li[data-checked]]:items-start [&_.tiptap_li[data-checked]]:gap-3 [&_.tiptap_li[data-checked]>label]:mt-1.5 [&_.tiptap_li[data-checked]>label]:flex [&_.tiptap_li[data-checked]>label]:shrink-0 [&_.tiptap_li[data-checked]>label]:items-center [&_.tiptap_li[data-checked]>div]:min-w-0 [&_.tiptap_li[data-checked]>div]:flex-1 [&_.tiptap_li[data-checked]>div>p]:my-0 [&_.tiptap_input[type=checkbox]]:m-0 [&_.tiptap_input[type=checkbox]]:accent-primary [&_.tableWrapper]:overflow-x-auto [&_.tiptap_table]:my-3 [&_.tiptap_table]:w-full [&_.tiptap_table]:table-fixed [&_.tiptap_table]:border-collapse [&_.tiptap_td]:relative [&_.tiptap_td]:border [&_.tiptap_td]:border-border [&_.tiptap_td]:p-2 [&_.tiptap_td]:align-top [&_.tiptap_th]:relative [&_.tiptap_th]:border [&_.tiptap_th]:border-border [&_.tiptap_th]:bg-muted [&_.tiptap_th]:p-2 [&_.tiptap_th]:text-left [&_.tiptap_th]:align-top [&_.tiptap_th]:font-medium [&_.tiptap_td_p]:my-0 [&_.tiptap_th_p]:my-0 [&_.tiptap_.selectedCell]:bg-accent"
      >
        <EditorContent editor={editor} />
        {slash && !disabled ? (
          <div
            role="listbox"
            aria-label="Insert block"
            className="dropdown-glass absolute z-20 max-h-72 w-70 overflow-y-auto rounded-xl border border-border p-1 shadow-lg [&::-webkit-scrollbar]:w-0.5"
            style={{ left: slash.left, top: slash.top }}
          >
            {slash.commands.length ? (
              slash.commands.map((command, index) => {
                const Icon = blockIcons[command.id];
                return (
                  <button
                    key={command.id}
                    ref={index === selected ? selectedOption : undefined}
                    type="button"
                    role="option"
                    aria-selected={index === selected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runPageBlockCommand(editor, command, slash)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground outline-none hover:bg-secondary ${index === selected ? "bg-secondary" : ""}`}
                  >
                    <Icon className="size-4" />
                    {command.label}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">No matching blocks</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
