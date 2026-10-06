// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { AppTopbar } from "./AppTopbar";
import { SidebarProvider, SidebarTrigger, useSidebar } from "./ui/sidebar";

vi.mock("@tanstack/react-router", () => ({
  useCanGoBack: () => true,
  useLocation: () => ({ pathname: "/", search: {} }),
  useParams: () => ({}),
}));
vi.mock("./sidebar/SidebarChrome", () => ({
  SidebarNewChatButton: () => <button aria-label="New chat" />,
}));
vi.mock("./chat/ConversationTabs", () => ({
  ConversationTabs: () => <nav aria-label="Shared tabs" />,
}));
vi.mock("~/env", () => ({ isElectron: false }));

function SidebarState() {
  const { state } = useSidebar();
  return <output aria-label="Sidebar state">{state}</output>;
}

it("moves through real browser history while preserving the sidebar toggle", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("cookieStore", {
    set: async ({ name, value }: { name: string; value: string }) => {
      document.cookie = `${name}=${value}`;
    },
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const originalHref = window.location.href;
  window.history.pushState({}, "", "/first-chat");
  window.history.pushState({}, "", "/settings");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  try {
    await act(async () =>
      root.render(
        <SidebarProvider>
          <AppTopbar sidebarControl={<SidebarTrigger aria-label="Toggle main sidebar" />} />
          <SidebarState />
        </SidebarProvider>,
      ),
    );
    expect(container.querySelector("output")!.textContent).toBe("expanded");
    await act(async () => button("Toggle main sidebar").click());
    expect(container.querySelector("output")!.textContent).toBe("collapsed");
    expect(document.cookie).toContain("sidebar_state=false");
    await act(async () => {
      const traversed = new Promise<void>((resolve) =>
        window.addEventListener("popstate", () => resolve(), { once: true }),
      );
      button("Back").click();
      await traversed;
    });
    expect(window.location.pathname).toBe("/first-chat");
    await act(async () => {
      const traversed = new Promise<void>((resolve) =>
        window.addEventListener("popstate", () => resolve(), { once: true }),
      );
      button("Forward").click();
      await traversed;
    });
    expect(window.location.pathname).toBe("/settings");
    expect(container.querySelector("output")!.textContent).toBe("collapsed");
  } finally {
    await act(async () => root.unmount());
    window.history.replaceState({}, "", originalHref);
    document.cookie = "sidebar_state=; Max-Age=0";
    container.remove();
    vi.unstubAllGlobals();
  }
});
