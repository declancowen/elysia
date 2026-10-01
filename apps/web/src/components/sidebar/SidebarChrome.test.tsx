// @vitest-environment jsdom
import { EnvironmentId } from "@t3tools/contracts";
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { SidebarProvider } from "../ui/sidebar";
import { RECENT_THREADS_EXPANSION_KEY, RecentThreadsHeader } from "./RecentThreadsHeader";
import { SidebarUtilityMenu } from "./SidebarChrome";
import { useUiStateStore } from "~/uiStateStore";

const state = vi.hoisted(() => ({
  pathname: "/",
  settings: { workspaceMode: "code" as "code" | "work", legacySidebarEnabled: true },
  connected: true,
  startScratchThread: vi.fn(),
  updateSettings: vi.fn(),
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
  useNavigate: () => vi.fn(),
  useLocation: (options: { select: (location: { pathname: string }) => unknown }) =>
    options.select({ pathname: useSyncExternalStore(subscribe, () => state.pathname) }),
  Link: () => null,
}));

vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({
    environments: [{ serverConfig: { environment: { capabilities: { pullRequests: true } } } }],
  }),
}));

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

it("keeps Work/Code beside Settings, preserves sidebar layout, and hides both switches in Settings", async () => {
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
    await act(async () => button("Code workspace · Switch to Work")!.click());
    await act(async () => render());
    expect(state.settings).toEqual({ workspaceMode: "work", legacySidebarEnabled: true });
    expect(button("Pull Requests")).toBeNull();
    expect(button("Work workspace · Switch to Code")).not.toBeNull();
    await act(async () => button("Work workspace · Switch to Code")!.click());
    await act(async () => render());
    expect(button("Pull Requests")).not.toBeNull();

    await act(async () => button("Recent threads")!.click());
    expect(useUiStateStore.getState().projectExpandedById[RECENT_THREADS_EXPANSION_KEY]).toBe(
      false,
    );
    state.settings = { ...state.settings, legacySidebarEnabled: false };
    await act(async () => render());
    expect(button("Recent threads")!.getAttribute("aria-expanded")).toBe("false");
    state.settings = { ...state.settings, legacySidebarEnabled: true };
    await act(async () => render());

    await act(async () => button("New thread without a project")!.click());
    expect(state.startScratchThread).toHaveBeenCalledWith(environmentId);
    expect(useUiStateStore.getState().projectExpandedById[RECENT_THREADS_EXPANSION_KEY]).toBe(true);
    state.connected = false;
    await act(async () => render());
    expect(button("New thread without a project")!.disabled).toBe(true);
    await act(async () => button("New thread without a project")!.click());
    expect(state.startScratchThread).toHaveBeenCalledTimes(1);

    for (const pathname of ["/settings", "/settings/appearance", "/projects/project-key"]) {
      state.pathname = pathname;
      await act(async () => render());
      expect(container.textContent).toContain("Back");
      expect(button("Code workspace · Switch to Work")).toBeNull();
      expect(button("Switch to flat sidebar")).toBeNull();
    }
    state.pathname = "/";
    await act(async () => render());
    expect(button("Code workspace · Switch to Work")).not.toBeNull();
    expect(button("Switch to flat sidebar")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    useUiStateStore.setState({ projectExpandedById: originalProjectExpansion });
    container.remove();
    vi.unstubAllGlobals();
  }
});
