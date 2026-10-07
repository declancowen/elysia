// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import {
  CollectionPropertyPill,
  CollectionPropertiesPicker,
  CollectionViewPicker,
  CollectionRows,
  CollectionTableCell,
  type CollectionView,
  type CollectionProperty,
} from "./WorkspaceCollectionView";

it("edits metadata through a real menu without starting a row drag", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const drag = vi.fn();
  function Harness() {
    const [status, setStatus] = useState("todo");
    return (
      <div onPointerDown={drag} onKeyDown={drag}>
        <CollectionPropertyPill
          label="Change status for task"
          value={status}
          options={[
            { value: "todo", label: "Todo" },
            { value: "done", label: "Done" },
          ]}
          onChange={setStatus}
        >
          {status === "done" ? "Completed" : "Waiting"}
        </CollectionPropertyPill>
      </div>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      trigger.click();
    });
    expect(drag).not.toHaveBeenCalled();
    const options = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(options.map((option) => option.textContent)).toEqual(["Todo", "Done"]);
    expect(options[0]?.getAttribute("aria-checked")).toBe("true");
    await act(async () => options[1]!.click());
    expect(trigger.textContent).toBe("Completed");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("changes visible properties across list and table without hiding the agent column", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [view, setView] = useState<CollectionView>("list");
    const [properties, setProperties] = useState<CollectionProperty[]>(["project"]);
    const options = [
      { id: "project", label: "Project" },
      { id: "createdAt", label: "Created at" },
    ] as const;
    const selected = options.filter((option) => properties.includes(option.id));
    return (
      <>
        <CollectionViewPicker view={view} onChange={setView} />
        <CollectionPropertiesPicker options={options} value={properties} onChange={setProperties} />
        <CollectionRows
          view={view}
          label="Tasks"
          columns={[
            { id: "title", label: "Title" },
            { id: "agent", label: "Agent status" },
            ...selected,
          ]}
        >
          <div role={view === "table" ? "row" : undefined}>
            <CollectionTableCell view={view} align="left">
              Task
            </CollectionTableCell>
            <CollectionTableCell view={view} align="left">
              Friday · Waiting
            </CollectionTableCell>
            {selected.map((option) => (
              <CollectionTableCell key={option.id} view={view}>
                {option.id === "project" ? "Work" : "07/10/2026"}
              </CollectionTableCell>
            ))}
          </div>
        </CollectionRows>
      </>
    );
  }
  const trigger = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const choose = async (role: string, text: string) => {
    const option = [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)].find(
      (item) => item.textContent === text,
    )!;
    expect(option).toBeDefined();
    await act(async () => option.click());
  };
  try {
    await act(async () => root.render(<Harness />));
    expect(host.querySelector('[role="columnheader"]')).toBeNull();
    expect(host.textContent).not.toContain("07/10/2026");
    await act(async () => trigger("Properties").click());
    expect(
      [...document.querySelectorAll('[role="menuitemcheckbox"]')].map((item) => item.textContent),
    ).toEqual(["Project", "Created at"]);
    await choose("menuitemcheckbox", "Project");
    await choose("menuitemcheckbox", "Created at");
    expect(host.textContent).not.toContain("Work");
    expect(host.textContent).toContain("07/10/2026");
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    await act(async () => trigger("View").click());
    await choose("menuitemradio", "Table");
    const headers = () =>
      [...host.querySelectorAll('[role="columnheader"]')].map((item) => item.textContent);
    const cells = () => [...host.querySelectorAll('[role="cell"]')].map((item) => item.textContent);
    expect(headers()).toEqual(["Title", "Agent status", "Created at"]);
    expect(cells()).toEqual(["Task", "Friday · Waiting", "07/10/2026"]);
    await act(async () => trigger("Properties").click());
    await choose("menuitemcheckbox", "Created at");
    expect(headers()).toEqual(["Title", "Agent status"]);
    expect(cells()).toEqual(["Task", "Friday · Waiting"]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
