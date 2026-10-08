import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@elysiatools/contracts";
import { scopeThreadRef } from "@elysiatools/client-runtime/environment";
import { DraftId } from "../composerDraftStore";
import { useConversationTabsStore } from "../conversationTabsStore";
import { useArchivedConversationTabs } from "./useConversationTabNavigation";
import type { Project, SidebarThreadSummary } from "../types";
const state = vi.hoisted(() => ({
  projects: [] as Project[],
  threads: [] as SidebarThreadSummary[],
  pathname: "/",
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useLocation: ({ select }: { select: (location: { pathname: string }) => unknown }) =>
    select({ pathname: state.pathname }),
}));
vi.mock("../state/entities", () => ({
  useProjects: () => state.projects,
  useThreadShells: () => state.threads,
  readThreadShell: () => null,
  readProject: () => null,
}));
const env = EnvironmentId.make("environment");
const thread = (id: string, archived = false, environmentId = env) =>
  ({
    id: ThreadId.make(id),
    environmentId,
    projectId: ProjectId.make("project"),
    archivedAt: archived ? "2026-10-04T00:00:00Z" : null,
    deletedAt: null,
  }) as SidebarThreadSummary;
const target = (id: string, environmentId = env) => ({
  kind: "server" as const,
  threadRef: scopeThreadRef(environmentId, ThreadId.make(id)),
});
function Observer() {
  useArchivedConversationTabs();
  return null;
}
beforeEach(() => {
  state.projects = [];
  state.threads = [];
  state.navigate.mockClear();
  state.pathname = "/";
  useConversationTabsStore.setState({ tabs: [], activeId: null });
});
it("removes inactive archived tabs without changing the selected conversation or another environment", async () => {
  state.threads = [
    thread("one", true),
    thread("two"),
    thread("one", false, EnvironmentId.make("other")),
  ];
  const store = useConversationTabsStore.getState();
  store.open(target("one"));
  store.open(target("one", EnvironmentId.make("other")), true);
  store.open(target("two"), true);
  state.pathname = "/environment/two";
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<Observer />);
  });
  expect(useConversationTabsStore.getState().tabs.map((tab) => tab.target)).toEqual([
    target("one", EnvironmentId.make("other")),
    target("two"),
  ]);
  expect(state.navigate).not.toHaveBeenCalled();
  await act(async () => view.unmount());
});
it("closes the active first tab and selects a survivor, including agent-profile archives", async () => {
  state.threads = [thread("one"), thread("two")];
  state.projects = [
    {
      id: ProjectId.make("project"),
      environmentId: env,
      agentProfile: { archived: true },
    } as Project,
  ];
  const store = useConversationTabsStore.getState();
  store.open(target("one"));
  store.open({ kind: "draft", draftId: DraftId.make("draft") }, true);
  store.open(target("one"));
  state.pathname = "/environment/one";
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<Observer />);
  });
  expect(useConversationTabsStore.getState().tabs).toHaveLength(1);
  expect(state.navigate).toHaveBeenCalledWith(
    expect.objectContaining({ to: "/draft/$draftId", replace: true }),
  );
  await act(async () => view.unmount());
});
it("falls back to Workspace after the final tab archives, while leaving Settings in place", async () => {
  for (const pathname of ["/environment/one", "/settings"]) {
    state.navigate.mockClear();
    state.pathname = pathname;
    state.threads = [thread("one", true)];
    useConversationTabsStore.getState().open(target("one"));
    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(<Observer />);
    });
    expect(useConversationTabsStore.getState().tabs).toHaveLength(0);
    if (pathname === "/settings") expect(state.navigate).not.toHaveBeenCalled();
    else expect(state.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
    await act(async () => view.unmount());
  }
});
