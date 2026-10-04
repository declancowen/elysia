// @vitest-environment jsdom
import { EnvironmentId } from "@t3tools/contracts";
import { act, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { SidebarProvider } from "../ui/sidebar";
import { RECENT_THREADS_EXPANSION_KEY, RecentThreadsHeader } from "./RecentThreadsHeader";
import {
  AppNavigationRail,
  SidebarChromeFooter,
  SidebarChromeHeader,
  SidebarHeaderSearch,
  SidebarNewChatButton,
  SidebarUtilityMenu,
} from "./SidebarChrome";
import { useUiStateStore } from "~/uiStateStore";
import { useAgentSidebarStore } from "../agents/agentSidebarStore";
import { CommandDialog } from "../ui/command";
import { SidebarThreadSearch } from "./SidebarThreadHeader";

const state = vi.hoisted(() => ({
  pathname: "/",
  settings: { workspaceMode: "code" as "code" | "work", legacySidebarEnabled: true },
  connected: true,
  startScratchThread: vi.fn(),
  updateSettings: vi.fn(),
  navigate: vi.fn(),
  pullRequestsSupported: true,
  listeners: new Set<() => void>(),
}));

const subscribe = (listener: () => void) => {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
};

vi.mock("~/hooks/useSettings", () => ({
  useCodeWorkspace: () =>
    useSyncExternalStore(subscribe, () => state.settings).workspaceMode === "code",
  useClientSettings: (select: (settings: typeof state.settings) => unknown) =>
    select(useSyncExternalStore(subscribe, () => state.settings)),
  useUpdateClientSettings: () => state.updateSettings,
  useEnvironmentIdentificationMode: () => "pill",
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useLocation: (options: { select: (location: { pathname: string }) => unknown }) =>
    options.select({ pathname: useSyncExternalStore(subscribe, () => state.pathname) }),
  Link: () => null,
}));

vi.mock("~/state/environments", () => ({
  usePrimaryEnvironmentId: () => EnvironmentId.make("local"),
  useEnvironments: () => {
    const pullRequests = useSyncExternalStore(subscribe, () => state.pullRequestsSupported);
    return {
      environments: [{ serverConfig: { environment: { capabilities: { pullRequests } } } }],
    };
  },
}));

it("navigates rail pages and keeps the thread switcher in Workspace", async () => {
  vi.stubGlobal("cookieStore", { set: vi.fn(async () => {}) });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  state.pathname = "/usage";
  state.settings = { workspaceMode: "code", legacySidebarEnabled: true };
  state.pullRequestsSupported = true;
  state.navigate.mockReset();
  state.updateSettings.mockImplementation((patch: Partial<typeof state.settings>) => {
    state.settings = { ...state.settings, ...patch };
    for (const listener of state.listeners) listener();
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = () => {
    for (const listener of state.listeners) listener();
    root.render(
      <SidebarProvider>
        <AppNavigationRail />
        <SidebarChromeHeader isElectron={false} />
        <SidebarChromeFooter />
      </SidebarProvider>,
    );
  };
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  try {
    await act(async () => render());
    expect(
      [...container.querySelectorAll("button")]
        .map((el) => el.getAttribute("aria-label"))
        .filter(Boolean),
    ).toEqual([
      "Workspace",
      "Agents",
      "Scheduled",
      "Projects",
      "Pull requests",
      "Settings",
      "Code workspace · Switch to Work",
      "Stats",
      "Switch to Thread view",
    ]);
    expect(button("Stats").getAttribute("aria-current")).toBe("page");
    await act(async () => button("Agents").click());
    expect(state.navigate).toHaveBeenLastCalledWith({ to: "/agents", search: {} });
    state.pathname = "/local/agent-thread";
    await act(async () => render());
    expect(button("Agents").getAttribute("aria-current")).toBe("page");
    expect(button("Workspace").getAttribute("aria-current")).toBeNull();
    await act(async () => button("Scheduled").click());
    expect(state.navigate).toHaveBeenLastCalledWith({ to: "/settings/scheduled-tasks" });
    expect(useAgentSidebarStore.getState().active).toBe(false);
    await act(async () => button("Projects").click());
    expect(state.navigate).toHaveBeenLastCalledWith({ to: "/projects" });
    await act(async () => button("Workspace").click());
    expect(state.navigate).toHaveBeenLastCalledWith({ href: "/" });
    expect(useAgentSidebarStore.getState().active).toBe(false);
    expect(button("Workspace").getAttribute("aria-current")).toBe("page");
    await act(async () => button("Switch to Thread view").click());
    expect(state.settings.legacySidebarEnabled).toBe(false);
    expect(button("Switch to Project view")).not.toBeNull();
    await act(async () => button("Code workspace · Switch to Work").click());
    expect(state.settings.workspaceMode).toBe("work");
    expect(container.querySelector('[aria-label="Pull requests"]')).toBeNull();
    state.pathname = "/settings";
    await act(async () => render());
    expect(button("Work workspace · Switch to Code")).not.toBeNull();
    expect(button("Switch to Project view")).not.toBeNull();
    expect(button("Settings").getAttribute("aria-current")).toBe("page");
    await act(async () => button("Work workspace · Switch to Code").click());
    expect(button("Pull requests")).not.toBeNull();
    state.pullRequestsSupported = false;
    await act(async () => render());
    expect(container.querySelector('[aria-label="Pull requests"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    state.pullRequestsSupported = true;
    vi.unstubAllGlobals();
  }
});

vi.mock("~/hooks/useScratchProject", () => ({
  useScratchProject: () => ({
    scratchEnvironmentId: (environmentId: EnvironmentId | null) =>
      state.connected ? environmentId : null,
    startScratchThread: state.startScratchThread,
  }),
}));

vi.mock("./SidebarUpdatePill", () => ({
  SidebarUpdatePill: () => null,
  SidebarUpdateArchitectureWarning: () => null,
}));

vi.mock("./SidebarThreadUndoNotice", () => ({ SidebarThreadUndoNotice: () => null }));

it("keeps Work/Code beside Settings, preserves sidebar layout, and hides both switches in Settings and Stats", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  state.pathname = "/";
  state.settings = { workspaceMode: "code", legacySidebarEnabled: true };
  state.connected = true;
  const originalProjectExpansion = useUiStateStore.getState().projectExpandedById;
  useUiStateStore.setState({ projectExpandedById: {} });
  state.startScratchThread.mockReset();
  state.updateSettings.mockImplementation((patch: Partial<typeof state.settings>) => {
    state.settings = { ...state.settings, ...patch };
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const environmentId = EnvironmentId.make("local");
  const render = () => {
    for (const listener of state.listeners) listener();
    root.render(
      <SidebarProvider>
        <SidebarUtilityMenu />
        <RecentThreadsHeader environmentId={environmentId} />
      </SidebarProvider>,
    );
  };
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const labels = () =>
    [...container.querySelectorAll("button[aria-label]")].map((element) =>
      element.getAttribute("aria-label"),
    );

  try {
    await act(async () => render());
    expect(labels().slice(0, 2)).toEqual(["Settings", "Code workspace · Switch to Work"]);
    expect(labels().slice(0, 5)).toEqual([
      "Settings",
      "Code workspace · Switch to Work",
      "Stats",
      "Switch to Thread view",
      "Pull Requests",
    ]);
    await act(async () => button("Code workspace · Switch to Work")!.click());
    await act(async () => render());
    expect(state.settings).toEqual({ workspaceMode: "work", legacySidebarEnabled: true });
    expect(button("Pull Requests")).toBeNull();
    expect(labels().slice(0, 4)).toEqual([
      "Settings",
      "Work workspace · Switch to Code",
      "Stats",
      "Switch to Thread view",
    ]);
    expect(button("Work workspace · Switch to Code")).not.toBeNull();
    await act(async () => button("Work workspace · Switch to Code")!.click());
    await act(async () => render());
    expect(button("Pull Requests")).not.toBeNull();
    await act(async () => button("Switch to Thread view")!.click());
    await act(async () => render());
    expect(state.settings.legacySidebarEnabled).toBe(false);
    expect(button("Switch to Project view")).not.toBeNull();
    expect(button("Switch to Thread view")).toBeNull();
    await act(async () => button("Switch to Project view")!.click());
    await act(async () => render());
    expect(state.settings.legacySidebarEnabled).toBe(true);

    await act(async () => button("Chats")!.click());
    expect(useUiStateStore.getState().projectExpandedById[RECENT_THREADS_EXPANSION_KEY]).toBe(
      false,
    );
    state.settings = { ...state.settings, legacySidebarEnabled: false };
    await act(async () => render());
    expect(button("Chats")!.getAttribute("aria-expanded")).toBe("false");
    state.settings = { ...state.settings, legacySidebarEnabled: true };
    await act(async () => render());

    await act(async () => button("New chat")!.click());
    expect(state.startScratchThread).toHaveBeenCalledWith(environmentId);
    expect(useUiStateStore.getState().projectExpandedById[RECENT_THREADS_EXPANSION_KEY]).toBe(true);
    state.connected = false;
    await act(async () => render());
    expect(button("New chat")!.disabled).toBe(true);
    await act(async () => button("New chat")!.click());
    expect(state.startScratchThread).toHaveBeenCalledTimes(1);

    for (const pathname of ["/settings", "/settings/appearance", "/projects/project-key"]) {
      state.pathname = pathname;
      await act(async () => render());
      expect(container.textContent).toContain("Back");
      expect(button("Code workspace · Switch to Work")).toBeNull();
      expect(button("Switch to Thread view")).toBeNull();
    }
    state.pathname = "/usage";
    await act(async () => render());
    expect(button("Settings")).not.toBeNull();
    expect(button("Code workspace · Switch to Work")).toBeNull();
    expect(button("Switch to Thread view")).toBeNull();
    state.pathname = "/";
    await act(async () => render());
    expect(button("Code workspace · Switch to Work")).not.toBeNull();
    expect(button("Switch to Thread view")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    useUiStateStore.setState({ projectExpandedById: originalProjectExpansion });
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("starts the new top-level chat in Chats and expands the section", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const original = useUiStateStore.getState().projectExpandedById;
  useUiStateStore.setState({ projectExpandedById: { [RECENT_THREADS_EXPANSION_KEY]: false } });
  state.connected = true;
  state.startScratchThread.mockReset();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <SidebarProvider>
          <SidebarNewChatButton />
        </SidebarProvider>,
      ),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="New chat"]')!.click(),
    );
    expect(state.startScratchThread).toHaveBeenCalledWith(EnvironmentId.make("local"));
    expect(useUiStateStore.getState().projectExpandedById[RECENT_THREADS_EXPANSION_KEY]).toBe(true);
    state.connected = false;
    await act(async () =>
      root.render(
        <SidebarProvider>
          <SidebarNewChatButton />
        </SidebarProvider>,
      ),
    );
    expect(container.querySelector<HTMLButtonElement>('[aria-label="New chat"]')!.disabled).toBe(
      true,
    );
  } finally {
    await act(async () => root.unmount());
    useUiStateStore.setState({ projectExpandedById: original });
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("opens search from its icon in each view and keeps the command shortcut available", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const openPalette = vi.fn();
  const keyDown = vi.fn();
  function Search() {
    const input = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    return (
      <SidebarThreadSearch
        searchInputRef={input}
        shortcutLabel="⌘K"
        searchQuery={query}
        onSearchQueryChange={setQuery}
        onSearchKeyDown={keyDown}
        isSearching={query.length > 0}
        searchResultCount={0}
        activeSearchResultIndex={0}
        onClearSearch={() => setQuery("")}
      />
    );
  }
  try {
    await act(async () =>
      root.render(
        <CommandDialog onOpenChange={openPalette}>
          <SidebarHeaderSearch shortcutLabel="⌘K" />
        </CommandDialog>,
      ),
    );
    const search = host.querySelector<HTMLButtonElement>('button[aria-label="Search"]')!;
    expect(search.textContent).toBe("");
    await act(async () => search.click());
    expect(openPalette.mock.calls.at(-1)?.[0]).toBe(true);
    await act(async () =>
      root.render(
        <CommandDialog onOpenChange={openPalette}>
          <Search />
        </CommandDialog>,
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Search threads"]')!.click(),
    );
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Search threads"]')!;
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "Friday",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("Friday");
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
    );
    expect(keyDown).toHaveBeenCalled();
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Clear thread search"]')!
        .click(),
    );
    expect(input.value).toBe("");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Open command palette"]')!.click(),
    );
    expect(openPalette.mock.calls.at(-1)?.[0]).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
