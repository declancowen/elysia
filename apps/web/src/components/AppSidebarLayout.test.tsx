// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { AppSidebarLayout } from "./AppSidebarLayout";
import { setAgentSidebarActive } from "./agents/agentSidebarStore";
const state = vi.hoisted(() => ({
  pathname: "/",
  legacy: false,
  widths: {} as Record<string, number>,
}));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => [] }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useCanGoBack: () => false,
  useParams: () => ({}),
  useLocation: (options?: {
    select: (value: { pathname: string; search: Record<string, unknown> }) => unknown;
  }) => {
    const location = { pathname: state.pathname, search: {} };
    return options ? options.select(location) : location;
  },
}));
vi.mock("../env", () => ({ isElectron: false }));
vi.mock("./chat/ConversationTabs", () => ({
  ConversationTabs: () => <nav aria-label="Shared tabs" />,
}));
vi.mock("../hooks/useSettings", () => ({
  useLegacySidebarEnabled: () => state.legacy,
  useEnvironmentIdentificationMode: () => "pill",
}));
vi.mock("../hooks/useThreadVisitedMigration", () => ({ useThreadVisitedMigration: () => {} }));
vi.mock("../hooks/useLocalStorage", () => ({
  getLocalStorageItem: (key: string) => state.widths[key] ?? null,
  removeLocalStorageItem: (key: string) => {
    delete state.widths[key];
  },
  setLocalStorageItem: () => {},
}));
vi.mock("../hooks/useConversationTabNavigation", () => ({ useArchivedConversationTabs: () => {} }));
vi.mock("../state/entities", () => ({ useProjects: () => [] }));
vi.mock("./SidebarStageBackdrop", () => ({ useSidebarStageBackdropVariant: () => null }));
vi.mock("../panelAnimations", () => ({
  usePanelAnimationSettings: () => ({ active: false, durationMs: 0 }),
  usePanelNavigationSuppression: () => false,
  PanelAnimationSuppressionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./LegacySidebar", () => ({ default: () => <p>Project navigation</p> }));
vi.mock("./Sidebar", async () => {
  const { SidebarTrigger } = await import("./ui/sidebar");
  return {
    default: () => (
      <>
        <p>Chat navigation</p>
        <SidebarTrigger aria-label="Close main sidebar" />
      </>
    ),
  };
});
vi.mock("./sidebar/SidebarChrome", () => ({
  AppNavigationRail: () => null,
  SidebarChromeHeader: () => null,
  SidebarNewChatButton: () => null,
}));
vi.mock("./sidebar/mainAppLocation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sidebar/mainAppLocation")>()),
  MainAppLocationTracker: () => null,
}));
vi.mock("./agents/AgentsSidebar", () => ({ AgentsSidebar: () => <p>Agent navigation</p> }));
vi.mock("./settings/SettingsSidebarNav", () => ({ SettingsSidebarNav: () => null }));

it("opens and closes the mobile sidebar from the main page", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 500);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const originalAnimations = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "getAnimations",
  );
  Object.defineProperty(HTMLElement.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <AppSidebarLayout>
          <p>Current chat</p>
        </AppSidebarLayout>,
      ),
    );
    const opener = container.querySelector<HTMLButtonElement>(
      '[data-mobile-sidebar-control] button[aria-label="Toggle main sidebar"]',
    )!;
    expect(opener).not.toBeNull();
    expect(opener.getAttribute("aria-pressed")).toBe("false");
    await act(async () => opener.click());
    expect(opener.getAttribute("aria-pressed")).toBe("true");
    const sheet = document.querySelector('[data-mobile="true"][data-sidebar="sidebar"]')!;
    expect(sheet.textContent).toContain("Chat navigation");
    await act(async () =>
      sheet.querySelector<HTMLButtonElement>('[aria-label="Close main sidebar"]')!.click(),
    );
    expect(opener.getAttribute("aria-pressed")).toBe("false");
    state.pathname = "/projects";
    await act(async () =>
      root.render(
        <AppSidebarLayout>
          <p>Projects</p>
        </AppSidebarLayout>,
      ),
    );
    expect(container.querySelector("[data-mobile-sidebar-control]")).not.toBeNull();
    await act(async () => opener.click());
    expect(
      document.querySelector('[data-mobile="true"][data-sidebar="sidebar"]')?.textContent,
    ).toContain("Chat navigation");
  } finally {
    state.pathname = "/";
    await act(async () => root.unmount());
    container.remove();
    if (originalAnimations)
      Object.defineProperty(HTMLElement.prototype, "getAnimations", originalAnimations);
    else Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
    vi.unstubAllGlobals();
  }
});

