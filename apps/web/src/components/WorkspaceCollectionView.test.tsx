// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { CollectionPropertyPill } from "./WorkspaceCollectionView";

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
