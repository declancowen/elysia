import type { CodeViewScrollTarget } from "@pierre/diffs";
import type { FileTree as FileTreeModel } from "@pierre/trees";
import type { ComponentProps } from "react";
import { act, render } from "../../../test/render";
import { describe, expect, it, vi } from "vite-plus/test";

import type { FileDiffMetadata } from "@pierre/diffs";

import { DiffFileTree, type DiffFileTreeEntry } from "./DiffFileTree";
import { diffFileTreeEntries } from "./diffFileTree.logic";
import { useCodeViewFileReveal } from "./useCodeViewFileReveal";

const captured = vi.hoisted(() => ({ model: null as unknown }));
// Read the tree model the component builds, so tests can assert its selection and expansion.
vi.mock(import("@pierre/trees/react"), async (original) => {
  const actual = await original();
  const RealFileTree = actual.FileTree;
  return {
    ...actual,
    FileTree: ((props: ComponentProps<typeof RealFileTree>) => {
      captured.model = props.model;
      return <RealFileTree {...props} />;
    }) as typeof RealFileTree,
  };
});

const entries: DiffFileTreeEntry[] = [
  { path: "01-tall.ts", status: "modified" },
  { path: "02-short.ts", status: "modified" },
  { path: "03-medium.ts", status: "modified" },
];

