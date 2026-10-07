// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Menu, MenuTrigger, MenuPopup } from "./ui/menu";
import { expect, it, vi } from "vite-plus/test";
import {
  CollectionPropertyPill,
  CollectionPropertiesPicker,
  CollectionViewPicker,
  CollectionRows,
  CollectionGroups,
  CollectionCardSizePicker,
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

it("keeps one table header across groups while exposing separate agent and status cells", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const columns = [
    { id: "title", label: "Title" },
    { id: "agent", label: "Assigned agent" },
    { id: "agentStatus", label: "Agent status" },
  ] as const;
  function Harness() {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <>
        <button onClick={() => setCollapsed((value) => !value)}>Collapse group</button>
        <CollectionGroups view="table" columns={columns}>
          {["Todo", "Done"].map((group) => (
            <section key={group}>
              <h2>{group}</h2>
              {!collapsed ? (
                <CollectionRows view="table" header={false} columns={columns} label={group}>
                  <div role="row">
                    <CollectionTableCell view="table" align="left">
                      Task
                    </CollectionTableCell>
                    <CollectionTableCell view="table" align="left">
                      Friday
                    </CollectionTableCell>
                    <CollectionTableCell view="table">Waiting</CollectionTableCell>
                  </div>
                </CollectionRows>
              ) : null}
            </section>
          ))}
        </CollectionGroups>
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(
      [...host.querySelectorAll('[role="columnheader"]')].map((node) => node.textContent),
    ).toEqual(["Title", "Assigned agent", "Agent status"]);
    expect(host.querySelectorAll('[role="cell"]')).toHaveLength(6);
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(host.querySelectorAll('[role="columnheader"]')).toHaveLength(3);
    expect(host.querySelectorAll('[role="cell"]')).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("offers Pages Wall view and changes the selected card size", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [view, setView] = useState<CollectionView>("list");
    const [size, setSize] = useState<"small" | "medium" | "large">("medium");
    return (
      <>
        <CollectionViewPicker view={view} onChange={setView} pages />
        <CollectionPropertiesPicker options={[]} value={[]} onChange={() => {}} />
        <p>{size}</p>
        <Menu>
          <MenuTrigger render={<button>Settings</button>} />
          <MenuPopup>
            <CollectionCardSizePicker value={size} onChange={setSize} />
          </MenuPopup>
        </Menu>
      </>
    );
  }
  const choose = async (label: string) => {
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
      (item) => item.textContent === label,
    )!;
    expect(item).toBeDefined();
    await act(async () => item.click());
    await act(async () => vi.advanceTimersByTime(300));
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="View"]')!.click());
    await choose("Wall");
    expect(host.querySelector('[aria-label="View"]')?.textContent).toBe("Wall");
    expect(
      [...document.querySelectorAll('[role="menuitemradio"]')].map((item) => item.textContent),
    ).not.toContain("Folders");
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((node) => node.textContent === "Settings")!
        .click(),
    );
    await choose("Large");
    expect(host.querySelector("p")?.textContent).toBe("large");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
