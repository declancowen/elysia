// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { SidebarProvider, useSidebar } from "../ui/sidebar";
import { SettingsSidebarNav } from "./SettingsSidebarNav";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: ({ select }: { select: (location: { hash: string; search: object }) => unknown }) =>
    select({ hash: "", search: {} }),
}));
vi.mock("~/hooks/useSettings", () => ({ useCodeWorkspace: () => false }));
vi.mock("~/env", () => ({ isElectron: false }));
vi.mock("../../hooks/useConversationTabNavigation", () => ({
  useConversationTabNavigation: () => vi.fn(),
}));
vi.mock("./useAvailableSettingsSearchItems", () => ({
  useAvailableSettingsSearchItems: () => [
    { id: "theme", title: "Theme", to: "/settings/appearance" },
  ],
}));
vi.mock("../sidebar/SidebarChrome", () => ({
  SidebarChromeHeader: ({ search }: { search: ReactNode }) => search,
  SidebarUtilityMenu: () => null,
}));

function SidebarVisibility() {
  const { open } = useSidebar();
  return <output>{open ? "Open" : "Closed"}</output>;
}

it("keeps slash search inside the floating Settings sidebar without opening the pinned sidebar", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <SidebarProvider defaultOpen={false}>
          <SidebarVisibility />
          <div data-pinned>
            <SettingsSidebarNav pathname="/settings/general" />
          </div>
          <div data-floating>
            <SettingsSidebarNav pathname="/settings/general" preview />
          </div>
        </SidebarProvider>,
      ),
    );
    await act(async () =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }),
      ),
    );
    const input = host.querySelector<HTMLInputElement>(
      '[data-floating] input[aria-label="Search settings"]',
    );
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(host.querySelector("[data-pinned] input")).toBeNull();
    expect(host.querySelector("output")?.textContent).toBe("Closed");
    // A retained pinned search and a floating search must target their own results.
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-pinned] button[aria-label="Search settings"]')!
        .click(),
    );
    const pinnedInput = host.querySelector<HTMLInputElement>("[data-pinned] input")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      for (const field of [pinnedInput, input!]) {
        setValue.call(field, "theme");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(pinnedInput.getAttribute("aria-activedescendant")).not.toBe(
      input!.getAttribute("aria-activedescendant"),
    );
    expect(
      document
        .getElementById(input!.getAttribute("aria-activedescendant")!)
        ?.closest("[data-floating]"),
    ).not.toBeNull();
    expect(
      document
        .getElementById(pinnedInput.getAttribute("aria-activedescendant")!)
        ?.closest("[data-pinned]"),
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (originalScroll)
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    vi.unstubAllGlobals();
  }
});