describe("diff tree file activation", () => {
  async function fixture() {
    const container = document.createElement("div");
    container.style.cssText = "display: flex; flex-direction: column; width: 320px; height: 480px";
    const screen = await render(null, { container });
    const targets: CodeViewScrollTarget[] = [];
    const viewer = {
      getInstance: () => viewer,
      scrollTo: (target: CodeViewScrollTarget) => targets.push(target),
    };

    function Panel({
      files = entries,
      selectedPath = null,
      revealRequestId = 0,
    }: {
      files?: DiffFileTreeEntry[];
      selectedPath?: string | null;
      revealRequestId?: number;
    }) {
      const reveal = useCodeViewFileReveal(viewer, "working-tree");
      return (
        <DiffFileTree
          entries={files}
          ariaLabel="Working tree files"
          selectedPath={selectedPath}
          revealRequestId={revealRequestId}
          onSelectFile={(path) => reveal(`${path}\0${path}`)}
        />
      );
    }

    const model = (): FileTreeModel => captured.model as FileTreeModel;

    async function mount(props: Parameters<typeof Panel>[0] = {}) {
      await screen.rerender(<Panel {...props} />);
    }

    function row(path: string): HTMLElement {
      const host = container.querySelector("file-tree-container");
      const element = (host?.shadowRoot ?? container).querySelector<HTMLElement>(
        `[data-item-path="${CSS.escape(path)}"]`,
      );
      expect(element, `row ${path}`).not.toBeNull();
      return element!;
    }

    function fileRows(): HTMLElement[] {
      const host = container.querySelector("file-tree-container");
      return [
        ...(host?.shadowRoot ?? container).querySelectorAll<HTMLElement>(
          '[role="treeitem"][data-item-type="file"]',
        ),
      ];
    }

    async function activate(target: string | HTMLElement, modifiers: MouseEventInit = {}) {
      await act(async () => {
        (typeof target === "string" ? row(target) : target).dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            composed: true,
            button: 0,
            detail: 1,
            ...modifiers,
          }),
        );
      });
    }

    return {
      targets,
      mount,
      row,
      fileRows,
      activate,
      model,
      async [Symbol.asyncDispose]() {
        await screen[Symbol.asyncDispose]();
        vi.restoreAllMocks();
      },
    };
  }

  it("mounts a file-to-symlink type change as one tree row", async () => {
    await using screen = await fixture();
    const typeChange = diffFileTreeEntries([
      { type: "deleted", name: "AGENTS.md", prevName: "AGENTS.md" } as FileDiffMetadata,
      { type: "new", name: "AGENTS.md", prevName: "AGENTS.md" } as FileDiffMetadata,
      { type: "change", name: "CLAUDE.md", prevName: "CLAUDE.md" } as FileDiffMetadata,
    ]);
    await screen.mount({ files: [...typeChange] });

    const tree = screen.model();
    expect(tree.getItem("AGENTS.md")?.isDirectory()).toBe(false);
    expect(tree.getItem("CLAUDE.md")?.isDirectory()).toBe(false);
    await screen.activate("AGENTS.md");
    expect(screen.targets).toEqual([
      { type: "item", id: "AGENTS.md\u0000AGENTS.md", align: "start" },
    ]);
  });

  it("reissues the reveal when the sole selected file is activated again", async () => {
    await using screen = await fixture();
    await screen.mount();
    await screen.activate("02-short.ts");
    expect(screen.model().getSelectedPaths()).toEqual(["02-short.ts"]);
    await screen.activate("02-short.ts");
    expect(screen.targets).toEqual([
      { type: "item", id: "02-short.ts\u000002-short.ts", align: "start" },
      { type: "item", id: "02-short.ts\u000002-short.ts", align: "start" },
    ]);
  });

  it("reveals newly selected files once in either direction", async () => {
    await using screen = await fixture();
    await screen.mount();
    await screen.activate("02-short.ts");
    await screen.activate("01-tall.ts");
    await screen.activate("03-medium.ts");
    expect(screen.targets.map((target) => ("id" in target ? target.id : null))).toEqual(
      ["02-short.ts", "01-tall.ts", "03-medium.ts"].map((path) => `${path}\0${path}`),
    );
  });

  it("keeps focus-only navigation separate from button activation", async () => {
    await using screen = await fixture();
    await screen.mount();
    await screen.activate("02-short.ts");
    await act(async () => screen.model().getItem("01-tall.ts")!.focus());
    expect(screen.model().getSelectedPaths()).toEqual(["02-short.ts"]);
    expect(screen.targets).toHaveLength(1);
    await screen.activate("01-tall.ts", { detail: 0 });
    await screen.activate("01-tall.ts", { detail: 0 });
    expect(screen.targets).toHaveLength(3);
  });

  it.each(["ctrlKey", "metaKey"] as const)(
    "does not reveal a selected file that a %s click deselects",
    async (modifier) => {
      await using screen = await fixture();
      await screen.mount();
      await screen.activate("02-short.ts");
      await screen.activate("02-short.ts", { [modifier]: true });
      expect(screen.model().getSelectedPaths()).toEqual([]);
      expect(screen.targets).toHaveLength(1);
    },
  );

  it("lets a click narrow multiple selected files without a second reveal", async () => {
    await using screen = await fixture();
    await screen.mount();
    await screen.activate("02-short.ts");
    await act(async () => screen.model().getItem("01-tall.ts")!.select());
    expect(screen.model().getSelectedPaths()).toHaveLength(2);
    screen.targets.length = 0;
    await screen.activate("02-short.ts");
    expect(screen.model().getSelectedPaths()).toEqual(["02-short.ts"]);
    expect(screen.targets).toHaveLength(1);
  });

  it("leaves directory selection and expansion to the tree", async () => {
    await using screen = await fixture();
    await screen.mount({ files: [{ path: "src/app.ts", status: "modified" }] });
    const directory = screen.model().getItem("src/")!;
    if (!("isExpanded" in directory)) throw new Error("Expected the directory handle");
    expect(directory.isExpanded()).toBe(true);
    await screen.activate("src/");
    expect(directory.isExpanded()).toBe(false);
    await screen.activate("src/");
    expect(directory.isExpanded()).toBe(true);
    expect(screen.targets).toEqual([]);
  });

  it("reorders refreshed files without reopening a collapsed folder", async () => {
    await using screen = await fixture();
    const files: DiffFileTreeEntry[] = [
      { path: "src/state/shell.ts", status: "modified" },
      { path: "src/features/route.ts", status: "added" },
    ];
    await screen.mount({ files });
    const initialFolder = screen.model().getItem("src/features/")!;
    if (!("collapse" in initialFolder)) throw new Error("Expected the directory handle");
    await act(async () => initialFolder.collapse());
    await screen.mount({ files: [files[1]!, files[0]!] });
    const folder = screen.model().getItem("src/features/")!;
    if (!("isExpanded" in folder)) throw new Error("Expected the directory handle");
    expect(folder.isExpanded()).toBe(false);
  });

  it("reveals real diff paths and statuses when a directory is replaced by a file", async () => {
    await using screen = await fixture();
    const files: DiffFileTreeEntry[] = [
      { path: "office/config.ts", status: "deleted" },
      { path: "office", status: "added" },
    ];
    await screen.mount({ files, selectedPath: "office" });
    expect(screen.fileRows().map((row) => row.getAttribute("data-item-git-status"))).toEqual([
      "deleted",
      "added",
    ]);
    expect(screen.fileRows()[1]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.targets).toEqual([]);
    await screen.activate(screen.fileRows()[1]!);
    await screen.activate(screen.fileRows()[0]!);
    await screen.activate("office/");
    expect(screen.targets).toEqual([
      { type: "item", id: "office\0office", align: "start" },
      { type: "item", id: "office/config.ts\0office/config.ts", align: "start" },
    ]);
    expect(screen.row("office/").getAttribute("aria-expanded")).toBe("false");
    await screen.mount({ files, selectedPath: "office/config.ts" });
    expect(screen.row("office/").getAttribute("aria-expanded")).toBe("true");
    expect(screen.fileRows()[0]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.targets).toHaveLength(2);
  });

  it("keeps selection, focus, and collapsed folders through a colliding slice and refresh", async () => {
    await using screen = await fixture();
    const files: DiffFileTreeEntry[] = [
      { path: "office", status: "deleted" },
      { path: "src/route.ts", status: "modified" },
    ];
    await screen.mount({ files });
    await screen.activate("src/");
    await screen.activate("office");
    await act(async () => screen.model().focusPath("office"));
    expect(screen.model().getFocusedPath()).toBe("office");
    expect(screen.row("office").getAttribute("aria-selected")).toBe("true");
    const appended: DiffFileTreeEntry[] = [...files, { path: "office/config.ts", status: "added" }];
    await screen.mount({ files: appended });
    expect(screen.row("src/").getAttribute("aria-expanded")).toBe("false");
    expect(screen.fileRows()[0]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.row("office/").getAttribute("aria-selected")).toBe("false");
    expect.soft(screen.model().getFocusedPath()).toBe("office\u200b");
    expect(screen.targets).toEqual([{ type: "item", id: "office\0office", align: "start" }]);
    await screen.activate(screen.fileRows()[0]!);
    await screen.activate(screen.fileRows()[1]!);
    expect(screen.targets).toEqual([
      { type: "item", id: "office\0office", align: "start" },
      { type: "item", id: "office\0office", align: "start" },
      { type: "item", id: "office/config.ts\0office/config.ts", align: "start" },
    ]);
    await screen.activate("office/");
    await screen.mount({ files: appended.map((file) => ({ ...file })) });
    expect(screen.row("src/").getAttribute("aria-expanded")).toBe("false");
    expect(screen.row("office/").getAttribute("aria-expanded")).toBe("false");
    await screen.activate(screen.fileRows()[0]!);
    expect(screen.targets.at(-1)).toEqual({ type: "item", id: "office\0office", align: "start" });
    expect(screen.targets).toHaveLength(4);
  });

  it("preserves filename and extension icons when files become directory prefixes", async () => {
    await using screen = await fixture();
    const files: DiffFileTreeEntry[] = [
      { path: "AGENTS.md", status: "deleted" },
      { path: "config.ts", status: "deleted" },
    ];
    const rootFileIcons = () =>
      screen
        .fileRows()
        .filter((row) => row.getAttribute("aria-level") === "1")
        .map((row) => row.querySelector('[data-item-section="icon"] use')?.getAttribute("href"));
    await screen.mount({ files });
    const icons = rootFileIcons();
    expect(icons).toEqual(["#elysia-file-icon-agents", "#file-tree-builtin-typescript"]);
    await screen.mount({
      files: [
        ...files,
        { path: "AGENTS.md/note.txt", status: "added" },
        { path: "config.ts/note.txt", status: "added" },
      ],
    });
    expect(rootFileIcons()).toEqual(icons);
  });

  it("preserves a collapsed controlled selection through paging until explicitly revealed", async () => {
    await using screen = await fixture();
    const files: DiffFileTreeEntry[] = [
      { path: "src/office", status: "deleted" },
      { path: "src/route.ts", status: "modified" },
    ];
    await screen.mount({ files, selectedPath: "src/office" });
    expect(screen.model().getSelectedPaths()).toEqual(["src/office"]);
    expect(screen.targets).toEqual([]);
    await screen.activate("src/office");
    expect(screen.targets).toEqual([
      { type: "item", id: "src/office\0src/office", align: "start" },
    ]);

    const folder = screen.model().getItem("src/")!;
    if (!("collapse" in folder)) throw new Error("Expected the directory handle");
    await act(async () => folder.collapse());
    expect(screen.row("src/").getAttribute("aria-expanded")).toBe("false");
    const scroll = vi.spyOn(screen.model(), "scrollToPath");
    const appended: DiffFileTreeEntry[] = [...files, { path: "src/office/x.ts", status: "added" }];
    await screen.mount({ files: appended, selectedPath: "src/office" });
    expect.soft(screen.row("src/").getAttribute("aria-expanded")).toBe("false");
    expect.soft(scroll).not.toHaveBeenCalled();
    const selected = screen.model().getSelectedPaths();
    expect(selected).toHaveLength(1);
    expect(screen.model().getItem(selected[0]!)?.isDirectory()).toBe(false);
    expect(screen.targets).toHaveLength(1);

    await act(async () => folder.collapse());
    scroll.mockClear();
    await screen.mount({ files: appended, selectedPath: "src/office", revealRequestId: 1 });
    expect(screen.row("src/").getAttribute("aria-expanded")).toBe("true");
    expect(screen.model().getSelectedPaths()).toEqual(selected);
    expect(screen.row(selected[0]!).getAttribute("aria-selected")).toBe("true");
    expect(scroll).toHaveBeenCalledOnce();
    expect(screen.targets).toHaveLength(1);
    await screen.activate(selected[0]!);
    expect(screen.targets).toEqual([
      { type: "item", id: "src/office\0src/office", align: "start" },
      { type: "item", id: "src/office\0src/office", align: "start" },
    ]);

    await act(async () => folder.collapse());
    await screen.mount({ files: appended, selectedPath: "src/route.ts", revealRequestId: 1 });
    expect(screen.row("src/").getAttribute("aria-expanded")).toBe("true");
    expect(screen.model().getSelectedPaths()).toEqual(["src/route.ts"]);
    expect(screen.targets).toHaveLength(2);
  });
});
