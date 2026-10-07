// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuCheckboxItem,
} from "./menu";

it("shows the current choice and moves its tick when a menu option changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  function Options() {
    const [size, setSize] = useState("small");
    const [properties, setProperties] = useState(false);
    return (
      <Menu open>
        <MenuTrigger>Options</MenuTrigger>
        <MenuPopup>
          <MenuRadioGroup value={size} onValueChange={setSize}>
            <MenuRadioItem value="small" closeOnClick={false}>
              Small
            </MenuRadioItem>
            <MenuRadioItem value="large" closeOnClick={false}>
              Large
            </MenuRadioItem>
          </MenuRadioGroup>
          <MenuCheckboxItem
            checked={properties}
            onCheckedChange={setProperties}
            closeOnClick={false}
          >
            Project
          </MenuCheckboxItem>
        </MenuPopup>
      </Menu>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Options />));
    expect(document.documentElement.style.overflowY).not.toBe("hidden");
    expect(document.body.style.overflowY).not.toBe("hidden");
    const radios = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(radios()[0]?.getAttribute("aria-checked")).toBe("true");
    expect(radios()[0]?.querySelector('[data-slot="menu-radio-item-indicator"]')).not.toBeNull();
    expect(radios()[1]?.querySelector('[data-slot="menu-radio-item-indicator"]')).toBeNull();
    await act(async () => radios()[1]!.click());
    expect(radios()[1]?.getAttribute("aria-checked")).toBe("true");
    expect(radios()[0]?.querySelector('[data-slot="menu-radio-item-indicator"]')).toBeNull();
    expect(
      radios()[1]?.lastElementChild?.querySelector('[data-slot="menu-radio-item-indicator"]'),
    ).not.toBeNull();
    const checkbox = document.querySelector<HTMLElement>('[role="menuitemcheckbox"]')!;
    await act(async () => checkbox.click());
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(checkbox.lastElementChild?.querySelector("svg")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
