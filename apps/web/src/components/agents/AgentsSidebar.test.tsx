// @vitest-environment jsdom
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { makeThreadFixture } from "../../test-fixtures";
import type { AgentRosterEntry } from "./useAgents";

const state = vi.hoisted(() => ({
  agents: [] as AgentRosterEntry[],
  active: "",
  routeListeners: new Set<() => void>(),
  previews: new Map<
    string,
    { projectId: ProjectId; threadId: ThreadId; text: string; updatedAt: string }
  >(),
  loading: false,
  failed: false,
  open: vi.fn(),
  archive: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("./useAgentConversationPreviews", () => ({
  useAgentConversationPreviews: () => ({
    previews: state.previews,
    loading: state.loading,
    failed: state.failed,
  }),
}));
vi.mock("./useAgents", () => ({ useAgents: () => state.agents }));
vi.mock("../../state/entities", () => ({ useAllEnvironmentProjectSnapshotsReady: () => true }));
vi.mock("./useAgentActions", () => ({
  useAgentActions: (agent: AgentRosterEntry) => ({
    pending: false,
    openConversation: () => state.open(agent),
    archive: state.archive,
  }),
}));
vi.mock("@tanstack/react-router", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useNavigate: () => state.navigate,
    useParams: () => ({
      environmentId: "local",
      threadId: useSyncExternalStore(
        (listener) => {
          state.routeListeners.add(listener);
          return () => state.routeListeners.delete(listener);
        },
        () => state.active,
      ),
    }),
  };
});
vi.mock("../sidebar/SidebarChrome", () => ({
  SidebarChromeHeader: ({ search }: { search?: ReactNode }) => (
    <div>
      <p>Elysia header</p>
      {search}
    </div>
  ),
  SidebarChromeFooter: () => <p>Elysia footer</p>,
  SidebarCommandShortcut: () => null,
}));
vi.mock("../ui/sidebar", () => ({
  SidebarContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useSidebar: () => ({ isMobile: false, setOpenMobile: vi.fn() }),
}));
vi.mock("./AgentGroupDialog", () => ({
  AgentGroupDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="New channel">
      <button onClick={onClose}>Cancel group</button>
    </div>
  ),
}));
import { AgentsSidebar } from "./AgentsSidebar";
import { closeAgentDialog, useAgentDialogStore } from "./agentDialogStore";
import { setAgentSidebarActive, useAgentSidebarStore } from "./agentSidebarStore";

function agent(name: string): AgentRosterEntry {
  const environmentId = EnvironmentId.make("local");
  const id = ProjectId.make(name);
  const threadId = ThreadId.make(`chat-${name}`);
  const date = "2026-10-03T12:00:00Z";
  return {
    project: {
      environmentId,
      id,
      title: name,
      workspaceRoot: `/agents/${name}`,
      repositoryIdentity: null,
      defaultModelSelection: null,
      scripts: [],
      createdAt: date,
      updatedAt: date,
      agentProfile: {
        title: "Researcher",
        instructions: "Research tasks",
        avatar: { preset: "brain", color: "#28B4FF" },
        archived: false,
        notificationsEnabled: true,
        conversationThreadId: threadId,
      },
    },
    thread: makeThreadFixture({
      environmentId,
      id: threadId,
      projectId: id,
      title: name,
      updatedAt: date,
    }),
    busy: false,
  };
}

it("opens an agent or group from the conversation roster, filters roles and creates from one New menu", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const alice = agent("Alice"),
    bob = agent("Bob"),
    baseGroup = agent("Team"),
    baseArchived = agent("Archived");
  const group = {
    ...baseGroup,
    project: {
      ...baseGroup.project,
      agentProfile: {
        ...baseGroup.project.agentProfile!,
        group: {
          memberProjectIds: [alice.project.id, bob.project.id],
          leadProjectId: alice.project.id,
        },
      },
    },
  };
  const archived = {
    ...baseArchived,
    project: {
      ...baseArchived.project,
      agentProfile: { ...baseArchived.project.agentProfile!, archived: true },
    },
  };
  state.agents = [bob, group, alice, archived];
  state.active = "";
  state.previews = new Map([
    [
      "local:Alice",
      {
        projectId: alice.project.id,
        threadId: alice.thread!.id,
        text: "Reviewing fresh source",
        updatedAt: "2026-10-05T12:00:00Z",
      },
    ],
  ]);
  state.open.mockImplementation(async (entry: AgentRosterEntry) => {
    state.active = entry.thread!.id;
    for (const listener of state.routeListeners) listener();
    return true;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    act(async () => {
      state.agents = [...state.agents];
      root.render(<AgentsSidebar />);
    });
  const click = (label: string) =>
    act(async () => {
      const target = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find(
        (el) => el.getAttribute("aria-label") === label || el.textContent?.trim() === label,
      )!;
      expect(target, label).toBeDefined();
      target.click();
    });
  try {
    await render();
    expect(host.textContent).toContain("Elysia header");
    expect(host.textContent).toContain("Elysia footer");
    expect(host.querySelector('[aria-label^="Open "]')?.getAttribute("aria-label")).toBe(
      "Open Alice chat",
    );
    expect(host.querySelector('[aria-label="Open Alice chat"]')?.textContent).toContain(
      "Reviewing fresh source",
    );
    expect(
      host.querySelector('[aria-label="Open Alice chat"] time')?.getAttribute("dateTime"),
    ).toBe("2026-10-05T12:00:00Z");
    expect(host.querySelector('[aria-label="Open Archived chat"]')).toBeNull();
    expect(
      host.querySelector('[aria-label="Open Team chat"]')?.querySelectorAll(".agent-avatar"),
    ).toHaveLength(2);
    await click("Open Alice chat");
    await render();
    expect(host.querySelector('[aria-label="Open Alice chat"]')?.getAttribute("aria-current")).toBe(
      "page",
    );
    expect(useAgentSidebarStore.getState().active).toBe(true);
    await click("Open Team chat");
    await render();
    expect(host.querySelector('[aria-label="Open Team chat"]')?.getAttribute("aria-current")).toBe(
      "page",
    );
    expect(host.querySelector('[aria-label="Search agents"]')).toBeNull();
    await click("Toggle agent search");
    const input = host.querySelector<HTMLInputElement>('[aria-label="Search agents"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "Researcher",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector('[aria-label="Open Alice chat"]')).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "Alice",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector('[aria-label="Open Team chat"]')).toBeNull();
    await click("Toggle agent search");
    expect(host.querySelector('[aria-label="Search agents"]')).toBeNull();
    expect(host.querySelector('[aria-label="Open Team chat"]')).not.toBeNull();
    await click("New agent, channel or section");
    await click("New channel");
    expect(useAgentDialogStore.getState().target).toEqual({ projectRef: null, channel: true });
    closeAgentDialog();
    await click("New agent, channel or section");
    await click("New agent");
    expect(useAgentDialogStore.getState().target).toEqual({ projectRef: null });
    state.previews.clear();
    state.loading = true;
    await render();
    expect(host.querySelector('[aria-label="Open Alice chat"]')?.textContent).toContain("Loading…");
    state.loading = false;
    state.failed = true;
    await render();
    expect(host.querySelector('[aria-label="Open Alice chat"]')?.textContent).toContain(
      "Preview unavailable",
    );
    state.failed = false;
    await render();
    expect(host.querySelector('[aria-label="Open Alice chat"]')?.textContent).toContain(
      "No messages yet",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    closeAgentDialog();
    setAgentSidebarActive(false);
    vi.unstubAllGlobals();
  }
});