it("retains Agents beside its conversations and restores each Home sidebar and utility view", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 1280);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    act(async () =>
      root.render(
        <AppSidebarLayout>
          <p>Conversation body</p>
        </AppSidebarLayout>,
      ),
    );
  try {
    state.pathname = "/agents";
    await render();
    expect(host.querySelector("[data-app-sidebar]")?.getAttribute("aria-label")).toBe("Agents");
    expect(host.textContent).toContain("Agent navigation");
    state.pathname = "/local/agent-chat";
    await render();
    expect(host.textContent).toContain("Agent navigation");
    expect(host.textContent).not.toContain("Chat navigation");
    await act(async () => setAgentSidebarActive(false));
    expect(host.textContent).toContain("Chat navigation");
    state.legacy = true;
    await render();
    expect(host.textContent).toContain("Project navigation");
    state.pathname = "/agents";
    await render();
    state.pathname = "/settings";
    await render();
    expect(host.querySelector("[data-app-sidebar]")?.getAttribute("aria-label")).toBe("Settings");
    expect(host.textContent).not.toContain("Agent navigation");
    state.pathname = "/projects";
    await render();
    expect(host.querySelector("[data-app-sidebar]")).toBeNull();
    const sidebarToggle = () =>
      host.querySelector<HTMLButtonElement>(
        '[data-app-topbar] [aria-label="Toggle main sidebar"]',
      )!;
    expect(sidebarToggle().disabled).toBe(true);
    const previousState = sidebarToggle().getAttribute("aria-pressed");
    await act(async () => sidebarToggle().click());
    expect(sidebarToggle().getAttribute("aria-pressed")).toBe(previousState);
    for (const pathname of ["/tasks", "/pages"]) {
      state.pathname = pathname;
      await render();
      expect(sidebarToggle().disabled).toBe(true);
    }
    expect(host.textContent).toContain("Conversation body");
    state.pathname = "/usage";
    await render();
    expect(host.querySelector("[data-app-sidebar]")).toBeNull();
    expect(sidebarToggle().disabled).toBe(true);
    expect(host.textContent).toContain("Conversation body");
    state.pathname = "/local/agent-chat";
    await render();
    expect(sidebarToggle().disabled).toBe(false);
    expect(host.textContent).not.toContain("Agent navigation");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    setAgentSidebarActive(false);
    state.pathname = "/";
    state.legacy = false;
    vi.unstubAllGlobals();
  }
});

it("restores each surface width and resets only the current surface", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  state.widths = {
    chat_thread_sidebar_width: 360,
    chat_thread_sidebar_width_agents: 320,
    chat_thread_sidebar_width_scheduled: 280,
    "chat_thread_sidebar_width_pull-requests": 400,
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (pathname: string) => {
    state.pathname = pathname;
    return act(async () =>
      root.render(
        <AppSidebarLayout>
          <p>{pathname}</p>
        </AppSidebarLayout>,
      ),
    );
  };
  const width = () =>
    host
      .querySelector<HTMLElement>("[data-slot=sidebar-wrapper]")!
      .style.getPropertyValue("--sidebar-width");
  try {
    await render("/agents");
    expect(width()).toBe("320px");
    await render("/settings/scheduled-tasks");
    expect(width()).toBe("280px");
    await render("/pull-requests");
    expect(width()).toBe("400px");
    await act(async () =>
      host
        .querySelector('[aria-label="Resize Sidebar"]')!
        .dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    );
    expect(width()).toBe("256px");
    await render("/");
    expect(width()).toBe("360px");
    await render("/agents");
    expect(width()).toBe("320px");
    expect(state.widths.chat_thread_sidebar_width_scheduled).toBe(280);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    state.pathname = "/";
    state.widths = {};
    setAgentSidebarActive(false);
    vi.unstubAllGlobals();
  }
});
