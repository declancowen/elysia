vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi } from "../../test/render";
import { act } from "../../test/act";
// @vitest-environment jsdom

import { expect, it, vi } from "vite-plus/test";
import { AppTopbar, useAppTopbarHost } from "./AppTopbar";
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

function TopbarHostState() {
  const host = useAppTopbarHost();
  return <output aria-label="Topbar host">{host?.id ?? "unmounted"}</output>;
}

it("publishes the committed topbar host and clears it when the topbar unmounts", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const container = document.createElement("div");
  document.body.append(container);
  await using root = await renderUi(null, { container: container, router: false });
  const render = (mounted: boolean) => (
    <SidebarProvider>
      {mounted ? <AppTopbar sidebarControl={null} /> : null}
      <TopbarHostState />
    </SidebarProvider>
  );
  try {
    await act(async () => root.rerender(render(true)));
    const host = container.querySelector("[data-app-topbar]");
    expect(host).not.toBeNull();
    expect(container.querySelector("output")!.textContent).toBe("elysia-app-topbar-content");
    await act(async () => root.rerender(render(false)));
    expect(container.querySelector("output")!.textContent).toBe("unmounted");
    await act(async () => root.rerender(render(true)));
    expect(container.querySelector("output")!.textContent).toBe("elysia-app-topbar-content");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("moves through real browser history while preserving the sidebar toggle", async () => {
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
  await using root = await renderUi(null, { container: container, router: false });
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  try {
    await act(async () =>
      root.rerender(
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
