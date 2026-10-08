import { DEFAULT_RESOLVED_KEYBINDINGS } from "@elysiatools/shared/keybindings";
// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { RightPanelTabs } from "./RightPanelTabs";

vi.mock("~/hooks/useSettings", () => ({ useCodeWorkspace: () => true }));
vi.mock("~/hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("~/browser/browserDefaults", () => ({ useBrowserDefaults: () => ({ profiles: [] }) }));
vi.mock("~/state/entities", () => ({
  useProjects: () => [],
  useThreadShells: () => [],
  useServerConfigs: () => new Map(),
}));
vi.mock("./preview/PreviewPanelShell", () => ({
  PreviewPanelShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

it("moves the tab bar between header hosts without closing its menu or changing tab actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const previousGetAnimations = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "getAnimations",
  );
  Object.defineProperty(HTMLElement.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  const content = document.createElement("div");
  const firstHost = document.createElement("div");
  const secondHost = document.createElement("div");
  document.body.append(content, firstHost, secondHost);
  const root = createRoot(content);
  const agents = { id: "agents", kind: "agents" } as const;
  const sources = { id: "sources", kind: "sources" } as const;
  const onActivate = vi.fn();
  const onCloseSurface = vi.fn();
  const onAddSources = vi.fn();
  const render = (tabBarHost: HTMLElement) =>
    act(async () =>
      root.render(
        <RightPanelTabs
          mode="inline"
          keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
          getShortcutContext={() => ({
            terminalFocus: false,
            terminalOpen: false,
            previewFocus: false,
            previewOpen: false,
            isWeb: true,
            isDesktop: false,
          })}
          tabBarHost={tabBarHost}
          surfaces={[agents, sources]}
          environmentId={null}
          activeSurfaceId={agents.id}
          pendingSurfaceIds={new Set()}
          previewSessions={{}}
          desktopByTabId={{}}
          terminalLabelsById={new Map()}
          onActivate={onActivate}
          onCloseSurface={onCloseSurface}
          onCloseOtherSurfaces={() => {}}
          onCloseSurfacesToRight={() => {}}
          onCloseAllSurfaces={() => {}}
          onCopyFilePath={() => {}}
          onAddBrowser={() => {}}
          onAddBrowserInProfile={() => {}}
          onAddTerminal={() => {}}
          onAddDiff={() => {}}
          onAddFiles={() => {}}
          onAddSources={onAddSources}
          onAddPullRequest={() => {}}
          onAddPullRequests={() => {}}
          onAddAgents={() => {}}
          onAddDevice={() => {}}
          browserAvailable={false}
          terminalAvailable={false}
          diffAvailable={false}
          filesAvailable={false}
          sourcesAvailable
          pullRequestAvailable={false}
          pullRequestsAvailable={false}
          agentsAvailable
          deviceAvailable={false}
          liveAgentCount={0}
        >
          <p>Panel body</p>
        </RightPanelTabs>,
      ),
    );
  try {
    await render(firstHost);
    const toolbar = firstHost.querySelector<HTMLElement>("[data-right-panel-tabbar]")!;
    expect(toolbar).not.toBeNull();
    expect(content.textContent).toBe("Panel body");
    const add = toolbar.querySelector<HTMLButtonElement>('[aria-label="Add panel surface"]')!;
    await act(async () => add.click());
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await render(secondHost);
    expect(firstHost.querySelector("[data-right-panel-tabbar]")).toBeNull();
    expect(secondHost.querySelector("[data-right-panel-tabbar]")).toBe(toolbar);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    const addSource = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.includes("Sources"),
    )!;
    await act(async () => addSource.click());
    expect(onAddSources).toHaveBeenCalledOnce();
    const source = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Sources",
    )!;
    await act(async () => source.click());
    expect(onActivate).toHaveBeenCalledWith(sources);
    await act(async () =>
      toolbar.querySelector<HTMLButtonElement>('[aria-label="Close Sources"]')!.click(),
    );
    expect(onCloseSurface).toHaveBeenCalledWith(sources);
  } finally {
    await act(async () => root.unmount());
    expect(secondHost.childElementCount).toBe(0);
    content.remove();
    firstHost.remove();
    secondHost.remove();
    if (previousGetAnimations) {
      Object.defineProperty(HTMLElement.prototype, "getAnimations", previousGetAnimations);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
    }
    vi.unstubAllGlobals();
  }
});
