// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  ContextMenuButton,
  contextMenuAgentIcon,
  dismissContextMenu,
  isContextMenuOpen,
  showContextMenuFallback,
} from "./contextMenuFallback";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});

afterEach(async () => {
  await act(async () => dismissContextMenu());
  vi.unstubAllGlobals();
});

function item(label: string) {
  const result = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(result, `Missing menu action: ${label}`).toBeDefined();
  return result!;
}

async function open(items: Parameters<typeof showContextMenuFallback>[0]) {
  let selection!: Promise<string | null>;
  await act(async () => {
    selection = showContextMenuFallback(items, { x: 90, y: 100 });
  });
  return { selection };
}

describe("shared row menus", () => {
  it("uses standard menu rows, icons, dividers and destructive treatment", async () => {
    const { selection } = await open([
      { id: "copy", label: "Copy ID", icon: "copy" },
      { id: "move", label: "Move", icon: "workspace-folder", separatorBefore: true },
      {
        id: "delete",
        label: "Delete",
        icon: "workspace-delete",
        destructive: true,
        separatorBefore: true,
      },
    ]);
    expect(document.querySelector('[data-slot="menu-popup"]')).not.toBeNull();
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(2);
    for (const label of ["Copy ID", "Move", "Delete"])
      expect(item(label).querySelector("svg")).not.toBeNull();
    expect(item("Delete").dataset.variant).toBe("destructive");
    await act(async () => item("Move").click());
    await expect(selection).resolves.toBe("move");
    expect(document.querySelector('[data-slot="menu-popup"]')).toBeNull();
  });

  it("keeps choice icons on the left and ticks on the right", async () => {
    await open([
      { id: "done", label: "Done", icon: "task-done", checked: true },
      { id: "todo", label: "To do", icon: "task-todo", checked: false },
    ]);
    expect(item("Done").getAttribute("aria-checked")).toBe("true");
    expect(item("To do").getAttribute("aria-checked")).toBe("false");
    expect(item("Done").firstElementChild?.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(item("Done").lastElementChild?.querySelector("svg")).not.toBeNull();
  });

  it("supports independent checked actions and non-actionable section labels", async () => {
    const { selection } = await open([
      { id: "section", label: "Options", header: true },
      { id: "first", label: "First", checked: true, icon: "check" },
      { id: "second", label: "Second", checked: true, icon: "check" },
    ]);
    expect(document.querySelector('[data-slot="menu-label"]')?.textContent).toBe("Options");
    expect(item("First").getAttribute("aria-checked")).toBe("true");
    expect(item("Second").getAttribute("aria-checked")).toBe("true");
    await act(async () => item("Second").click());
    await expect(selection).resolves.toBe("second");
  });

  it("ignores selection from the gesture that opened the menu", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const { selection } = await open([{ id: "open", label: "Open", icon: "workspace-page" }]);
    await act(async () => item("Open").click());
    expect(isContextMenuOpen()).toBe(true);
    await act(async () => frames.splice(0).forEach((frame) => frame(0)));
    await act(async () => item("Open").click());
    await expect(selection).resolves.toBe("open");
  });

  it("supports nested actions and restores focus when they close", async () => {
    const invoker = document.createElement("button");
    document.body.append(invoker);
    invoker.focus();
    try {
      const { selection } = await open([
        {
          id: "project",
          label: "Change project",
          icon: "workspace-project",
          children: [
            { id: "project:none", label: "No Project", icon: "workspace-project" },
            { id: "project:research", label: "Research", icon: "workspace-project" },
          ],
        },
      ]);
      await act(async () => item("Change project").click());
      expect(item("Change project").getAttribute("aria-expanded")).toBe("true");
      await act(async () => item("Research").click());
      await expect(selection).resolves.toBe("project:research");
      expect(document.activeElement).toBe(invoker);
    } finally {
      invoker.remove();
    }
  });

  it("cannot activate disabled actions and closes on Escape", async () => {
    const { selection } = await open([{ id: "delete", label: "Delete", disabled: true }]);
    await act(async () => item("Delete").click());
    expect(isContextMenuOpen()).toBe(true);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await expect(selection).resolves.toBeNull();
  });

  it("dismisses a prior menu when a new one opens", async () => {
    const first = await open([{ id: "first", label: "First" }]);
    const second = await open([{ id: "second", label: "Second" }]);
    await expect(first.selection).resolves.toBeNull();
    expect(document.querySelectorAll('[data-slot="menu-popup"]')).toHaveLength(1);
    await act(async () => dismissContextMenu());
    await expect(second.selection).resolves.toBeNull();
    expect(isContextMenuOpen()).toBe(false);
  });

  it("returns focus to the original invoker after replacing a menu", async () => {
    const invoker = document.createElement("button");
    document.body.append(invoker);
    invoker.focus();
    try {
      const first = await open([{ id: "first", label: "First" }]);
      await act(async () => item("First").focus());
      const second = await open([{ id: "second", label: "Second" }]);
      await expect(first.selection).resolves.toBeNull();
      expect(document.activeElement).not.toBe(invoker);
      await act(async () => item("Second").click());
      await expect(second.selection).resolves.toBe("second");
      expect(document.activeElement).toBe(invoker);
    } finally {
      invoker.remove();
    }
  });

  it("dismisses on outside interaction without stealing the new control's focus", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      const { selection } = await open([{ id: "open", label: "Open" }]);
      await act(async () => {
        outside.focus();
        outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      await expect(selection).resolves.toBeNull();
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it("shows assigned agent avatars and can select a nested checked choice by keyboard", async () => {
    const invoker = document.createElement("button");
    document.body.append(invoker);
    invoker.focus();
    const { selection } = await open([
      {
        id: "assigned",
        label: "Change assigned",
        icon: "workspace-assigned",
        children: [
          {
            id: "friday",
            label: "Friday",
            checked: true,
            icon: contextMenuAgentIcon({ preset: "brain", color: "#28B4FF" }),
          },
          { id: "none", label: "No agent", checked: false, icon: "workspace-assigned" },
        ],
      },
    ]);
    await act(async () => {
      item("Change assigned").focus();
      item("Change assigned").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(item("Friday").querySelector("[data-animated=false]")).not.toBeNull();
    expect(item("Friday").getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      item("No agent").focus();
      item("No agent").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      item("No agent").dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    });
    await expect(selection).resolves.toBe("none");
    expect(document.activeElement).toBe(invoker);
    invoker.remove();
  });

  it("marks the button closed before an async action finishes", async () => {
    let finish!: () => void;
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <ContextMenuButton
            onOpen={async (position) => {
              await showContextMenuFallback(
                [{ id: "save", label: "Save", icon: "check" }],
                position,
              );
              await work;
            }}
          >
            Options
          </ContextMenuButton>,
        ),
      );
      const button = host.querySelector("button")!;
      await act(async () => button.click());
      expect(button.getAttribute("aria-expanded")).toBe("true");
      await act(async () => item("Save").click());
      expect(button.getAttribute("aria-expanded")).toBe("false");
      await open([{ id: "other", label: "Other menu" }]);
      expect(button.getAttribute("aria-expanded")).toBe("false");
      await act(async () => dismissContextMenu());
      await act(async () => finish());
    } finally {
      finish();
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("shows identical actions from right-click and the overflow button, including keyboard activation", async () => {
    const actions = [
      { id: "open", label: "Open task", icon: "workspace-task" },
      { id: "copy", label: "Copy ID", icon: "copy", separatorBefore: true },
    ];
    const chosen = vi.fn();
    const show = async (position: { x: number; y: number }) => {
      chosen(await showContextMenuFallback(actions, position));
    };
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <div
            onContextMenu={(event) => {
              event.preventDefault();
              void show({ x: event.clientX, y: event.clientY });
            }}
          >
            <span>Task row</span>
            <ContextMenuButton aria-label="Task options" onOpen={show}>
              Options
            </ContextMenuButton>
          </div>,
        ),
      );
      await act(async () =>
        host.firstElementChild!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
      );
      const describe = () =>
        [...document.querySelectorAll('[role="menuitem"]')].map((element) => ({
          label: element.textContent,
          content: element.innerHTML,
          classes: element.className,
        }));
      const contextActions = describe();
      await act(async () => item("Copy ID").click());
      expect(chosen).toHaveBeenLastCalledWith("copy");
      const button = host.querySelector("button")!;
      button.focus();
      await act(async () =>
        button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
      );
      expect(describe()).toEqual(contextActions);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      await act(async () => item("Copy ID").click());
      expect(chosen).toHaveBeenLastCalledWith("copy");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(button);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
